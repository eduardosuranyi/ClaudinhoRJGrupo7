import { ToolLoopAgent, createAgentUIStreamResponse, hasToolCall, tool, generateId } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import type { Area } from '../../types'
import { buildAreaBrief } from '../../lib/areaBrief'
import { loadOntologyEventsForArea } from '../../lib/ontologyEvents'

const SYSTEM_PROMPT = `Você é um analista investigativo de segurança pública municipal do Rio guiando outro analista pelo mapa CompStat. Você fala devagar, em ETAPAS curtas, mostrando uma coisa de cada vez.

═══ FLUXO PASSO-A-PASSO (regra mais importante) ═══

A cada turno você executa UM passo pequeno e PARA. Estrutura de um passo:
  1. Texto curto: 1-3 frases. Diga o que vai mostrar e por quê.
  2. 1-2 tools de MAPA (highlight_trecho, focus_bairro, set_time_filter, toggle_layer, show_annotation, etc.) — visualize o que está dizendo.
  3. Opcional: 1 tool de QUERY se precisar de dado específico pro próximo passo.
  4. OBRIGATÓRIO: terminar chamando pause_for_user com 2–4 sugestões clicáveis curtas de próximos passos.

NÃO despeje análise gigante. NÃO chame mais de 4 tools antes de pausar. NÃO encerre tudo de uma vez. O analista controla o ritmo — você guia, ele decide.

═══ MODO TOUR (padrão ao iniciar) ═══

Quando a conversa começa (só tem o briefing da área), proponha um tour. Comece pelo essencial — overview da área + score — e pause. Daí, conforme o usuário avança, vá fundo: pico horário → top trechos (destaque ruas) → fatores urbanos × 1746 (cruzamento) → câmeras e pontos cegos → RELINT (se houver) → bairros do entorno → ações sugeridas. Não é roteiro fixo: deixe os dados guiarem (ex.: se RELINT existe e cita uma rua, abra a seção e destaque a rua).

═══ MODO LIVRE (quando o usuário pede algo específico) ═══

Se o analista perguntar algo direto ("qual rua mais perigosa à noite?"), responda em UM passo: tools de query + mapa para visualizar + pause_for_user com sugestões contextuais (incluir "continuar o tour" e "concluir investigação" quando fizer sentido).

═══ FINALIZAÇÃO ═══

Só chame complete_investigation quando o analista pedir explicitamente para encerrar/concluir/fechar — nunca por iniciativa própria.

═══ ESTILO ═══

- Português direto, frases curtas. "Crimes", não "ocorrências". "Grupos armados", não "facções" em contexto público.
- Quando citar número, traduza ("6 em cada 10 crimes à noite").
- NÃO afirme números de cor. Use query_* antes de afirmar.

═══ REGRAS FUNDAMENTAIS ═══

- Disque Denúncia (DD) ≠ Chamados 1746. NUNCA some. DD = denúncia ANÔNIMA de CRIME → polícia. 1746 = SERVIÇO PÚBLICO → Prefeitura.
- Correlação ≠ causalidade. Use "associado a", "coincide com" — nunca "causa".
- Dados refletem 30-50% dos roubos reais (subnotificação). Mencione quando relevante.
- Pop. flutuante (Centro/Botafogo): crime per capita engana.
- PSR → SMAS (assistência social), NUNCA repressão policial.
- RELINT e domínio territorial são CLASSIFICADOS — cite conclusões, não reproduza literalmente.

═══ TOOLS ═══

Query (puxam dados): query_trechos, query_relatos_dd, query_chamados_1746, query_fatores, query_camera_gaps, validacao_cruzada, get_relint_section, evolucao_mensal, bairros_entorno, crimes_por_hora, ontology_events.

Mapa (visualizam): toggle_layer, zoom_to_area, show_annotation, highlight_trecho, highlight_top_trechos, clear_highlights, focus_bairro, set_time_filter, show_route, update_weights.

Controle: pause_for_user (SEMPRE no fim do passo), complete_investigation (só quando pedido).`

const COMMON_DESC = 'Limites: até 50 resultados por chamada. Use filtros para focar.'

// ─── Local helpers for query tools ────────────────────────────────────────────
function clampLimit(n: number | undefined, max: number = 50): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return max
  return Math.min(Math.floor(n), max)
}

function lower(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase()
}

