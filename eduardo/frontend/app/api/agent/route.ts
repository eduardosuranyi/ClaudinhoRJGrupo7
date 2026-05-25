import { ToolLoopAgent, createAgentUIStreamResponse, hasToolCall, tool, generateId } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import type { Area } from '../../types'
import { buildAreaBrief, buildGlobalBrief } from '../../lib/areaBrief'
import { loadOntologyEventsForArea } from '../../lib/ontologyEvents'
import { loadAllAreas } from '../../lib/areasData'
import { computeRoute } from '../../lib/routing'

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

═══ ZOOM (mostre na escala certa) ═══

A escala conta a história. Não deixe a câmera parada — aproxime para detalhar, afaste para dar contexto.
  - Ao destacar UM ponto específico (esquina do RELINT/DD, foco de crime, ponto de pulse/anotação), use zoom_to_point para chegar perto (zoom 16–17). highlight_trecho e focus_bairro já reenquadram sozinhos — não duplique.
  - Quando o usuário pedir "mais perto"/"detalhe" ou "afasta"/"visão geral", use adjust_zoom (in/out) mantendo o foco atual.
  - Ao terminar um mergulho em detalhe, ou ao trocar de assunto/área, use zoom_overview para devolver o panorama antes de mostrar o próximo passo.
  - Regra prática: 1 ponto → zoom_to_point; várias ruas/área → zoom_overview ou zoom_to_area. Combine com clear_highlights quando o novo não tem relação com o anterior.

═══ HIGIENE DO MAPA (limpar antes de mostrar o novo) ═══

O mapa é UM só — visualizações velhas poluem a nova. Antes de mostrar algo de assunto diferente do passo anterior, chame clear_highlights para limpar o que ficou. A regra é: limpe só quando manter o que está na tela NÃO ajuda a entender o que você vai mostrar agora.

LIMPE (clear_highlights) ao:
  - Trocar de tema (ex.: estava em rotas de fuga e agora vai falar de câmeras; estava em fatores urbanos e agora vai destacar trechos).
  - Trocar de área/bairro em foco (no modo mapa inteiro, antes do novo zoom_to_area).
  - O usuário pedir "limpa o mapa", "começa de novo", "voltar ao geral".
  - A tela já ter acumulado várias camadas e a próxima ser independente delas.
  - Passe annotations:true quando os pins antigos não têm a ver com o novo passo; time_filter:true quando sair de uma análise por horário para uma que olha o dia inteiro.

NÃO LIMPE quando o novo COMPLEMENTA o que já está visível:
  - Somar mais um trecho à comparação, sobrepor fatores sobre os crimes, anotar um ponto dentro do bairro já focado, animar uma rota que você acabou de traçar.
  - Em dúvida sobre rotas/trechos que se acumulam de propósito, mantenha.

Faça a limpeza como PRIMEIRA tool do passo (limpa → mostra o novo → pause_for_user). Não anuncie "vou limpar"; só mostre o novo já limpo.

Animações são EFÊMERAS: play_route_animation (mesmo em loop), animate_timeline e pulse_location param sozinhas assim que o analista avança pro próximo passo — não precisa limpá-las à mão. Use-as à vontade para chamar atenção no momento; elas não vão poluir o passo seguinte.

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

Query (puxam dados): query_trechos, query_relatos_dd, query_chamados_1746, query_fatores, query_camera_gaps, validacao_cruzada, get_relint_section, evolucao_mensal, bairros_entorno, crimes_por_hora, ontology_events, previsao_risco, correlacao_fatores_crime, query_ocorrencias_recentes.

Mapa (visualizam): toggle_layer, zoom_to_area, zoom_to_point, adjust_zoom, zoom_overview, show_annotation, highlight_trecho, highlight_top_trechos, clear_highlights, focus_bairro, set_time_filter, show_route, update_weights, add_radius_circle, compare_trechos, show_heatmap_custom, animate_timeline, cluster_crimes, play_route_animation, pulse_location.

