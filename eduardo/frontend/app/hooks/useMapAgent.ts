'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, isToolUIPart, getToolName } from 'ai'
import type { Area, AgentFindings, AgentLayerKey, MapControl } from '../types'

function getString(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`Expected string for ${field}, got ${typeof v}`)
  return v
}

function getNumber(v: unknown, field: string): number {
  if (typeof v !== 'number') throw new Error(`Expected number for ${field}, got ${typeof v}`)
  return v
}

function isAgentFindings(v: unknown): v is AgentFindings {
  if (typeof v !== 'object' || v === null) return false
  const obj = v as Record<string, unknown>
  return typeof obj.summary === 'string' && Array.isArray(obj.key_findings) && Array.isArray(obj.actions)
}

interface UseMapAgentOptions {
  mapControlRef: React.MutableRefObject<MapControl | null>
  setWeights: (w: { mancha: number; pico: number; fatores: number; dinamica: number }) => void
  setSelected: (area: Area | null) => void
  getArea: (id: number) => Area | undefined
}

// Pure function — easy to unit test
export function executeMapTool(
  toolName: string,
  input: Record<string, unknown>,
  deps: {
    ctrl: MapControl
    setWeights: UseMapAgentOptions['setWeights']
    setSelected: UseMapAgentOptions['setSelected']
    getArea: UseMapAgentOptions['getArea']
  },
): void {
  const { ctrl, setWeights, setSelected, getArea } = deps
  switch (toolName) {
    case 'toggle_layer':
      ctrl.toggleLayer(getString(input.layer, 'layer') as AgentLayerKey, input.visible === true)
      break
    case 'zoom_to_area': {
      const areaId = getNumber(input.area_id, 'area_id')
      ctrl.zoomToArea(areaId)
      const area = getArea(areaId)
      if (area) setSelected(area)
      break
    }
    case 'show_annotation':
      ctrl.addAnnotation(
        getNumber(input.lat, 'lat'),
        getNumber(input.lng, 'lng'),
        getString(input.title, 'title'),
        getString(input.body, 'body'),
      )
      break
    case 'update_weights': {
      const defaults = { mancha: 40, pico: 15, fatores: 25, dinamica: 15 }
      const patch: Partial<typeof defaults> = {}
      if (typeof input.mancha === 'number') patch.mancha = input.mancha
      if (typeof input.pico === 'number') patch.pico = input.pico
      if (typeof input.fatores === 'number') patch.fatores = input.fatores
      if (typeof input.dinamica === 'number') patch.dinamica = input.dinamica
      setWeights({ ...defaults, ...patch })
      break
    }
    case 'highlight_trecho': {
      const locf = getString(input.locf_norm, 'locf_norm')
      const color = typeof input.color === 'string' ? input.color : undefined
      const label = typeof input.label === 'string' ? input.label : undefined
      ctrl.highlightTrecho(locf, { color, label })
      break
    }
    case 'highlight_top_trechos':
      ctrl.highlightTopTrechos(getNumber(input.n, 'n'))
      break
    case 'clear_highlights':
      ctrl.clearHighlights()
      break
    case 'focus_bairro':
      ctrl.focusBairro(getString(input.nome, 'nome'))
      break
    case 'set_time_filter': {
      const hi = input.hora_inicio
      const hf = input.hora_fim
      ctrl.setTimeFilter(
        typeof hi === 'number' ? hi : null,
        typeof hf === 'number' ? hf : null,
      )
      break
    }
    case 'show_route': {
      const fromLat = getNumber(input.from_lat, 'from_lat')
      const fromLng = getNumber(input.from_lng, 'from_lng')
      const toLat = getNumber(input.to_lat, 'to_lat')
      const toLng = getNumber(input.to_lng, 'to_lng')
      const label = typeof input.label === 'string' ? input.label : undefined
      ctrl.showRoute([fromLng, fromLat], [toLng, toLat], label)
      break
    }
  }
}

