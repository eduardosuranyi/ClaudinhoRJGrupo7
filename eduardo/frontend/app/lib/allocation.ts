import type { Area } from '../types'

export interface Modalidade {
  tipo: 'pe' | 'moto' | 'viatura' | 'bicicleta' | 'social'
  label: string
  agentes: number
  pct: number
  cor: string
  emoji: string
  justificativa: string
}

export interface Posicionamento {
  rank: number
  trecho: string
  agentes: number
  modalidade: 'pe' | 'moto' | 'viatura' | 'bicicleta' | 'social'
  turno: string
  foco: string
  crimes: number
}

export interface EscalaArea {
  area_nome: string
  area_id: number
  score: number
  agentes_total: number
  agentes_por_turno: number   // efetivo simultâneo (escala 12x36)
  pct_do_contingente: number
  modalidades: Modalidade[]
  posicionamentos: Posicionamento[]
  turno_prioritario: string
  janela_horaria: string
  dias_criticos: string[]
  alerta_psr: boolean
  nivel_risco: 'critico' | 'alto' | 'medio' | 'baixo'
}

const TOTAL_AGENTES = 600
const FLOOR_POR_AREA = 12   // mínimo garantido por área
const TURNOS_NO_CICLO = 4   // escala 12x36 → 4 turnos no ciclo de 48h
                            // (cada agente trabalha 12h em 48h = 1/4 do tempo)
                            // efetivo simultâneo por turno = TOTAL / 4 = 150

// Areas que têm parques/orla → bicicleta é viável
const AREAS_BICICLETA = ['jardim de alah', 'botafogo', 'rio sul', 'copacabana']

// Calcula alocação de agentes pra todas as áreas dada a lista e pesos de score
export function calcularEscala(areas: Area[], weights: { mancha: number; pico: number; fatores: number; dinamica: number }): EscalaArea[] {
  const totalWeights = weights.mancha + weights.pico + weights.fatores + weights.dinamica || 1

  // Recalcular score ponderado
  const scored = areas.map(a => {
    const b = a.score.breakdown
    const s = (b.mancha_criminal / 40) * (weights.mancha / totalWeights) * 100
          + (b.pico_horario / 15)    * (weights.pico   / totalWeights) * 100
          + (b.fatores_urbanos / 25) * (weights.fatores / totalWeights) * 100
          + (b.dinamica / 15)        * (weights.dinamica / totalWeights) * 100
          + (b.relint_bonus / 5) * 5
    return { area: a, score: Math.round(s * 10) / 10 }
  })

  const totalScore = scored.reduce((s, x) => s + x.score, 0) || 1
  const nAreas = scored.length
  const budgetAcimaDoPiso = TOTAL_AGENTES - FLOOR_POR_AREA * nAreas

  return scored.map(({ area, score }) => {
    const agentesAcimaPiso = Math.round(budgetAcimaDoPiso * (score / totalScore))
    const agentes_total = FLOOR_POR_AREA + agentesAcimaPiso
    const agentes_por_turno = Math.round(agentes_total / TURNOS_NO_CICLO)

    // Determinar modalidades — calculadas sobre o efetivo POR TURNO (12x36)
    const modalidades = calcularModalidades(area, agentes_por_turno)

    // Determinar posicionamentos com base no efetivo simultâneo
    const posicionamentos = calcularPosicionamentos(area, modalidades)

    // Turno prioritário
    const horaEntries = Object.entries(area.stats.hora_distribution)
      .map(([h, v]) => ({ h: parseInt(h), v }))
      .sort((a, b) => b.v - a.v)
    const pico1 = horaEntries[0]?.h ?? 20
    const pico2 = horaEntries[1]?.h ?? 21
    const turno = `${pico1}h–${Math.min(pico1 + 3, 23)}h`
    const janela = `${Math.max(pico1 - 1, 0)}h–${Math.min(pico2 + 2, 23)}h`

    // Dias críticos
    const diasOrder = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo']
    const dias_criticos = Object.entries(area.stats.dia_distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d)

    const pct = Math.round((agentes_total / TOTAL_AGENTES) * 100)

    const nivel_risco: EscalaArea['nivel_risco'] =
      score >= 65 ? 'critico' : score >= 45 ? 'alto' : score >= 30 ? 'medio' : 'baixo'

    return {
      area_nome: area.nome,
      area_id: area.id,
      score,
      agentes_total,
      agentes_por_turno: Math.round(agentes_total / TURNOS_NO_CICLO),
      pct_do_contingente: pct,
      modalidades,
      posicionamentos,
      turno_prioritario: turno,
      janela_horaria: janela,
      dias_criticos,
      alerta_psr: area.stats.psr_total > 200,
      nivel_risco,
    }
  }).sort((a, b) => b.agentes_total - a.agentes_total)
}

