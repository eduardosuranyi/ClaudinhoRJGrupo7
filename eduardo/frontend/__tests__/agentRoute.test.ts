import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.mock is hoisted above imports, but const declarations are not.
// vi.hoisted ensures mockCreate is initialized before the factory runs.
const mockCreate = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

import { POST } from '@/api/agent/route'
import { NextRequest } from 'next/server'

// Drain a SSE Response body into an array of parsed event objects
async function drainSSE(resp: Response): Promise<any[]> {
  const reader = resp.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const events: any[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const part of parts) {
      const line = part.trim()
      if (!line.startsWith('data: ')) continue
      try { events.push(JSON.parse(line.slice(6))) } catch { /* skip malformed */ }
    }
  }
  return events
}

function makeRequest(body: object): NextRequest {
  return new Request('http://localhost/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

function toolBlock(name: string, input: object, id: string) {
  return { type: 'tool_use', name, input, id }
}

function claudeResponse(content: any[], stop_reason = 'tool_use') {
  return { content, stop_reason }
}

// Minimal area satisfying buildAreaSummary's field accesses
const area = {
  id: 1,
  nome: 'Área Teste',
  stats: {
    crimes_total: 100,
    crimes_por_tipo: { roubo: 50, furto: 30 },
    pico_horario: 22,
    pct_noturno: 60,
    modus_operandi: { armado: 70 },
    denuncias_total: 20,
    fatores_urbanos_total: 15,
    cameras_total: 5,
    psr_total: 10,
  },
  score: {
    total: 75,
    breakdown: { mancha_criminal: 30, pico_horario: 12, fatores_urbanos: 20, dinamica: 10 },
  },
  top_trechos: [{ locf_norm: 'Rua A', total: 30, pico_hora: 22, lat: -22.9, lng: -43.2 }],
  dominio_territorial: [{ faccao: 'TCP' }],
  fatores_por_orgao: [{ orgao: 'SEOP', total: 8 }],
  identificacao: { dominio_principal: 'TCP' },
  relint: { full_text: 'Texto relint.' },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/agent — fluxo completo', () => {
  it('test_emits_thinking_before_each_claude_call', async () => {
    mockCreate.mockResolvedValueOnce(claudeResponse([
      toolBlock('complete_investigation', { summary: 'ok', key_findings: [], actions: [] }, 'tu_1'),
    ]))

    const resp = await POST(makeRequest({ area, messages: [] }))
    const events = await drainSSE(resp)

    const thinkingEvents = events.filter(e => e.type === 'thinking')
    expect(thinkingEvents.length).toBeGreaterThanOrEqual(1)
    expect(thinkingEvents[0].detail).toMatch(/Turno 1/)
  })

  it('test_tool_events_are_emitted_for_each_tool_block', async () => {
    mockCreate
      .mockResolvedValueOnce(claudeResponse([
        toolBlock('zoom_to_area', { area_id: 1 }, 'tu_zoom'),
        toolBlock('narrate', { step_title: 'Visão Geral', text: 'Análise.' }, 'tu_narrate'),
      ]))
      .mockResolvedValueOnce(claudeResponse([
        toolBlock('complete_investigation', { summary: 'ok', key_findings: [], actions: [] }, 'tu_done'),
      ]))

    const events = await drainSSE(await POST(makeRequest({ area, messages: [] })))

    const toolNames = events.filter(e => e.type === 'tool').map((e: any) => e.name)
    expect(toolNames).toContain('zoom_to_area')
    expect(toolNames).toContain('narrate')
    expect(toolNames).toContain('complete_investigation')
  })

  it('test_complete_event_contains_findings', async () => {
    const findings = {
      summary: 'Resumo final.',
      key_findings: ['100 crimes', 'pico às 22h'],
      actions: [{ prioridade: 1, urgencia: 'imediata', orgao: 'PM', tipo_recurso: 'viatura',
                  acao: 'Ronda', local: 'Rua A', evidencia: 'dados', prazo: '7 dias' }],
    }

    mockCreate.mockResolvedValueOnce(claudeResponse([
      toolBlock('complete_investigation', findings, 'tu_complete'),
    ]))

    const events = await drainSSE(await POST(makeRequest({ area, messages: [] })))

    const completeEvent = events.find(e => e.type === 'complete')
    expect(completeEvent).toBeTruthy()
    expect(completeEvent.findings.summary).toBe('Resumo final.')
    expect(completeEvent.findings.key_findings).toHaveLength(2)
    expect(events[events.length - 1].type).toBe('done')
  })
})

describe('POST /api/agent — checkpoint', () => {
  it('test_checkpoint_emits_pause_with_tool_use_id_and_messages_snapshot', async () => {
    const cpInput = {
      question: 'Deseja continuar?',
      options: ['Continuar análise', 'Ver detalhes'],
      reasoning: 'Análise inicial concluída',
    }

    mockCreate.mockResolvedValueOnce(claudeResponse([
      toolBlock('narrate', { step_title: 'Visão Geral', text: 'Texto.' }, 'tu_n'),
      toolBlock('checkpoint', cpInput, 'tu_cp'),
    ]))

    const events = await drainSSE(await POST(makeRequest({ area, messages: [] })))

    const pauseEvent = events.find(e => e.type === 'pause')
    expect(pauseEvent).toBeTruthy()
    expect(pauseEvent.checkpoint.tool_use_id).toBe('tu_cp')
    expect(pauseEvent.checkpoint.question).toBe('Deseja continuar?')
    expect(pauseEvent.checkpoint.options).toContain('Continuar análise')
    // messages snapshot must include the assistant turn
    expect(Array.isArray(pauseEvent.messages)).toBe(true)
    expect(pauseEvent.messages.length).toBeGreaterThan(1)
  })

  it('test_checkpoint_resume_inserts_tool_result_before_calling_model', async () => {
    const savedMessages = [
      { role: 'user', content: 'area summary' },
      { role: 'assistant', content: [toolBlock('checkpoint', {}, 'tu_cp')] },
    ]

    mockCreate.mockResolvedValueOnce(claudeResponse([
      toolBlock('complete_investigation', { summary: 'ok', key_findings: [], actions: [] }, 'tu_done'),
    ]))

    await POST(makeRequest({
      area,
      messages: savedMessages,
      checkpoint_tool_use_id: 'tu_cp',
      checkpoint_answer: 'Continuar análise',
    }))

    const callArgs = mockCreate.mock.calls[0][0]
    const lastMsg = callArgs.messages[callArgs.messages.length - 1]

    expect(lastMsg.role).toBe('user')
    expect(lastMsg.content[0].type).toBe('tool_result')
    expect(lastMsg.content[0].tool_use_id).toBe('tu_cp')

    const parsed = JSON.parse(lastMsg.content[0].content)
    expect(parsed.user_answer).toBe('Continuar análise')
  })

  it('test_checkpoint_resume_with_free_text_answer', async () => {
    const savedMessages = [{ role: 'user', content: 'area summary' }]

    mockCreate.mockResolvedValueOnce(claudeResponse([
      toolBlock('complete_investigation', { summary: 'ok', key_findings: [], actions: [] }, 'tu_done'),
    ]))

    await POST(makeRequest({
      area,
      messages: savedMessages,
      checkpoint_tool_use_id: 'tu_free',
      checkpoint_answer: 'Quero entender melhor o domínio do TCP',
    }))

    const lastMsg = mockCreate.mock.calls[0][0].messages.at(-1)
    const parsed = JSON.parse(lastMsg.content[0].content)
    expect(parsed.user_answer).toBe('Quero entender melhor o domínio do TCP')
  })
})

describe('POST /api/agent — limites e erros', () => {
  it('test_max_turns_stops_loop_at_12_and_emits_done', async () => {
    // Always returns a non-terminal tool — would loop forever without MAX_TURNS guard
    mockCreate.mockResolvedValue(claudeResponse([
      toolBlock('toggle_layer', { layer: 'crime', visible: true }, 'tu_loop'),
    ], 'tool_use'))

    const events = await drainSSE(await POST(makeRequest({ area, messages: [] })))

    expect(mockCreate).toHaveBeenCalledTimes(12)
    expect(events[events.length - 1].type).toBe('done')
  })

  it('test_sdk_error_emits_error_event_then_done', async () => {
    mockCreate.mockRejectedValueOnce(new Error('quota exceeded'))

    const events = await drainSSE(await POST(makeRequest({ area, messages: [] })))

    const errEvent = events.find(e => e.type === 'error')
    expect(errEvent).toBeTruthy()
    expect(errEvent.message).toBe('quota exceeded')
    // On error, the catch block closes the stream without a 'done' event
    expect(events.filter(e => e.type === 'error')).toHaveLength(1)
  })

  it('test_end_turn_stop_reason_exits_loop_cleanly', async () => {
    mockCreate.mockResolvedValueOnce(claudeResponse(
      [{ type: 'text', text: 'Análise concluída textualmente.' }],
      'end_turn',
    ))

    const events = await drainSSE(await POST(makeRequest({ area, messages: [] })))

    // Should not keep looping — Claude called exactly once
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(events[events.length - 1].type).toBe('done')
  })
})