export function useMapAgent({
  mapControlRef,
  setWeights,
  setSelected,
  getArea,
}: UseMapAgentOptions) {
  const [currentArea, setCurrentArea] = useState<Area | null>(null)
  const [findings, setFindings] = useState<AgentFindings | null>(null)
  const [nextSuggestions, setNextSuggestions] = useState<string[] | null>(null)
  const areaRef = useRef<Area | null>(null)
  const layerSnapshotRef = useRef<Record<AgentLayerKey, boolean> | null>(null)
  const processedToolCallIds = useRef(new Set<string>())

  const transport = useRef(new DefaultChatTransport({ api: '/api/agent' }))

  const { messages, sendMessage: _sendMessage, stop, status, setMessages } = useChat({
    transport: transport.current,
  })

  // Clear pause suggestions when the agent starts producing the next step
  useEffect(() => {
    if (status === 'submitted' || status === 'streaming') {
      setNextSuggestions(null)
    }
  }, [status])

  // Wrap sendMessage to always include area in body
  const sendMessage = useCallback(
    (message: Parameters<typeof _sendMessage>[0], opts: Parameters<typeof _sendMessage>[1] = {}) => {
      const existingBody = (opts != null && typeof opts === 'object' && 'body' in opts && typeof opts.body === 'object')
        ? (opts.body as Record<string, unknown> ?? {})
        : {}
      return _sendMessage(message, {
        ...opts,
        body: { ...existingBody, area: areaRef.current },
      })
    },
    [_sendMessage],
  )

  // Watch messages for completed tool invocations and execute map operations
  useEffect(() => {
    const ctrl = mapControlRef.current
    if (!ctrl) return

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      // The AI SDK's message.parts type is not fully exposed; casts below are unavoidable workarounds.
      for (const part of (msg.parts ?? []) as unknown[]) {
        if (!isToolUIPart(part as never)) continue
        const typedPart = part as { state: string; toolCallId: string; input?: unknown; output?: unknown }
        if (typedPart.state !== 'output-available') continue
        const { toolCallId } = typedPart
        if (processedToolCallIds.current.has(toolCallId)) continue
        processedToolCallIds.current.add(toolCallId)

        const toolName = getToolName(part as never)
        const toolInput = (typedPart.input ?? {}) as Record<string, unknown>

        if (toolName === 'complete_investigation') {
          if (isAgentFindings(toolInput)) setFindings(toolInput)
        } else if (toolName === 'pause_for_user') {
          const ns = (toolInput as { next_suggestions?: unknown }).next_suggestions
          if (Array.isArray(ns)) {
            setNextSuggestions(ns.filter((s): s is string => typeof s === 'string'))
          }
        } else {
          executeMapTool(toolName, toolInput, {
            ctrl,
            setWeights,
            setSelected,
            getArea,
          })
        }
      }
    }
  }, [messages, mapControlRef, setWeights, setSelected, getArea])

  const startAgent = useCallback(
    async (area: Area) => {
      areaRef.current = area
      setCurrentArea(area)
      setFindings(null)
      setNextSuggestions(null)
      processedToolCallIds.current = new Set()
      setMessages([])

      const ctrl = mapControlRef.current
      if (ctrl) layerSnapshotRef.current = ctrl.snapshotLayers()

      // Send empty trigger — server will use area from body to build the real context
      await sendMessage({ text: '' })
    },
    [sendMessage, mapControlRef, setMessages],
  )

  const abortAgent = useCallback(async () => {
    await stop()
    setMessages([])
    setCurrentArea(null)
    setFindings(null)
    setNextSuggestions(null)
    processedToolCallIds.current = new Set()
    areaRef.current = null

    const ctrl = mapControlRef.current
    if (ctrl) {
      ctrl.clearAnnotations()
      ctrl.clearHighlights()
      ctrl.setTimeFilter(null, null)
      if (layerSnapshotRef.current) ctrl.restoreLayers(layerSnapshotRef.current)
    }
    layerSnapshotRef.current = null
  }, [stop, setMessages, mapControlRef])

  return {
    messages,
    status,
    findings,
    areaId: currentArea?.id ?? null,
    isActive: currentArea !== null,
    isPaused: nextSuggestions !== null,
    nextSuggestions,
    sendMessage,
    startAgent,
    abortAgent,
  }
}