function calcularModalidades(area: Area, total: number): Modalidade[] {
  const modus = area.stats.modus_operandi || {}
  const totalModus = Object.values(modus).reduce((s, v) => s + v, 0) || 1
  const psr = area.stats.psr_total
  const noturno = area.stats.pct_noturno
  const nomeNorm = area.nome.toLowerCase()
  const crimes = area.stats.crimes_total

  // Base: 50% pé, 25% moto, 15% viatura, 10% bicicleta
  let ratios = { pe: 50, moto: 25, viatura: 15, bicicleta: 10, social: 0 }

  // Ajuste por modus operandi
  const pctMoto    = ((modus['motocicleta'] || 0) / totalModus) * 100
  const pctPe      = ((modus['a_pe']        || 0) / totalModus) * 100
  const pctArmado  = ((modus['armado']      || 0) / totalModus) * 100
  const pctGrupo   = ((modus['em_grupo']    || 0) / totalModus) * 100

  if (pctMoto > 10)    { ratios.moto += 10; ratios.pe -= 5; ratios.bicicleta -= 5 }
  if (pctPe > 40)      { ratios.pe += 10; ratios.viatura -= 10 }
  if (pctArmado > 20)  { ratios.viatura += 8; ratios.pe -= 8 }
  if (pctGrupo > 25)   { ratios.moto += 5; ratios.pe -= 5 }

  // Ajuste por noturno → moto
  if (noturno > 65)    { ratios.moto += 8; ratios.pe -= 8 }

  // Bicicleta só em áreas com parque/orla
  const temBicicleta = AREAS_BICICLETA.some(k => nomeNorm.includes(k))
  if (!temBicicleta)   { ratios.pe += ratios.bicicleta; ratios.bicicleta = 0 }

  // Assistência social para PSR
  if (psr > 500)       { ratios.social = 12; ratios.pe -= 12 }
  else if (psr > 200)  { ratios.social = 7;  ratios.pe -= 7 }

  // Normalizar
  const sumR = Object.values(ratios).reduce((s, v) => s + v, 0)
  const normalize = (v: number) => Math.round((v / sumR) * total)

  const pe        = normalize(ratios.pe)
  const moto      = normalize(ratios.moto)
  const viatura   = normalize(ratios.viatura)
  const bicicleta = ratios.bicicleta > 0 ? normalize(ratios.bicicleta) : 0
  const social    = ratios.social > 0 ? normalize(ratios.social) : 0
  const diff      = total - pe - moto - viatura - bicicleta - social

  const result: Modalidade[] = [
    {
      tipo: 'pe', label: 'A pé', agentes: pe + diff, pct: 0, cor: '#ff6b35',
      emoji: '🚶',
      justificativa: pctPe > 40
        ? `${Math.round(pctPe)}% do modus operandi é a pé — presença densa nos trechos`
        : 'Presença visível nas vias de maior movimento',
    },
    {
      tipo: 'moto', label: 'Motocicleta', agentes: moto, pct: 0, cor: '#fbb040',
      emoji: '🏍',
      justificativa: noturno > 65
        ? `${noturno}% dos crimes são noturnos — agilidade de resposta essencial`
        : 'Cobertura dinâmica do eixo viário principal',
    },
    {
      tipo: 'viatura', label: 'Viatura', agentes: viatura, pct: 0, cor: '#4a90e2',
      emoji: '🚔',
      justificativa: pctArmado > 15
        ? `${Math.round(pctArmado)}% dos crimes registrados com arma de fogo`
        : 'Base de apoio e resposta a ocorrências graves',
    },
  ]

  if (bicicleta > 0) {
    result.push({
      tipo: 'bicicleta', label: 'Bicicleta', agentes: bicicleta, pct: 0, cor: '#36c476',
      emoji: '🚲',
      justificativa: 'Orla/parque — patrulha silenciosa com maior alcance',
    })
  }

  if (social > 0) {
    result.push({
      tipo: 'social', label: 'Assistência Social', agentes: social, pct: 0, cor: '#a855f7',
      emoji: '🤝',
      justificativa: `${psr.toLocaleString('pt-BR')} pessoas em situação de rua mapeadas`,
    })
  }

  // Calcular pcts
  result.forEach(m => { m.pct = Math.round((m.agentes / total) * 100) })

  return result.filter(m => m.agentes > 0)
}

