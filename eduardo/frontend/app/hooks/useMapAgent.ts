'use client'

import { useState, useRef, useCallback } from 'react'
import type {
  Area,
  AgentState,
  AgentCheckpointData,
  AgentFindings,
  TranscriptEntry,
  MapControl,
} from '../types'

function uid() {
  return Math.random().toString(36).slice(2)
}

const TOOL_LABELS: Record<string, string> = {
  toggle_layer:           'Camada do mapa alterada',
  zoom_to_area:           'Navegando para a área',
  show_annotation:        'Marcador adicionado',
  update_weights:         'Pesos de score ajustados',
  narrate:                'Narrativa',
  checkpoint:             'Checkpoint',
  complete_investigation: 'Investigação concluída',
}

interface UseMapAgentOptions {
  mapControlRef: React.MutableRefObject<MapControl | null>
  setWeights: (w: { mancha: number; pico: number; fatores: number; dinamica: number }) => void
  setSelected: (area: Area | null) => void
  getArea: (id: number) => Area | undefined
}

export function useMapAgent({ mapControlRef, setWeights, setSelected, getArea }: UseMapAgentOptions) {
  const [agentState, setAgentState] = useState<AgentState>({
    status: 'idle',
    areaId: null,
    transcript: [],
    pendingCheckpoint: null,
    messages: [],
    findings: null,
    error: null,
  })

  const layerSnapshotRef = useRef<Record<string, boolean> | null>(null)
  const abortRef = useRef(false)

  const addEntry = useCallback((entry: Omit<TranscriptEntry, 'id'>) => {
    setAgentState(prev => ({
      ...prev,
      transcript: [...prev.transcript, { ...entry, id: uid() }],
    }))
  }, [])

  // Execute a single tool call on the map (with a small visual delay)
  const executeTool = useCallback((name: string, input: any) => {
    const ctrl = mapControlRef.current
    if (!ctrl) return

    switch (name) {
      case 'toggle_layer':
        ctrl.toggleLayer(input.layer, input.visible)
        break
      case 'zoom_to_area':
        ctrl.zoomToArea(input.area_id)
        // Also sync React selected state
        if (input.area_id) {
          const area = getArea(input.area_id)
          if (area) setSelected(area)
        }
        break
      case 'show_annotation':
        ctrl.addAnnotation(input.lat, input.lng, input.title, input.body)
        break
      case 'update_weights': {
        const current = { mancha: 40, pico: 15, fatores: 25, dinamica: 15 }
        setWeights({ ...current, ...input })
        break
      }
    }
  }, [mapControlRef, setWeights, setSelected, getArea])

  const processSSEStream = useCallback(async (
    area: Area,
    messages: any[],
    checkpointAnswer?: { tool_use_id: string; answer: string },
  ) => {
    abortRef.current = false

    const body: any = { area, messages }
    if (checkpointAnswer) {
      body.checkpoint_tool_use_id = checkpointAnswer.tool_use_id
      body.checkpoint_answer = checkpointAnswer.answer
    }

    const resp = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!resp.ok || !resp.body) {
      throw new Error(`HTTP ${resp.status}`)
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      if (abortRef.current) { reader.cancel(); break }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE lines end with \n\n
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        const line = part.trim()
        if (!line.startsWith('data: ')) continue

        const raw = line.slice(6)
        let event: any
        try { event = JSON.parse(raw) } catch { continue }

        if (abortRef.current) break

        switch (event.type) {
          case 'text':
            // Claude thinking text (usually empty with tool_use)
            break

          case 'tool': {
            const { name, input } = event
            // Execute map actions immediately
            executeTool(name, input)

            if (name === 'narrate') {
              addEntry({ type: 'narrate', content: input.text, stepTitle: input.step_title })
            } else if (name !== 'checkpoint' && name !== 'complete_investigation') {
              addEntry({
                type: 'tool_action',
                content: TOOL_LABELS[name] || name,
                stepTitle: input.step_title,
              })
            }
            break
          }

          case 'pause': {
            const cp: AgentCheckpointData = event.checkpoint
            addEntry({
              type: 'checkpoint_ask',
              content: cp.question,
              checkpoint: cp,
            })
            setAgentState(prev => ({
              ...prev,
              status: 'paused',
              pendingCheckpoint: cp,
              messages: event.messages,
            }))
            break
          }

          case 'complete': {
            const findings: AgentFindings = event.findings
            addEntry({ type: 'complete', content: findings.summary })
            setAgentState(prev => ({
              ...prev,
              status: 'complete',
              findings,
              pendingCheckpoint: null,
            }))
            break
          }

          case 'error':
            throw new Error(event.message)

          case 'done':
            // Stream closed normally
            break
        }
      }
    }
  }, [executeTool, addEntry])

  const startAgent = useCallback(async (area: Area) => {
    const ctrl = mapControlRef.current
    // Snapshot current layer state for restore on abort
    if (ctrl) layerSnapshotRef.current = ctrl.snapshotLayers()

    setAgentState({
      status: 'running',
      areaId: area.id,
      transcript: [{
        id: uid(),
        type: 'system',
        content: `Iniciando investigação: ${area.nome}`,
      }],
      pendingCheckpoint: null,
      messages: [],
      findings: null,
      error: null,
    })

    try {
      await processSSEStream(area, [])
    } catch (err: any) {
      if (abortRef.current) return
      addEntry({ type: 'error', content: err.message })
      setAgentState(prev => ({ ...prev, status: 'error', error: err.message }))
    }
  }, [mapControlRef, processSSEStream, addEntry])

  const respondToCheckpoint = useCallback(async (answer: string) => {
    setAgentState(prev => {
      if (!prev.pendingCheckpoint) return prev
      return {
        ...prev,
        status: 'running',
        pendingCheckpoint: null,
      }
    })

    addEntry({ type: 'checkpoint_answer', content: answer })

    // We need current agentState values — use functional update via ref trick
    setAgentState(prev => {
      const { areaId, messages, pendingCheckpoint } = prev
      if (!areaId || !pendingCheckpoint) return prev

      const area = getArea(areaId)
      if (!area) return { ...prev, status: 'error', error: 'Área não encontrada' }

      processSSEStream(area, messages, {
        tool_use_id: pendingCheckpoint.tool_use_id,
        answer,
      }).catch(err => {
        if (abortRef.current) return
        addEntry({ type: 'error', content: err.message })
        setAgentState(s => ({ ...s, status: 'error', error: err.message }))
      })

      return prev
    })
  }, [addEntry, processSSEStream, getArea])

  const abortAgent = useCallback(() => {
    abortRef.current = true
    const ctrl = mapControlRef.current
    if (ctrl) {
      ctrl.clearAnnotations()
      if (layerSnapshotRef.current) {
        ctrl.restoreLayers(layerSnapshotRef.current as any)
      }
    }
    setAgentState({
      status: 'idle',
      areaId: null,
      transcript: [],
      pendingCheckpoint: null,
      messages: [],
      findings: null,
      error: null,
    })
  }, [mapControlRef])

  return { agentState, startAgent, respondToCheckpoint, abortAgent }
}
