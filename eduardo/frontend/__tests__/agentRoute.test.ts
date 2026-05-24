import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock external modules before importing the route
const mockCreateAgentUIStreamResponse = vi.hoisted(() => vi.fn())
// Container so the hoisted mock can capture the most recent ToolLoopAgent settings
const agentSettingsRef = vi.hoisted(() => ({ current: null as unknown }))
const mockToolLoopAgent = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: unknown, settings: unknown) {
    agentSettingsRef.current = settings
    ;(this as Record<string, unknown>).settings = settings
  }),
)
const mockBuildAreaBrief = vi.hoisted(() => vi.fn())
const mockLoadOntologyEvents = vi.hoisted(() => vi.fn())

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return {
    ...actual,
    ToolLoopAgent: mockToolLoopAgent,
    createAgentUIStreamResponse: mockCreateAgentUIStreamResponse,
  }
})

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => ({ id: 'mock-model' })),
}))

vi.mock('@/lib/areaBrief', () => ({
  buildAreaBrief: mockBuildAreaBrief,
}))

vi.mock('@/lib/ontologyEvents', () => ({
  loadOntologyEventsForArea: mockLoadOntologyEvents,
}))

import { POST } from '@/api/agent/route'
import { NextRequest } from 'next/server'

const area = {
  id: 1,
  nome: 'Área Teste',
  stats: {
    crimes_total: 100,
    crimes_por_tipo: { roubo: 50, furto: 30 },
    pico_horario: '22h',
    pct_noturno: 60,
    modus_operandi: { armado: 70 },
    denuncias_total: 20,
    fatores_urbanos_total: 15,
    cameras_total: 5,
    psr_total: 10,
    hora_distribution: { '22': 20 },
    dia_distribution: { seg: 10 },
  },
  score: {
    total: 75,
    breakdown: { mancha_criminal: 30, pico_horario: 12, fatores_urbanos: 20, dinamica: 10, relint_bonus: 0 },
  },
  top_trechos: [
    {
      locf_norm: 'Rua A',
      total: 30,
      pico_hora: 22,
      lat: -22.9,
      lng: -43.2,
      roubo_transeunte: 10,
      roubo_celular: 5,
      roubo_coletivo: 3,
      bingo_count: 3,
      bingo_layers: { crime: true, fatores: true, sinais: true },
    },
    {
      locf_norm: 'Rua B',
      total: 15,
      pico_hora: 14,
      lat: -22.91,
      lng: -43.21,
      roubo_transeunte: 8,
      roubo_celular: 0,
      roubo_coletivo: 0,
      bingo_count: 1,
    },
  ],
  dominio_territorial: [{ faccao: 'TCP', nome: 'Setor Norte', geometry: {} }],
  fatores_por_orgao: [
    { orgao: 'SEOP', total: 8, tipos: [{ tipo: 'comercio_irregular', count: 5 }] },
    { orgao: 'RioLuz', total: 3, tipos: [] },
  ],
  identificacao: { dominio_principal: 'TCP', aisp: 1, risp: 1, base_fm: 'Central', subprefeitura: 'Centro' },
  relint: {
    full_text: 'Texto relint completo aqui.',
    sections: [
      { titulo: 'Modus Operandi', texto: 'Atuação noturna.' },
      { titulo: 'Rotas de fuga', texto: 'Pela rua Lateral.' },
    ],
  },
  relatos_sample: [
    { tipo: 'TRAFICO', data: '2024-01-01', bairro: 'Centro', logradouro: 'Rua A', relato: 'Tráfico na esquina', modus: ['armado'] },
    { tipo: 'ROUBO', data: '2024-02-01', bairro: 'Centro', logradouro: 'Rua B', relato: 'Roubo de celular', modus: ['celular'] },
  ],
  camera_gaps: {
    n_cameras: 3,
    coverage_radius_m: 100,
    cameras: [],
    gaps: [
      { rank: 1, lat: -22.9, lng: -43.2, uncovered_crimes: 30, nearest_camera_m: 250, recommendation: 'instalar', justification: 'Hotspot sem câmera' },
    ],
  },
  validacao_cruzada: [
    { orgao: 'RioLuz', fatores_campo: 10, chamados_1746: 200, chamados_atendidos: 80, chamados_vencidos: 50, validado: true },
  ],
  chamados_1746: {
    total: 500,
    pct_atendido: 60,
    pct_vencido: 20,
    por_tipo: [
      { tipo: 'Iluminação', orgao: 'RioLuz', total: 200, atendidos: 120, vencidos: 50 },
      { tipo: 'Lixo', orgao: 'COMLURB', total: 100, atendidos: 80, vencidos: 5 },
    ],
  },
  bairros_entorno: [{ nome: 'Centro', populacao: 30000, denuncias: 100, chamados_1746: 5000, geometry: {} }],
  evolucao_mensal: [{ mes: '2024-01', total: 10 }, { mes: '2024-02', total: 12 }],
  map_layers: { crime_points: [], fatores_points: [], cameras_points: [], psr_points: [] },
  n_bingo_trechos: 2,
  n_triple_bingo: 1,
  relint_disponivel: true,
  geometry: {},
} as any