function calcularPosicionamentos(area: Area, modalidades: Modalidade[]): Posicionamento[] {
  const trechos = area.top_trechos.slice(0, 6)
  if (trechos.length === 0) return []

  const totalCrimes = trechos.reduce((s, t) => s + t.total, 0) || 1
  const totalAgentes = modalidades.filter(m => m.tipo !== 'social').reduce((s, m) => s + m.agentes, 0)

  // Mapeia modalidades disponíveis (exceto social)
  const modPool: Posicionamento['modalidade'][] = []
  modalidades.forEach(m => {
    if (m.tipo !== 'social') modPool.push(m.tipo)
  })

  // Distribuição por pico horário
  const horaMap = area.stats.hora_distribution || {}
  const getHoraTurno = (picoH: number): string => {
    if (picoH >= 5 && picoH < 12)  return `${picoH}h–${picoH + 3}h`
    if (picoH >= 12 && picoH < 18) return `${picoH}h–${picoH + 2}h`
    return `${picoH}h–${Math.min(picoH + 3, 23)}h`
  }

  const positions: Posicionamento[] = trechos.map((t, i) => {
    const agentesNaTrecho = Math.max(2, Math.round((t.total / totalCrimes) * totalAgentes * 0.8))
    const modalidade = modPool[i % modPool.length]
    const turno = getHoraTurno(t.pico_hora || 20)

    // Foco baseado no tipo de crime
    const focos: string[] = []
    if (t.roubo_transeunte > 0) focos.push(`roubo a transeunte (${t.roubo_transeunte})`)
    if (t.roubo_celular > 0)    focos.push(`furto celular (${t.roubo_celular})`)
    if (t.roubo_coletivo > 0)   focos.push(`roubo em coletivo (${t.roubo_coletivo})`)

    return {
      rank: i + 1,
      trecho: t.locf_norm,
      agentes: agentesNaTrecho,
      modalidade,
      turno,
      foco: focos.slice(0, 2).join(' · ') || 'monitoramento geral',
      crimes: t.total,
    }
  })

  // Adicionar posição PSR se houver agentes sociais
  const socialM = modalidades.find(m => m.tipo === 'social')
  if (socialM && area.stats.psr_total > 100) {
    positions.push({
      rank: positions.length + 1,
      trecho: 'Pontos de concentração de PSR',
      agentes: socialM.agentes,
      modalidade: 'social',
      turno: '07h–11h e 18h–22h',
      foco: `abordagem social — ${area.stats.psr_total.toLocaleString('pt-BR')} PSR mapeados`,
      crimes: 0,
    })
  }

  return positions
}

export const NIVEL_RISCO_CONFIG = {
  critico: { label: 'Crítico',  color: '#ef4444', bg: 'rgba(239,68,68,0.12)'  },
  alto:    { label: 'Alto',     color: '#ff6b35', bg: 'rgba(255,107,53,0.12)' },
  medio:   { label: 'Médio',    color: '#fbb040', bg: 'rgba(251,176,64,0.12)' },
  baixo:   { label: 'Baixo',    color: '#4a90e2', bg: 'rgba(74,144,226,0.12)' },
}

export const MODAL_CONFIG: Record<string, { cor: string; emoji: string }> = {
  pe:        { cor: '#ff6b35', emoji: '🚶' },
  moto:      { cor: '#fbb040', emoji: '🏍' },
  viatura:   { cor: '#4a90e2', emoji: '🚔' },
  bicicleta: { cor: '#36c476', emoji: '🚲' },
  social:    { cor: '#a855f7', emoji: '🤝' },
}
