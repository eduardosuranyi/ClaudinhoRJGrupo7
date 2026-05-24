import type { Area } from '../types'
import { loadOntologyEventsForArea } from './ontologyEvents'

export interface DataSources {
  hasRelint: boolean
  hasChamados1746: boolean
  hasOntologyEvents: boolean
  hasValidacaoCruzada: boolean
  hasBairrosEntorno: boolean
  trechosCount: number
  relatosCount: number
  cameraGapsCount: number
}

/**
 * Build a short overview brief (~400 tokens) for the area. The agent then queries
 * the rich data on demand via query tools, instead of receiving a pre-summarized dump.
 */
export function buildAreaBrief(area: Area): { text: string; sources: DataSources } {
  const s = area.stats
  const b = area.score.breakdown
  const trechosCount = area.top_trechos.length
  const relatosCount = area.relatos_sample?.length ?? 0
  const cameraGapsCount = area.camera_gaps?.gaps?.length ?? 0
  const hasRelint = (area.relint?.full_text?.length ?? 0) > 0
  const hasChamados1746 = (area.chamados_1746?.total ?? 0) > 0
  const hasValidacaoCruzada = (area.validacao_cruzada?.length ?? 0) > 0
  const hasBairrosEntorno = (area.bairros_entorno?.length ?? 0) > 0
  const hasOntologyEvents = loadOntologyEventsForArea(area.nome).length > 0

  const topCrimeTypes = Object.entries(s.crimes_por_tipo)
    .sort(([, a], [, bv]) => bv - a)
    .slice(0, 3)
    .map(([k, v]) => `${k} (${v})`)
    .join(', ')

  const top3Trechos = area.top_trechos
    .slice(0, 3)
    .map((t, i) => `${i + 1}. ${t.locf_norm} (${t.total} crimes, pico ${t.pico_hora}h)`)
    .join(' | ')

  const orgaos = area.fatores_por_orgao
    .slice(0, 4)
    .map(f => `${f.orgao}:${f.total}`)
    .join(', ')

  const text = `# Briefing — Área FM: ${area.nome} (id ${area.id})

VISÃO GERAL
- Score risco: ${area.score.total} (mancha ${b.mancha_criminal}/40, pico ${b.pico_horario}/15, fatores ${b.fatores_urbanos}/25, dinâmica ${b.dinamica}/15)
- Crimes: ${s.crimes_total} total | tipos top: ${topCrimeTypes}
- Pico: ${s.pico_horario} | ${s.pct_noturno}% noturno
- Identificação: AISP ${area.identificacao.aisp ?? '—'}, subprefeitura ${area.identificacao.subprefeitura}, base FM ${area.identificacao.base_fm}
- Domínio territorial: ${area.identificacao.dominio_principal || 'não mapeado'}
- População bairros 2022: ${area.identificacao.populacao_bairros_2022?.toLocaleString('pt-BR') ?? '—'}${s.crimes_per_1000_hab ? ` | ${s.crimes_per_1000_hab.toFixed(1)} crimes/1000 hab` : ''}
- Fatores urbanos: ${s.fatores_urbanos_total} | Câmeras: ${s.cameras_total} | PSR: ${s.psr_total} | Denúncias DD: ${s.denuncias_total}

TOP 3 TRECHOS CRÍTICOS
${top3Trechos}

ÓRGÃOS COM MAIS FATORES: ${orgaos}

DADOS DISPONÍVEIS (consulte via tools):
- top_trechos: ${trechosCount} | relatos DD: ${relatosCount} | gaps de câmera: ${cameraGapsCount}
- RELINT: ${hasRelint ? 'sim' : 'não'} | Chamados 1746: ${hasChamados1746 ? `sim (${area.chamados_1746?.total} chamados)` : 'não'} | Validação cruzada: ${hasValidacaoCruzada ? 'sim' : 'não'}
- Bairros do entorno: ${hasBairrosEntorno ? `${area.bairros_entorno?.length} bairros` : 'não'} | Ontologia (eventos NER): ${hasOntologyEvents ? 'sim' : 'não'}

Use as tools query_* para puxar detalhes específicos. Não responda de cor — consulte os dados.`

  return {
    text,
    sources: {
      hasRelint,
      hasChamados1746,
      hasOntologyEvents,
      hasValidacaoCruzada,
      hasBairrosEntorno,
      trechosCount,
      relatosCount,
      cameraGapsCount,
    },
  }
}