Tools analíticas/visuais novas: previsao_risco (score 0–100 por trecho/hora), correlacao_fatores_crime (fatores × crime, associação não causa), query_ocorrencias_recentes (últimos N dias), add_radius_circle (raio de cobertura), compare_trechos (ruas lado a lado), show_heatmap_custom (heatmap filtrado), animate_timeline (acúmulo por hora, com controles de repetir/fechar), cluster_crimes (focos DBSCAN), play_route_animation (ponto animado ao longo de uma rota), pulse_location (ping para destacar um ponto).

Rotas: show_route agora SEGUE RUAS REAIS (malha IBGE), não traça reta por cima de prédios. Use-a para rotas de fuga do RELINT/DD passando as coordenadas de origem e destino; ela retorna distance_m (distância pela rua). Se vier status "fallback" (linha cinza tracejada "rota aproximada — sem caminho na malha"), avise o analista que os pontos estão em partes desconectadas da malha e a linha é só uma estimativa.

Controle: pause_for_user (SEMPRE no fim do passo), complete_investigation (só quando pedido).`

const GLOBAL_PROMPT_EXTRA = `

═══ MODO MAPA INTEIRO (escopo global) ═══

Nesta sessão você analisa TODAS as áreas FM do Rio, não apenas uma. Regras adicionais:
- Comece com uma visão comparativa. Use list_areas e/ou compare_areas para ranquear as áreas e propor por onde começar.
- Toda tool de QUERY exige o parâmetro area_id. Descubra o id em list_areas antes de consultar.
- Para usar tools de MAPA que dependem da área em foco (highlight_trecho, highlight_top_trechos, focus_bairro, compare_trechos, show_heatmap_custom, animate_timeline, cluster_crimes, previsao_risco), PRIMEIRO chame zoom_to_area(area_id) para focar aquela área — só então destaque/analise elementos dela.
- Ao trocar de área, chame zoom_to_area de novo antes de operar na nova área.
- set_time_filter e toggle_layer agem sobre o mapa inteiro (todas as áreas).`

const COMMON_DESC = 'Limites: até 50 resultados por chamada. Use filtros para focar.'

// ─── Local helpers for query tools ────────────────────────────────────────────
function clampLimit(n: number | undefined, max: number = 50): number {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return max
  return Math.min(Math.floor(n), max)
}

function lower(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase()
}

// ─── Pure query helpers (operate on a single Area; shared by both agents) ──────
export function qTrechos(
  area: Area,
  { orderBy = 'total', limit, bingo_only, hora, tipo }: {
    orderBy?: 'total' | 'bingo' | 'pico_hora'
    limit?: number
    bingo_only?: boolean
    hora?: number
    tipo?: 'transeunte' | 'celular' | 'coletivo'
  },
) {
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
}

export function qRelatosDd(
  area: Area,
  { tipo, contains, logradouro, limit }: { tipo?: string; contains?: string; logradouro?: string; limit?: number },
) {
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
}

export function qChamados1746(
  area: Area,
  { tipo, orgao, vencidos_only, limit }: { tipo?: string; orgao?: string; vencidos_only?: boolean; limit?: number },
) {
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
}

export function qFatores(area: Area, { orgao }: { orgao?: string }) {
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
}

export function qCameraGaps(area: Area, { top }: { top?: number }) {
  const gaps = area.camera_gaps?.gaps ?? []
  return {
    n_cameras_existentes: area.camera_gaps?.n_cameras ?? 0,
    coverage_radius_m: area.camera_gaps?.coverage_radius_m ?? 0,
    total_gaps: gaps.length,
    top: gaps.slice(0, clampLimit(top, 20)),
  }
}

export function qValidacaoCruzada(area: Area, { orgao }: { orgao?: string }) {
  const vc = area.validacao_cruzada ?? []
  let rows = vc.slice()
  if (orgao) rows = rows.filter(r => lower(r.orgao).includes(lower(orgao)))
  return {
    disponivel: vc.length > 0,
    por_orgao: rows,
  }
}

export function qRelintSection(area: Area, { titulo }: { titulo?: string }) {
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
}

export function qEvolucaoMensal(area: Area, { window }: { window?: number }) {
  const w = clampLimit(window ?? 24, 60)
  const series = (area.evolucao_mensal ?? []).slice(-w)
  return {
    total_meses: area.evolucao_mensal?.length ?? 0,
    series,
  }
}

export function qBairrosEntorno(area: Area) {
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
}

export function qCrimesPorHora(area: Area) {
  return {
    pico_horario: area.stats.pico_horario,
    pct_noturno: area.stats.pct_noturno,
    por_hora: area.stats.hora_distribution,
    por_dia_semana: area.stats.dia_distribution,
  }
}

export function qOntologyEvents(area: Area, { limit, contains }: { limit?: number; contains?: string }) {
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
}

export function qPrevisaoRisco(
  area: Area,
  { trecho, hora, limit }: { trecho?: string; hora?: number; limit?: number },
) {
  const trechos = area.top_trechos
  if (trechos.length === 0) return { disponivel: false }
  const maxTotal = Math.max(...trechos.map(t => t.total), 1)
  const horaDist = area.stats.hora_distribution ?? {}
  const maxHoraCount = Math.max(...Object.values(horaDist).map(Number), 1)
  let rows = trechos.slice()
  if (trecho) {
    const tg = lower(trecho)
    rows = rows.filter(t => lower(t.locf_norm).includes(tg))
  }
  const scored = rows.map(t => {
    const h = typeof hora === 'number' ? hora : t.pico_hora
    const base = (t.total / maxTotal) * 45
    const peak = Math.abs(h - t.pico_hora) <= 1 ? 25 : Math.max(0, 25 - Math.abs(h - t.pico_hora) * 3)
    const horaW = ((Number(horaDist[String(h)] ?? 0)) / maxHoraCount) * 20
    const bingo = (Math.min(t.bingo_count ?? 0, 3) / 3) * 10
    const score = Math.round(Math.min(100, base + peak + horaW + bingo))
    const drivers: string[] = []
    if (base > 25) drivers.push('alto volume histórico de crimes')
    if (peak >= 20) drivers.push(`coincide com a hora de pico (${t.pico_hora}h)`)
    if (horaW > 10) drivers.push(`${h}h é horário movimentado na área`)
    if (bingo > 5) drivers.push('sobreposição de fatores urbanos')
    return { locf_norm: t.locf_norm, hora: h, risk_score: score, drivers }
  }).sort((a, b) => b.risk_score - a.risk_score)
  return {
    metodo: 'heurístico (volume + pico + intensidade horária + fatores)',
    aviso: 'Risco relativo, não previsão determinística. Subnotificação aplica.',
    previsoes: scored.slice(0, clampLimit(limit, 15)),
  }
}

export function qCorrelacaoFatoresCrime(area: Area) {
  const trechos = area.top_trechos
  if (trechos.length < 3) return { disponivel: false, motivo: 'Poucos trechos para correlacionar.' }
  const mean = (arr: number[]) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0)
  const comFatores = trechos.filter(t => t.bingo_layers?.fatores)
  const semFatores = trechos.filter(t => !t.bingo_layers?.fatores)
  const mediaCom = mean(comFatores.map(t => t.total))
  const mediaSem = mean(semFatores.map(t => t.total))
  const xs = trechos.map(t => t.bingo_count ?? 0)
  const ys = trechos.map(t => t.total)
  const mx = mean(xs), my = mean(ys)
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2 }
  const r = (dx > 0 && dy > 0) ? num / Math.sqrt(dx * dy) : 0
  const rRound = Math.round(r * 100) / 100
  const forca = Math.abs(r) > 0.6 ? 'forte' : Math.abs(r) > 0.3 ? 'moderada' : 'fraca'
  const razao = mediaSem > 0 ? Math.round((mediaCom / mediaSem) * 100) / 100 : null
  return {
    coeficiente_pearson: rRound,
    forca,
    n_trechos: trechos.length,
    trechos_com_fatores: comFatores.length,
    media_crimes_com_fatores: Math.round(mediaCom * 10) / 10,
    media_crimes_sem_fatores: Math.round(mediaSem * 10) / 10,
    razao,
    interpretacao: `Trechos com fatores urbanos têm em média ${razao ?? '—'}× mais crimes; correlação ${forca} (r=${rRound}). Associação, não causa.`,
  }
}

export function qOcorrenciasRecentes(
  area: Area,
  { dias, tipo }: { dias: number; tipo?: 'transeunte' | 'celular' | 'coletivo' },
) {
  const pts = area.map_layers.crime_points ?? []
  const withDate = pts.filter(p => typeof p.data === 'string' && p.data)
  if (withDate.length === 0) return { disponivel: false, motivo: 'Sem datas nos pontos de crime — regenerar areas_data.json.' }
  const parse = (s: string) => { const [d, m, y] = s.split('/').map(Number); return new Date(y, (m || 1) - 1, d || 1).getTime() }
  const times = withDate.map(p => parse(p.data as string)).filter(t => !Number.isNaN(t))
  const maxT = Math.max(...times)
  const cutoff = maxT - dias * 86400000
  const tipoMatch = (desc: string) => {
    if (!tipo) return true
    const d = desc.toLowerCase()
    if (tipo === 'transeunte') return d.includes('transeunte')
    if (tipo === 'celular') return d.includes('celular') || d.includes('aparelho')
    return d.includes('coletivo')
  }
  const recent = withDate.filter(p => parse(p.data as string) >= cutoff && tipoMatch(p.tipo))
  const porTipo: Record<string, number> = {}
  for (const p of recent) porTipo[p.tipo] = (porTipo[p.tipo] ?? 0) + 1
  const fmt = (t: number) => new Date(t).toLocaleDateString('pt-BR')
  return {
    dias,
    data_mais_recente: fmt(maxT),
    janela: `${fmt(cutoff)} – ${fmt(maxT)}`,
    total_recentes: recent.length,
    por_tipo: porTipo,
    aviso: 'Amostra de pontos georreferenciados (subnotificação ~30-50%).',
  }
}

// ─── Cross-area helpers (global agent only) ────────────────────────────────────
export function listAreas(areas: Area[]) {
  return {
    total_areas: areas.length,
    areas: areas
      .slice()
      .sort((a, b) => b.score.total - a.score.total)
      .map(a => ({
        id: a.id,
        nome: a.nome,
        score: a.score.total,
        crimes_total: a.stats.crimes_total,
        pico_horario: a.stats.pico_horario,
        pct_noturno: a.stats.pct_noturno,
        n_triple_bingo: a.n_triple_bingo,
        relint_disponivel: a.relint_disponivel,
      })),
  }
}

export type CompareMetric = 'score' | 'crimes_total' | 'pct_noturno' | 'fatores' | 'triple_bingo' | 'denuncias'

export function compareAreas(areas: Area[], metric: CompareMetric) {
  const valueOf = (a: Area): number => {
    switch (metric) {
      case 'crimes_total': return a.stats.crimes_total
      case 'pct_noturno': return a.stats.pct_noturno
      case 'fatores': return a.stats.fatores_urbanos_total
      case 'triple_bingo': return a.n_triple_bingo
      case 'denuncias': return a.stats.denuncias_total
      case 'score':
      default: return a.score.total
    }
  }
  return {
    metric,
    ranking: areas
      .slice()
      .sort((a, b) => valueOf(b) - valueOf(a))
      .map((a, i) => ({ rank: i + 1, id: a.id, nome: a.nome, valor: valueOf(a) })),
  }
}

// ─── Tool factories ────────────────────────────────────────────────────────────
// Map/control tools are identical in both agents — they're no-ops on the server
// and the client executes the side-effect from the streamed tool call.
function mapAndControlTools() {
  return {
    toggle_layer: tool({
      description: 'Exibe/oculta camada do mapa.',
      inputSchema: z.object({
        layer: z.enum(['crime', 'fatores', 'cameras', 'psr', 'dominio', 'gaps', 'chamados', 'bairros']),
        visible: z.boolean(),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    zoom_to_area: tool({
      description: 'Centraliza o mapa na área (e a seleciona). No modo mapa inteiro, chame ANTES de destacar/analisar elementos de uma área.',
      inputSchema: z.object({ area_id: z.number().int() }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    zoom_to_point: tool({
      description: 'Aproxima (zoom in) em uma coordenada exata — ex.: a esquina/ponto que você está destacando. zoom 16 ≈ rua, 17–18 ≈ quarteirão. Use para "olhar de perto" um local citado em RELINT/DD ou um ponto de pulse/anotação.',
      inputSchema: z.object({
        lat: z.number(),
        lng: z.number(),
        zoom: z.number().min(10).max(18).optional().describe('Nível de zoom (default 16). Maior = mais perto.'),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    adjust_zoom: tool({
      description: 'Aproxima ou afasta a câmera relativo ao zoom atual, mantendo o centro. Use direction "in" para detalhar e "out" para ganhar contexto sem trocar o foco.',
      inputSchema: z.object({
        direction: z.enum(['in', 'out']),
        steps: z.number().int().min(1).max(5).optional().describe('Quantos níveis (default 1).'),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    zoom_overview: tool({
      description: 'Afasta (zoom out) para a visão geral: enquadra a área em foco — ou todas as áreas se nenhuma estiver selecionada. Use ao retomar o panorama depois de mergulhar em detalhes ou ao trocar de assunto.',
      inputSchema: z.object({}),
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
      description: 'Pinta uma rua específica (do top_trechos da área em foco). Use o locf_norm exato retornado por query_trechos.',
      inputSchema: z.object({
        locf_norm: z.string(),
        color: z.string().optional().describe('Cor hex, ex.: #ef4444'),
        label: z.string().optional(),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    highlight_top_trechos: tool({
      description: 'Pinta os top-N trechos críticos da área em foco.',
      inputSchema: z.object({ n: z.number().int().min(1).max(10) }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    clear_highlights: tool({
      description: 'Limpa as visualizações do agente para abrir espaço a uma nova SEM relação com a anterior (ruas, rotas, bairro focado, raios, clusters, heatmap custom, animações, comparações). Por padrão NÃO remove pins nem reseta o filtro horário — passe annotations:true para limpar os pins e time_filter:true para resetar a janela horária. NÃO use se a nova camada complementa a atual (somar trechos, comparar, sobrepor fatores).',
      inputSchema: z.object({
        annotations: z.boolean().optional().describe('Também remove os marcadores/pins (show_annotation). Default false.'),
        time_filter: z.boolean().optional().describe('Também reseta o filtro horário do heatmap de crime. Default false.'),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    focus_bairro: tool({
      description: 'Destaca e dá zoom em um bairro do entorno da área em foco.',
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
      description:
        'Traça uma rota entre dois pontos SEGUINDO RUAS REAIS (malha IBGE) — ex.: rota de fuga descrita no RELINT. ' +
        'Retorna distance_m (distância pela rua, em metros). Se os dois pontos estiverem em partes desconectadas da malha viária, ' +
        'retorna status "fallback" e desenha uma linha tracejada cinza ("rota aproximada — sem caminho na malha"): mencione essa ressalva ao analista.',
      inputSchema: z.object({
        from_lat: z.number(),
        from_lng: z.number(),
        to_lat: z.number(),
        to_lng: z.number(),
        label: z.string().optional(),
      }),
      execute: async ({ from_lat, from_lng, to_lat, to_lng, label }) => {
        const r = computeRoute([from_lng, from_lat], [to_lng, to_lat])
        return {
          status: r.status,
          coordinates: r.coordinates,
          distance_m: r.distance_m,
          label: label ?? '',
          message: r.message ?? null,
        }
      },
    }),

    add_radius_circle: tool({
      description: 'Desenha um raio (em metros) ao redor de um ponto para mostrar área de cobertura/influência.',
      inputSchema: z.object({
        lat: z.number(),
        lng: z.number(),
        radius_m: z.number().min(10).max(5000),
        label: z.string().optional(),
        color: z.string().optional().describe('Cor hex, ex.: #22d3ee'),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    compare_trechos: tool({
      description: 'Compara 2+ ruas (trechos) lado a lado, pintadas com cores distintas e legenda. Use os locf_norm exatos do top_trechos.',
      inputSchema: z.object({
        locf_norms: z.array(z.string()).min(2).max(5),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    show_heatmap_custom: tool({
      description: 'Heatmap temporário (azul/roxo) com dados filtrados da área — por tipo e/ou janela horária. Não altera o heatmap principal.',
      inputSchema: z.object({
        tipo: z.enum(['transeunte', 'celular', 'coletivo']).optional(),
        hora_inicio: z.number().int().min(0).max(23).nullable().optional(),
        hora_fim: z.number().int().min(1).max(24).nullable().optional(),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    animate_timeline: tool({
      description: 'Animação temporal: mostra os crimes da área se acumulando ao longo das horas do dia (0→23).',
      inputSchema: z.object({
        tipo: z.enum(['transeunte', 'celular', 'coletivo']).optional(),
        step_ms: z.number().int().min(150).max(2000).optional(),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    cluster_crimes: tool({
      description: 'Identifica clusters espaciais de crime (DBSCAN) na área e marca os focos no mapa, dimensionados pela quantidade.',
      inputSchema: z.object({
        eps_m: z.number().min(30).max(1000).optional().describe('Raio de vizinhança em metros (default 150)'),
        min_pts: z.number().int().min(2).max(50).optional().describe('Mínimo de pontos por cluster (default 5)'),
      }),
      execute: async () => ({ status: 'ok' as const }),
    }),

    play_route_animation: tool({
      description: 'Anima um ponto luminoso percorrendo uma rota SEGUINDO RUAS REAIS (malha IBGE) — ex.: rota de fuga. ' +
        'Aceita waypoints intermediários (a animação roteia pela rua entre cada par). Retorna distance_m. ' +
        'Se algum trecho não tiver caminho na malha, status "fallback" (a animação passa reto nesse trecho).',
      inputSchema: z.object({
        from_lat: z.number(),
        from_lng: z.number(),
        to_lat: z.number(),
        to_lng: z.number(),
        waypoints: z.array(z.object({ lat: z.number(), lng: z.number() })).max(10).optional().describe('Pontos intermediários na ordem do percurso'),
        duration_ms: z.number().int().min(800).max(20000).optional().describe('Duração total da animação (default 4000)'),
        color: z.string().optional().describe('Cor hex, ex.: #22d3ee'),
        label: z.string().optional(),
        loop: z.boolean().optional().describe('Repetir continuamente'),
      }),
      execute: async ({ from_lat, from_lng, to_lat, to_lng, waypoints, duration_ms, color, label, loop }) => {
        // Route along streets between each consecutive pair (honors waypoints).
        const pts: [number, number][] = [
          [from_lng, from_lat],
          ...(waypoints ?? []).map(w => [w.lng, w.lat] as [number, number]),
          [to_lng, to_lat],
        ]
        const coordinates: [number, number][] = []
        let distance_m = 0
        let anyFallback = false
        for (let i = 0; i < pts.length - 1; i++) {
          const leg = computeRoute(pts[i], pts[i + 1])
          if (leg.status === 'fallback') anyFallback = true
          distance_m += leg.distance_m
          for (const c of leg.coordinates) {
            const last = coordinates[coordinates.length - 1]
            if (!last || last[0] !== c[0] || last[1] !== c[1]) coordinates.push(c)
          }
        }
        return {
          status: anyFallback ? ('fallback' as const) : ('ok' as const),
          coordinates,
          distance_m,
          duration_ms: duration_ms ?? null,
          color: color ?? null,
          label: label ?? '',
          loop: loop === true,
          message: anyFallback ? 'trecho(s) sem caminho na malha — animação aproximada nesses trechos' : null,
        }
      },
    }),

    pulse_location: tool({
      description: 'Faz um ponto pulsar (ping de sonar) para destacar um local específico por alguns segundos. Auto-remove. Trabalha com coordenadas explícitas.',
      inputSchema: z.object({
        lat: z.number(),
        lng: z.number(),
        color: z.string().optional().describe('Cor hex, ex.: #ff6b35'),
        label: z.string().optional().describe('Rótulo curto opcional'),
        duration_ms: z.number().int().min(1000).max(15000).optional().describe('Tempo até sumir (default 4000)'),
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
  }
}

// Builds the query tools. In single-area mode each tool closes over `area`.
// In global mode each tool requires `area_id` and resolves the area from `areas`.
function buildQueryTools(opts: { area?: Area; areas?: Area[] }) {
  const isGlobal = Array.isArray(opts.areas)
  const areaIdShape = { area_id: z.number().int().describe('id da área FM (descubra via list_areas)') }

  // Merge area_id into the schema only in global mode.
  const withId = <T extends z.ZodRawShape>(shape: T) =>
    isGlobal ? z.object({ ...areaIdShape, ...shape }) : z.object(shape)

  // Resolve the target area for a call. Returns an error sentinel if not found.
  // args is typed loosely because area_id only exists on the schema in global mode.
  const resolve = (args: Record<string, unknown>): Area | { erro: string } => {
    if (!isGlobal) return opts.area as Area
    const id = args.area_id as number | undefined
    const a = (opts.areas ?? []).find(x => x.id === id)
    if (!a) return { erro: `Área id ${id} não encontrada. Use list_areas para listar os ids válidos.` }
    return a
  }
  const isErr = (a: Area | { erro: string }): a is { erro: string } => 'erro' in a

  return {
    query_trechos: tool({
      description: `Lista trechos críticos (ruas) da área, filtráveis. ${COMMON_DESC}`,
      inputSchema: withId({
        orderBy: z.enum(['total', 'bingo', 'pico_hora']).optional(),
        limit: z.number().int().optional(),
        bingo_only: z.boolean().optional().describe('Apenas trechos com bingo_count>=2'),
        hora: z.number().int().min(0).max(23).optional().describe('Filtra por hora de pico'),
        tipo: z.enum(['transeunte', 'celular', 'coletivo']).optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qTrechos(area, args)
      },
    }),

    query_relatos_dd: tool({
      description: `Busca em relatos do Disque Denúncia (denúncia ANÔNIMA de crime — não confundir com 1746). ${COMMON_DESC}`,
      inputSchema: withId({
        tipo: z.string().optional().describe('Filtra por substring no campo tipo (ex.: "trafico")'),
        contains: z.string().optional().describe('Substring no texto do relato'),
        logradouro: z.string().optional().describe('Substring no logradouro'),
        limit: z.number().int().optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qRelatosDd(area, args)
      },
    }),

    query_chamados_1746: tool({
      description: `Chamados de SERVIÇO PÚBLICO (1746 — não confundir com DD). Agregados por tipo/órgão. ${COMMON_DESC}`,
      inputSchema: withId({
        tipo: z.string().optional(),
        orgao: z.string().optional(),
        vencidos_only: z.boolean().optional(),
        limit: z.number().int().optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qChamados1746(area, args)
      },
    }),

    query_fatores: tool({
      description: 'Fatores urbanos de campo agrupados por órgão (snapshot 2026). Use validacao_cruzada para comparar com 1746.',
      inputSchema: withId({
        orgao: z.string().optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qFatores(area, args)
      },
    }),

    query_camera_gaps: tool({
      description: 'Pontos cegos de câmera (lugares com crime e sem cobertura próxima).',
      inputSchema: withId({
        top: z.number().int().optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qCameraGaps(area, args)
      },
    }),

    validacao_cruzada: tool({
      description: 'Por órgão: fatores observados em campo × chamados 1746 atendidos/vencidos. Identifica órgãos com problema crônico.',
      inputSchema: withId({
        orgao: z.string().optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qValidacaoCruzada(area, args)
      },
    }),

    get_relint_section: tool({
      description: 'Retorna uma seção específica do RELINT, ou a lista de títulos se nenhum título for passado. Conteúdo classificado.',
      inputSchema: withId({
        titulo: z.string().optional().describe('Substring do título da seção'),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qRelintSection(area, args)
      },
    }),

    evolucao_mensal: tool({
      description: 'Série temporal mensal de crimes na área.',
      inputSchema: withId({
        window: z.number().int().optional().describe('Últimos N meses (default 24)'),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qEvolucaoMensal(area, args)
      },
    }),

    bairros_entorno: tool({
      description: 'Bairros que envolvem o polígono FM, com população, denúncias e 1746.',
      inputSchema: withId({}),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qBairrosEntorno(area)
      },
    }),

    crimes_por_hora: tool({
      description: 'Distribuição de crimes por hora do dia e dia da semana.',
      inputSchema: withId({}),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qCrimesPorHora(area)
      },
    }),

    ontology_events: tool({
      description: 'Eventos criminais estruturados pela ontologia Valente (extração NER). Pode estar indisponível.',
      inputSchema: withId({
        limit: z.number().int().optional(),
        contains: z.string().optional().describe('Substring em logradouro ou tipo de crime'),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qOntologyEvents(area, args)
      },
    }),

    previsao_risco: tool({
      description: 'Score preditivo de risco (0–100) por trecho e hora, derivado de padrões históricos (volume, hora de pico, intensidade horária, fatores urbanos). Heurístico e explicável — não é ML.',
      inputSchema: withId({
        trecho: z.string().optional().describe('locf_norm específico; senão avalia os top trechos'),
        hora: z.number().int().min(0).max(23).optional().describe('Hora alvo; senão usa a hora de pico de cada trecho'),
        limit: z.number().int().optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qPrevisaoRisco(area, args)
      },
    }),

    correlacao_fatores_crime: tool({
      description: 'Correlação heurística entre fatores urbanos e volume de crime por trecho (coeficiente de Pearson + comparação de médias). Associação, NÃO causa.',
      inputSchema: withId({}),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qCorrelacaoFatoresCrime(area)
      },
    }),

    query_ocorrencias_recentes: tool({
      description: 'Filtra os crimes dos últimos N dias (relativo à data mais recente da base), opcionalmente por tipo. Retorna contagens. Amostra subnotificada.',
      inputSchema: withId({
        dias: z.number().int().min(1).max(365),
        tipo: z.enum(['transeunte', 'celular', 'coletivo']).optional(),
      }),
      execute: async (args) => {
        const area = resolve(args)
        return isErr(area) ? area : qOcorrenciasRecentes(area, args as { dias: number; tipo?: 'transeunte' | 'celular' | 'coletivo' })
      },
    }),
  }
}

function buildAgent(area: Area) {
  return new ToolLoopAgent({
    model: anthropic('claude-sonnet-4-6'),
    instructions: SYSTEM_PROMPT,
    stopWhen: [hasToolCall('pause_for_user'), hasToolCall('complete_investigation')],
    tools: {
      ...buildQueryTools({ area }),
      ...mapAndControlTools(),
    },
  })
}

function buildGlobalAgent(areas: Area[]) {
  return new ToolLoopAgent({
    model: anthropic('claude-sonnet-4-6'),
    instructions: SYSTEM_PROMPT + GLOBAL_PROMPT_EXTRA,
    stopWhen: [hasToolCall('pause_for_user'), hasToolCall('complete_investigation')],
    tools: {
      list_areas: tool({
        description: 'Lista todas as áreas FM com score, crimes e flags, ordenadas por score. Ponto de partida do modo mapa inteiro.',
        inputSchema: z.object({}),
        execute: async () => listAreas(areas),
      }),

      compare_areas: tool({
        description: 'Ranqueia TODAS as áreas por uma métrica para comparação rápida.',
        inputSchema: z.object({
          metric: z.enum(['score', 'crimes_total', 'pct_noturno', 'fatores', 'triple_bingo', 'denuncias']),
        }),
        execute: async ({ metric }) => compareAreas(areas, metric),
      }),

      ...buildQueryTools({ areas }),
      ...mapAndControlTools(),
    },
  })
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { messages?: unknown[]; area?: Area; scope?: string }
  const { messages = [], area, scope } = body

  if (scope === 'global') {
    const areas = loadAllAreas()
    if (areas.length === 0) {
      return NextResponse.json({ error: 'areas data unavailable' }, { status: 500 })
    }

    const globalContext = buildGlobalBrief(areas)
    const globalMessage = {
      id: generateId(),
      role: 'user' as const,
      parts: [{ type: 'text' as const, text: globalContext }],
    }
    const uiMessages =
      messages.length <= 1 ? [globalMessage] : [globalMessage, ...messages.slice(1)]

    return createAgentUIStreamResponse({
      agent: buildGlobalAgent(areas),
      uiMessages,
    })
  }

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