function buildAgent(area: Area) {
  return new ToolLoopAgent({
    model: anthropic('claude-sonnet-4-6'),
    instructions: SYSTEM_PROMPT,
    stopWhen: [hasToolCall('pause_for_user'), hasToolCall('complete_investigation')],
    tools: {
      // ═══════════════════════════ QUERY TOOLS (server-only, no client effect) ═════
      query_trechos: tool({
        description: `Lista trechos críticos (ruas) da área, filtráveis. ${COMMON_DESC}`,
        inputSchema: z.object({
          orderBy: z.enum(['total', 'bingo', 'pico_hora']).optional(),
          limit: z.number().int().optional(),
          bingo_only: z.boolean().optional().describe('Apenas trechos com bingo_count>=2'),
          hora: z.number().int().min(0).max(23).optional().describe('Filtra por hora de pico'),
          tipo: z.enum(['transeunte', 'celular', 'coletivo']).optional(),
        }),
        execute: async ({ orderBy = 'total', limit, bingo_only, hora, tipo }) => {
          let rows = area.top_trechos.slice()
          if (bingo_only) rows = rows.filter(t => (t.bingo_count ?? 0) >= 2)
          if (typeof hora === 'number') rows = rows.filter(t => t.pico_hora === hora)
          if (tipo === 'transeunte') rows = rows.filter(t => t.roubo_transeunte > 0)
          if (tipo === 'celular') rows = rows.filter(t => t.roubo_celular > 0)
          if (tipo === 'coletivo') rows = rows.filter(t => t.roubo_coletivo > 0)
          if (orderBy === 'bingo') rows.sort((a, b) => (b.bingo_count ?? 0) - (a.bingo_count ?? 0))
          else if (orderBy === 'pico_hora') rows.sort((a, b) => a.pico_hora - b.pico_hora)
          else rows.sort((a, b) => b.total - a.total)
          return {
            total_disponivel: area.top_trechos.length,
            retornados: rows.slice(0, clampLimit(limit)).map(t => ({
              locf_norm: t.locf_norm,
              total: t.total,
              pico_hora: t.pico_hora,
              roubo_transeunte: t.roubo_transeunte,
              roubo_celular: t.roubo_celular,
              roubo_coletivo: t.roubo_coletivo,
              bingo_count: t.bingo_count ?? 0,
              bingo_layers: t.bingo_layers,
              lat: t.lat,
              lng: t.lng,
              tem_geometria_linha: !!t.line_geometry,
            })),
          }
        },
      }),

      query_relatos_dd: tool({
        description: `Busca em relatos do Disque Denúncia (denúncia ANÔNIMA de crime — não confundir com 1746). ${COMMON_DESC}`,
        inputSchema: z.object({
          tipo: z.string().optional().describe('Filtra por substring no campo tipo (ex.: "trafico")'),
          contains: z.string().optional().describe('Substring no texto do relato'),
          logradouro: z.string().optional().describe('Substring no logradouro'),
          limit: z.number().int().optional(),
        }),
        execute: async ({ tipo, contains, logradouro, limit }) => {
          const t = lower(tipo)
          const c = lower(contains)
          const lg = lower(logradouro)
          const rows = (area.relatos_sample ?? []).filter(r => {
            if (t && !lower(r.tipo).includes(t)) return false
            if (c && !lower(r.relato).includes(c)) return false
            if (lg && !lower(r.logradouro).includes(lg)) return false
            return true
          })
          return {
            total_disponivel: area.relatos_sample?.length ?? 0,
            retornados: rows.slice(0, clampLimit(limit, 20)).map(r => ({
              tipo: r.tipo,
              data: r.data,
              bairro: r.bairro,
              logradouro: r.logradouro,
              relato: r.relato,
              modus: r.modus,
              perfil_suspeito: r.perfil_suspeito,
            })),
          }
        },
      }),

      query_chamados_1746: tool({
        description: `Chamados de SERVIÇO PÚBLICO (1746 — não confundir com DD). Agregados por tipo/órgão. ${COMMON_DESC}`,
        inputSchema: z.object({
          tipo: z.string().optional(),
          orgao: z.string().optional(),
          vencidos_only: z.boolean().optional(),
          limit: z.number().int().optional(),
        }),
        execute: async ({ tipo, orgao, vencidos_only, limit }) => {
          const ch = area.chamados_1746
          if (!ch) return { disponivel: false, mensagem: 'Sem dados 1746 nesta área.' }
          let rows = ch.por_tipo.slice()
          if (tipo) rows = rows.filter(r => lower(r.tipo).includes(lower(tipo)))
          if (orgao) rows = rows.filter(r => lower(r.orgao).includes(lower(orgao)))
          if (vencidos_only) rows = rows.filter(r => (r.vencidos ?? 0) > 0)
          rows.sort((a, b) => b.total - a.total)
          return {
            total: ch.total,
            pct_atendido: ch.pct_atendido,
            pct_vencido: ch.pct_vencido,
            com_coordenadas: ch.com_coordenadas,
            por_tipo: rows.slice(0, clampLimit(limit, 30)),
            evolucao_mensal_disponivel: !!ch.evolucao_mensal,
          }
        },
      }),

      query_fatores: tool({
        description: 'Fatores urbanos de campo agrupados por órgão (snapshot 2026). Use validacao_cruzada para comparar com 1746.',
        inputSchema: z.object({
          orgao: z.string().optional(),
        }),
        execute: async ({ orgao }) => {
          let rows = area.fatores_por_orgao.slice()
          if (orgao) rows = rows.filter(r => lower(r.orgao).includes(lower(orgao)))
          rows.sort((a, b) => b.total - a.total)
          return {
            total_fatores: area.stats.fatores_urbanos_total,
            por_orgao: rows.map(r => ({
              orgao: r.orgao,
              total: r.total,
              top_tipos: r.tipos.slice(0, 5),
            })),
          }
        },
      }),

      query_camera_gaps: tool({
        description: 'Pontos cegos de câmera (lugares com crime e sem cobertura próxima).',
        inputSchema: z.object({
          top: z.number().int().optional(),
        }),
        execute: async ({ top }) => {
          const gaps = area.camera_gaps?.gaps ?? []
          return {
            n_cameras_existentes: area.camera_gaps?.n_cameras ?? 0,
            coverage_radius_m: area.camera_gaps?.coverage_radius_m ?? 0,
            total_gaps: gaps.length,
            top: gaps.slice(0, clampLimit(top, 20)),
          }
        },
      }),

      validacao_cruzada: tool({
        description: 'Por órgão: fatores observados em campo × chamados 1746 atendidos/vencidos. Identifica órgãos com problema crônico.',
        inputSchema: z.object({
          orgao: z.string().optional(),
        }),
        execute: async ({ orgao }) => {
          const vc = area.validacao_cruzada ?? []
          let rows = vc.slice()
          if (orgao) rows = rows.filter(r => lower(r.orgao).includes(lower(orgao)))
          return {
            disponivel: vc.length > 0,
            por_orgao: rows,
          }
        },
      }),

      get_relint_section: tool({
        description: 'Retorna uma seção específica do RELINT, ou a lista de títulos se nenhum título for passado. Conteúdo classificado.',
        inputSchema: z.object({
          titulo: z.string().optional().describe('Substring do título da seção'),
        }),
        execute: async ({ titulo }) => {
          if (!area.relint?.full_text) return { disponivel: false }
          const sections = area.relint.sections ?? []
          if (!titulo) {
            return {
              disponivel: true,
              n_sections: sections.length,
              titulos: sections.map(s => s.titulo),
              full_length_chars: area.relint.full_text.length,
            }
          }
          const t = lower(titulo)
          const found = sections.find(s => lower(s.titulo).includes(t))
          if (!found) return { disponivel: true, encontrada: false, titulos: sections.map(s => s.titulo) }
          return { disponivel: true, encontrada: true, titulo: found.titulo, texto: found.texto }
        },
      }),

      evolucao_mensal: tool({
        description: 'Série temporal mensal de crimes na área.',
        inputSchema: z.object({
          window: z.number().int().optional().describe('Últimos N meses (default 24)'),
        }),
        execute: async ({ window }) => {
          const w = clampLimit(window ?? 24, 60)
          const series = (area.evolucao_mensal ?? []).slice(-w)
          return {
            total_meses: area.evolucao_mensal?.length ?? 0,
            series,
          }
        },
      }),

      bairros_entorno: tool({
        description: 'Bairros que envolvem o polígono FM, com população, denúncias e 1746.',
        inputSchema: z.object({}),
        execute: async () => {
          const b = area.bairros_entorno ?? []
          return {
            disponivel: b.length > 0,
            bairros: b.map(x => ({
              nome: x.nome,
              populacao: x.populacao,
              denuncias: x.denuncias,
              chamados_1746: x.chamados_1746,
            })),
          }
        },
      }),

      crimes_por_hora: tool({
        description: 'Distribuição de crimes por hora do dia e dia da semana.',
        inputSchema: z.object({}),
        execute: async () => ({
          pico_horario: area.stats.pico_horario,
          pct_noturno: area.stats.pct_noturno,
          por_hora: area.stats.hora_distribution,
          por_dia_semana: area.stats.dia_distribution,
        }),
      }),

      ontology_events: tool({
        description: 'Eventos criminais estruturados pela ontologia Valente (extração NER). Pode estar indisponível.',
        inputSchema: z.object({
          limit: z.number().int().optional(),
          contains: z.string().optional().describe('Substring em logradouro ou tipo de crime'),
        }),
        execute: async ({ limit, contains }) => {
          const events = loadOntologyEventsForArea(area.nome)
          if (events.length === 0) return { disponivel: false }
          const c = lower(contains)
          const filtered = c
            ? events.filter(e => lower(e.logradouro).includes(c) || lower(e.crimeType).includes(c))
            : events
          return {
            disponivel: true,
            total: events.length,
            retornados: filtered.slice(0, clampLimit(limit, 25)),
          }
        },
      }),

      // ═══════════════════════════ MAP TOOLS (client executes side-effect) ═════════
      toggle_layer: tool({
        description: 'Exibe/oculta camada do mapa.',
        inputSchema: z.object({
          layer: z.enum(['crime', 'fatores', 'cameras', 'psr', 'dominio', 'gaps', 'chamados', 'bairros']),
          visible: z.boolean(),
        }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      zoom_to_area: tool({
        description: 'Centraliza o mapa na área em análise.',
        inputSchema: z.object({ area_id: z.number().int() }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      show_annotation: tool({
        description: 'Adiciona marcador temporário (pin) no mapa.',
        inputSchema: z.object({
          lat: z.number(),
          lng: z.number(),
          title: z.string(),
          body: z.string().describe('Observação curta (até 80 chars)'),
        }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      highlight_trecho: tool({
        description: 'Pinta uma rua específica (do top_trechos). Use o locf_norm exato retornado por query_trechos.',
        inputSchema: z.object({
          locf_norm: z.string(),
          color: z.string().optional().describe('Cor hex, ex.: #ef4444'),
          label: z.string().optional(),
        }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      highlight_top_trechos: tool({
        description: 'Pinta os top-N trechos críticos da área.',
        inputSchema: z.object({ n: z.number().int().min(1).max(10) }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      clear_highlights: tool({
        description: 'Limpa todos os highlights (ruas, rotas, bairro focado).',
        inputSchema: z.object({}),
        execute: async () => ({ status: 'ok' as const }),
      }),

      focus_bairro: tool({
        description: 'Destaca e dá zoom em um bairro do entorno.',
        inputSchema: z.object({ nome: z.string() }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      set_time_filter: tool({
        description: 'Filtra heatmap de crime por janela horária [inicio, fim). Use null/null para resetar.',
        inputSchema: z.object({
          hora_inicio: z.number().int().min(0).max(23).nullable(),
          hora_fim: z.number().int().min(1).max(24).nullable(),
        }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      show_route: tool({
        description: 'Desenha uma rota (LineString) entre dois pontos — ex.: rota de fuga descrita no RELINT.',
        inputSchema: z.object({
          from_lat: z.number(),
          from_lng: z.number(),
          to_lat: z.number(),
          to_lng: z.number(),
          label: z.string().optional(),
        }),
        execute: async () => ({ status: 'ok' as const }),
      }),

      update_weights: tool({
        description: 'Ajusta pesos dos sliders de score quando relevante.',
        inputSchema: z.object({
          mancha: z.number().min(0).max(60).optional(),
          pico: z.number().min(0).max(60).optional(),
          fatores: z.number().min(0).max(60).optional(),
          dinamica: z.number().min(0).max(60).optional(),
        }),
        execute: async (args: Record<string, unknown>) => args,
      }),

      pause_for_user: tool({
        description: 'PAUSA o turno esperando o analista. Use SEMPRE ao final de cada passo do tour. Ofereça 2-4 sugestões curtas e clicáveis de próximos passos contextuais.',
        inputSchema: z.object({
          next_suggestions: z.array(z.string()).min(1).max(4)
            .describe('Frases curtas (até ~50 chars) sugerindo o próximo passo, ex.: "Mostre os top trechos críticos".'),
        }),
        execute: async (args: Record<string, unknown>) => args,
      }),

      complete_investigation: tool({
        description: 'Finaliza a investigação com sumário, achados e plano de ação por órgão.',
        inputSchema: z.object({
          summary: z.string(),
          key_findings: z.array(z.string()),
          actions: z.array(
            z.object({
              prioridade: z.number(),
              urgencia: z.enum(['imediata', '7_dias', '30_dias']),
              orgao: z.string(),
              tipo_recurso: z.string(),
              acao: z.string(),
              local: z.string(),
              evidencia: z.string(),
              prazo: z.string(),
            }),
          ),
        }),
        execute: async (findings: Record<string, unknown>) => findings,
      }),
    },
  })
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages?: unknown[]; area?: Area }
  const { messages = [], area } = body

  if (!area?.id) {
    return NextResponse.json({ error: 'area required' }, { status: 400 })
  }

  const { text: areaContext } = buildAreaBrief(area)

  const areaMessage = {
    id: generateId(),
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: areaContext }],
  }

  const uiMessages =
    messages.length <= 1 ? [areaMessage] : [areaMessage, ...messages.slice(1)]

  const agent = buildAgent(area)

  return createAgentUIStreamResponse({
    agent,
    uiMessages,
  })
}