function makeRequest(body: object): NextRequest {
  return new Request('http://localhost/api/agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest
}

beforeEach(() => {
  vi.clearAllMocks()
  mockToolLoopAgent.mockImplementation(function (this: unknown, settings: unknown) {
    agentSettingsRef.current = settings
    ;(this as Record<string, unknown>).settings = settings
  })
  mockBuildAreaBrief.mockReturnValue({
    text: 'Briefing da área',
    sources: {
      hasRelint: true,
      hasChamados1746: true,
      hasOntologyEvents: false,
      hasValidacaoCruzada: true,
      hasBairrosEntorno: true,
      trechosCount: 2,
      relatosCount: 2,
      cameraGapsCount: 1,
    },
  })
  mockLoadOntologyEvents.mockReturnValue([])
  mockCreateAgentUIStreamResponse.mockResolvedValue(new Response('ok'))
})

describe('POST /api/agent — first turn', () => {
  it('test_calls_buildAreaBrief_with_area', async () => {
    await POST(makeRequest({ messages: [], area }))
    expect(mockBuildAreaBrief).toHaveBeenCalledWith(area)
  })

  it('test_injects_area_context_as_first_message', async () => {
    mockBuildAreaBrief.mockReturnValue({ text: 'CONTEXTO DA ÁREA', sources: {} })
    await POST(makeRequest({ messages: [], area }))

    const callArgs = mockCreateAgentUIStreamResponse.mock.calls[0][0]
    expect(callArgs.uiMessages).toHaveLength(1)
    expect(callArgs.uiMessages[0].role).toBe('user')
    expect(callArgs.uiMessages[0].parts[0].text).toBe('CONTEXTO DA ÁREA')
  })

  it('test_calls_createAgentUIStreamResponse_with_agent', async () => {
    await POST(makeRequest({ messages: [], area }))
    expect(mockCreateAgentUIStreamResponse).toHaveBeenCalledOnce()
    expect(mockCreateAgentUIStreamResponse.mock.calls[0][0].agent).toBeDefined()
  })

  it('test_returns_400_without_area', async () => {
    const res = await POST(makeRequest({ messages: [] }))
    expect(res.status).toBe(400)
  })
})

describe('POST /api/agent — subsequent turns', () => {
  it('test_preserves_conversation_history_from_turn_2', async () => {
    const existingMessages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Resposta 1' }] },
      { id: 'u2', role: 'user', parts: [{ type: 'text', text: 'Me conta mais' }] },
    ]

    await POST(makeRequest({ messages: existingMessages, area }))

    const callArgs = mockCreateAgentUIStreamResponse.mock.calls[0][0]
    expect(callArgs.uiMessages[0].parts[0].text).toBe('Briefing da área')
    expect(callArgs.uiMessages).toHaveLength(3)
    expect(callArgs.uiMessages[2].parts[0].text).toBe('Me conta mais')
  })

  it('test_always_calls_buildAreaBrief', async () => {
    const messages = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: '' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Resposta' }] },
    ]
    await POST(makeRequest({ messages, area }))
    expect(mockBuildAreaBrief).toHaveBeenCalledWith(area)
  })
})

