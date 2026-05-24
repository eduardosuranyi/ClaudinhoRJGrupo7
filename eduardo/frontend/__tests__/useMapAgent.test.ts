import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useMapAgent } from '@/hooks/useMapAgent'
import type { Area, MapControl } from '@/types'

// Build a ReadableStream that sends SSE events then closes
function makeSSEStream(events: object[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const e of events) {
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`))
      }
      ctrl.close()
    },
  })
}

function makeResponse(events: object[]): Response {
  return { ok: true, body: makeSSEStream(events) } as unknown as Response
}

const mapControl: MapControl = {
  toggleLayer: vi.fn(),
  zoomToArea: vi.fn(),
  addAnnotation: vi.fn(),
  clearAnnotations: vi.fn(),
  snapshotLayers: vi.fn().mockReturnValue({}),
  restoreLayers: vi.fn(),
}

const mockArea = { id: 1, nome: 'Área Teste' } as unknown as Area

const hookOpts = {
  mapControlRef: { current: mapControl } as React.MutableRefObject<MapControl | null>,
  setWeights: vi.fn(),
  setSelected: vi.fn(),
  getArea: vi.fn().mockReturnValue(mockArea),
}

beforeEach(() => {
  vi.clearAllMocks()
  global.fetch = vi.fn()
})

describe('useMapAgent — fluxo inicial', () => {
  it('test_startAgent_status_goes_running_then_paused', async () => {
    const checkpoint = {
      question: 'Deseja continuar?',
      options: ['Continuar análise', 'Ver detalhes'],
      reasoning: 'Análise inicial concluída',
      tool_use_id: 'tu_cp_1',
    }

    ;(global.fetch as any).mockResolvedValueOnce(makeResponse([
      { type: 'thinking', turn: 1, detail: 'Turno 1 — consultando modelo…' },
      { type: 'tool', name: 'zoom_to_area', input: { area_id: 1 }, id: 'tu_zoom' },
      { type: 'tool', name: 'narrate', input: { step_title: 'Visão Geral', text: 'Total: 100 ocorrências.' }, id: 'tu_narrate' },
      { type: 'pause', checkpoint, messages: [{ role: 'user', content: 'resumo' }] },
      { type: 'done' },
    ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('paused'))

    expect(result.current.agentState.pendingCheckpoint?.question).toBe('Deseja continuar?')
    expect(result.current.agentState.pendingCheckpoint?.tool_use_id).toBe('tu_cp_1')
    expect(result.current.agentState.thinkingDetail).toBeNull()

    const transcript = result.current.agentState.transcript
    expect(transcript.some(e => e.type === 'narrate' && e.content === 'Total: 100 ocorrências.')).toBe(true)
    expect(transcript.some(e => e.type === 'checkpoint_ask')).toBe(true)
  })

  it('test_startAgent_completes_without_checkpoint', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(makeResponse([
      {
        type: 'complete',
        findings: { summary: 'Investigação encerrada.', key_findings: ['Achado 1'], actions: [] },
      },
      { type: 'done' },
    ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('complete'))

    expect(result.current.agentState.findings?.summary).toBe('Investigação encerrada.')
    expect(result.current.agentState.thinkingDetail).toBeNull()
  })
})

describe('useMapAgent — respondToCheckpoint (bug do freeze)', () => {
  it('test_resume_calls_fetch_again_with_correct_payload', async () => {
    const savedMessages = [{ role: 'user', content: 'msg inicial' }]
    const checkpoint = {
      question: 'Deseja continuar?',
      options: ['Continuar análise'],
      reasoning: 'Pausa',
      tool_use_id: 'tu_cp_resume',
    }

    ;(global.fetch as any)
      .mockResolvedValueOnce(makeResponse([
        { type: 'pause', checkpoint, messages: savedMessages },
        { type: 'done' },
      ]))
      .mockResolvedValueOnce(makeResponse([
        { type: 'complete', findings: { summary: 'Concluído.', key_findings: [], actions: [] } },
        { type: 'done' },
      ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('paused'))

    await act(async () => { result.current.respondToCheckpoint('Continuar análise') })
    await waitFor(() => expect(result.current.agentState.status).toBe('complete'))

    // Segunda chamada deve ter o payload de resumo correto
    const [, secondCall] = (global.fetch as any).mock.calls
    const body = JSON.parse(secondCall[1].body)
    expect(body.checkpoint_tool_use_id).toBe('tu_cp_resume')
    expect(body.checkpoint_answer).toBe('Continuar análise')
    expect(body.messages).toEqual(savedMessages)
  })

  it('test_resume_with_free_text_answer', async () => {
    const checkpoint = {
      question: 'Deseja continuar?',
      options: ['Continuar análise'],
      reasoning: 'Pausa',
      tool_use_id: 'tu_cp_free',
    }

    ;(global.fetch as any)
      .mockResolvedValueOnce(makeResponse([
        { type: 'pause', checkpoint, messages: [] },
        { type: 'done' },
      ]))
      .mockResolvedValueOnce(makeResponse([
        { type: 'complete', findings: { summary: 'ok', key_findings: [], actions: [] } },
        { type: 'done' },
      ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('paused'))

    await act(async () => {
      result.current.respondToCheckpoint('Quero ver os dados de câmeras em detalhe')
    })
    await waitFor(() => expect(result.current.agentState.status).toBe('complete'))

    const body = JSON.parse((global.fetch as any).mock.calls[1][1].body)
    expect(body.checkpoint_answer).toBe('Quero ver os dados de câmeras em detalhe')

    // Entrada de resposta deve aparecer no transcript
    const answerEntry = result.current.agentState.transcript.find(e => e.type === 'checkpoint_answer')
    expect(answerEntry?.content).toBe('Quero ver os dados de câmeras em detalhe')
  })

  it('test_pendingCheckpoint_is_null_after_respond_fires', async () => {
    const checkpoint = {
      question: 'Q?', options: ['Continuar análise'], reasoning: 'r', tool_use_id: 'tu_x',
    }

    ;(global.fetch as any)
      .mockResolvedValueOnce(makeResponse([
        { type: 'pause', checkpoint, messages: [] },
        { type: 'done' },
      ]))
      .mockResolvedValueOnce(makeResponse([
        { type: 'complete', findings: { summary: 'ok', key_findings: [], actions: [] } },
        { type: 'done' },
      ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('paused'))

    await act(async () => { result.current.respondToCheckpoint('Continuar análise') })

    // Imediatamente após responder, pendingCheckpoint deve ser null (não freeze)
    await waitFor(() => expect(result.current.agentState.pendingCheckpoint).toBeNull())
    await waitFor(() => expect(result.current.agentState.status).toBe('complete'))
  })
})

describe('useMapAgent — error e abort', () => {
  it('test_stream_error_event_sets_error_status', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(makeResponse([
      { type: 'error', message: 'SDK falhou' },
    ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('error'))

    expect(result.current.agentState.error).toBe('SDK falhou')
  })

  it('test_fetch_rejection_sets_error_status', async () => {
    ;(global.fetch as any).mockRejectedValueOnce(new Error('network error'))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('error'))

    expect(result.current.agentState.error).toBe('network error')
  })

  it('test_network_error_retries_and_eventually_succeeds', async () => {
    vi.useFakeTimers()
    try {
      ;(global.fetch as any)
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce(makeResponse([
          { type: 'complete', findings: { summary: 'ok', key_findings: [], actions: [] } },
          { type: 'done' },
        ]))

      const { result } = renderHook(() => useMapAgent(hookOpts))

      act(() => { result.current.startAgent(mockArea) })
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })

      expect(result.current.agentState.status).toBe('complete')
      expect(result.current.agentState.transcript.some(e => e.type === 'error')).toBe(false)
      expect((global.fetch as any).mock.calls).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('test_network_error_exhausted_sets_error_status', async () => {
    vi.useFakeTimers()
    try {
      ;(global.fetch as any)
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))

      const { result } = renderHook(() => useMapAgent(hookOpts))

      act(() => { result.current.startAgent(mockArea) })
      await act(async () => { await vi.advanceTimersByTimeAsync(2500) })

      expect(result.current.agentState.status).toBe('error')
      expect(result.current.agentState.transcript.filter(e => e.type === 'error')).toHaveLength(1)
      expect((global.fetch as any).mock.calls).toHaveLength(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('test_semantic_error_no_retry', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(makeResponse([
      { type: 'error', message: 'limite de tokens excedido' },
    ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })
    await waitFor(() => expect(result.current.agentState.status).toBe('error'))

    expect(result.current.agentState.error).toBe('limite de tokens excedido')
    expect((global.fetch as any).mock.calls).toHaveLength(1)
  })

  it('test_abortAgent_resets_state_to_idle', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(makeResponse([
      { type: 'done' },
    ]))

    const { result } = renderHook(() => useMapAgent(hookOpts))

    await act(async () => { result.current.startAgent(mockArea) })

    act(() => { result.current.abortAgent() })

    expect(result.current.agentState.status).toBe('idle')
    expect(result.current.agentState.transcript).toHaveLength(0)
    expect(result.current.agentState.pendingCheckpoint).toBeNull()
  })
})
