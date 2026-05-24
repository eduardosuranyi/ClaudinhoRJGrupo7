'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
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

class AgentError extends Error {}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts: number,
  onRetry: () => void,
): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn() }
    catch (err) {
      const retriable = err instanceof TypeError || (err as any)?.status >= 500
      if (!retriable || i >= attempts - 1) throw err
      onRetry()
      await new Promise(r => setTimeout(r, 800 * (i + 1)))
    }
  }
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
    thinkingDetail: null,
  })

  const agentStateRef = useRef(agentState)
  useEffect(() => { agentStateRef.current = agentState }, [agentState])

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

    const resp = await withRetry(
      async () => {
        const r = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!r.ok || !r.body) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status })
        return r
      },
      3,
      () => addEntry({ type: 'tool_action', content: 'reconectando…' }),
    )

    const reader = resp.body!.getReader()
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

          case 'thinking':
            setAgentState(prev => ({ ...prev, thinkingDetail: event.detail }))
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
              thinkingDetail: null,
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
              thinkingDetail: null,
            }))
            break
          }

          case 'error':
            throw new AgentError(event.message)

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
      thinkingDetail: null,
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
    // Read state synchronously from ref BEFORE any setAgentState call.
    // If we read from `agentState` closure or a functional updater after clearing
    // pendingCheckpoint, React batching would already have it as null.
    const { areaId, messages, pendingCheckpoint } = agentStateRef.current
    if (!areaId || !pendingCheckpoint) return

    const area = getArea(areaId)
    if (!area) {
      setAgentState(prev => ({ ...prev, status: 'error', error: 'Área não encontrada' }))
      return
    }

    // Single batch: clear checkpoint, set running, add transcript entry
    setAgentState(prev => ({
      ...prev,
      status: 'running',
      pendingCheckpoint: null,
      thinkingDetail: null,
      transcript: [...prev.transcript, { id: uid(), type: 'checkpoint_answer', content: answer }],
    }))

    processSSEStream(area, messages, {
      tool_use_id: pendingCheckpoint.tool_use_id,
      answer,
    }).catch(err => {
      if (abortRef.current) return
      addEntry({ type: 'error', content: err.message })
      setAgentState(s => ({ ...s, status: 'error', error: err.message }))
    })
  }, [getArea, processSSEStream, addEntry])

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
      thinkingDetail: null,
    })
  }, [mapControlRef])

  return { agentState, startAgent, respondToCheckpoint, abortAgent }
}