describe('POST /api/agent — ToolLoopAgent configuration', () => {
  beforeEach(async () => {
    // Force one POST so the agent is built and settings are captured per request
    await POST(makeRequest({ messages: [], area }))
  })

  it('test_agent_has_stopWhen_array_with_pause_and_complete', () => {
    const stopWhen = (agentSettingsRef.current as Record<string, unknown>).stopWhen
    expect(Array.isArray(stopWhen)).toBe(true)
    expect((stopWhen as unknown[]).length).toBe(2)
  })

  it('test_agent_has_pause_for_user_tool', () => {
    const tools = (agentSettingsRef.current as Record<string, unknown>).tools as Record<string, unknown>
    expect(tools).toHaveProperty('pause_for_user')
  })

  it('test_agent_has_all_map_and_query_tools', () => {
    const tools = (agentSettingsRef.current as Record<string, unknown>).tools as Record<string, unknown>
    // Map tools
    expect(tools).toHaveProperty('toggle_layer')
    expect(tools).toHaveProperty('zoom_to_area')
    expect(tools).toHaveProperty('show_annotation')
    expect(tools).toHaveProperty('update_weights')
    expect(tools).toHaveProperty('complete_investigation')
    expect(tools).toHaveProperty('pause_for_user')
    expect(tools).toHaveProperty('highlight_trecho')
    expect(tools).toHaveProperty('highlight_top_trechos')
    expect(tools).toHaveProperty('clear_highlights')
    expect(tools).toHaveProperty('focus_bairro')
    expect(tools).toHaveProperty('set_time_filter')
    expect(tools).toHaveProperty('show_route')
    // Query tools
    expect(tools).toHaveProperty('query_trechos')
    expect(tools).toHaveProperty('query_relatos_dd')
    expect(tools).toHaveProperty('query_chamados_1746')
    expect(tools).toHaveProperty('query_fatores')
    expect(tools).toHaveProperty('query_camera_gaps')
    expect(tools).toHaveProperty('validacao_cruzada')
    expect(tools).toHaveProperty('get_relint_section')
    expect(tools).toHaveProperty('evolucao_mensal')
    expect(tools).toHaveProperty('bairros_entorno')
    expect(tools).toHaveProperty('crimes_por_hora')
    expect(tools).toHaveProperty('ontology_events')
    // Removed
    expect(tools).not.toHaveProperty('checkpoint')
    expect(tools).not.toHaveProperty('narrate')
  })
})

describe('POST /api/agent — query tool execution against closed-over area', () => {
  async function getTools(): Promise<Record<string, { execute: (args: any) => Promise<any> }>> {
    await POST(makeRequest({ messages: [], area }))
    return (agentSettingsRef.current as any).tools
  }

  it('test_query_trechos_orders_by_total_by_default', async () => {
    const tools = await getTools()
    const result = await tools.query_trechos.execute({})
    expect(result.total_disponivel).toBe(2)
    expect(result.retornados[0].locf_norm).toBe('Rua A')
    expect(result.retornados[0].total).toBe(30)
  })

  it('test_query_trechos_bingo_only_filters', async () => {
    const tools = await getTools()
    const result = await tools.query_trechos.execute({ bingo_only: true })
    expect(result.retornados).toHaveLength(1)
    expect(result.retornados[0].locf_norm).toBe('Rua A')
  })

  it('test_query_relatos_dd_filters_by_contains', async () => {
    const tools = await getTools()
    const result = await tools.query_relatos_dd.execute({ contains: 'tráfico' })
    expect(result.retornados).toHaveLength(1)
    expect(result.retornados[0].tipo).toBe('TRAFICO')
  })

  it('test_query_chamados_1746_aggregates', async () => {
    const tools = await getTools()
    const result = await tools.query_chamados_1746.execute({})
    expect(result.total).toBe(500)
    expect(result.por_tipo).toHaveLength(2)
    expect(result.por_tipo[0].tipo).toBe('Iluminação')
  })

  it('test_query_chamados_1746_filters_by_orgao', async () => {
    const tools = await getTools()
    const result = await tools.query_chamados_1746.execute({ orgao: 'comlurb' })
    expect(result.por_tipo).toHaveLength(1)
    expect(result.por_tipo[0].orgao).toBe('COMLURB')
  })

  it('test_get_relint_section_returns_titles_when_no_filter', async () => {
    const tools = await getTools()
    const result = await tools.get_relint_section.execute({})
    expect(result.disponivel).toBe(true)
    expect(result.titulos).toContain('Modus Operandi')
    expect(result.titulos).toContain('Rotas de fuga')
  })

  it('test_get_relint_section_returns_specific_section', async () => {
    const tools = await getTools()
    const result = await tools.get_relint_section.execute({ titulo: 'fuga' })
    expect(result.encontrada).toBe(true)
    expect(result.titulo).toBe('Rotas de fuga')
    expect(result.texto).toBe('Pela rua Lateral.')
  })

  it('test_validacao_cruzada_returns_data_when_available', async () => {
    const tools = await getTools()
    const result = await tools.validacao_cruzada.execute({})
    expect(result.disponivel).toBe(true)
    expect(result.por_orgao[0].orgao).toBe('RioLuz')
  })

  it('test_bairros_entorno_returns_summary', async () => {
    const tools = await getTools()
    const result = await tools.bairros_entorno.execute({})
    expect(result.disponivel).toBe(true)
    expect(result.bairros[0].nome).toBe('Centro')
  })

  it('test_crimes_por_hora_returns_distribution', async () => {
    const tools = await getTools()
    const result = await tools.crimes_por_hora.execute({})
    expect(result.pico_horario).toBe('22h')
    expect(result.por_hora).toEqual({ '22': 20 })
  })

  it('test_ontology_events_returns_disponivel_false_when_empty', async () => {
    const tools = await getTools()
    const result = await tools.ontology_events.execute({})
    expect(result.disponivel).toBe(false)
  })
})
