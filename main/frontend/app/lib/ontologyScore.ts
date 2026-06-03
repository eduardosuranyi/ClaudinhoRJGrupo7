/**
 * Carrega o score ontológico e o plano de frota produzidos pela pipeline
 * `valente-ontology` (ver valente/valente_ontology/score.py).
 *
 * Arquivos esperados:
 *   - ../../valente/data/scores/score_report.json
 *   - ../../valente/data/scores/fleet_plan.json
 *
 * Se ausentes, devolve `null` — o frontend renderiza estado vazio com CTA
 * para rodar `uv run python -m valente_ontology.cli score && fleet`.
 */
import fs from 'fs'
import path from 'path'

export interface OntologyReason {
  kind: 'event' | 'aggregate' | 'env' | 'source' | 'feedback'
  code: string
  label: string
  delta: number
  is_multiplier: boolean
  weight: number
  evidence: string | null
}

export interface OntologyTopEvent {
  event_id: string
  crime_type: string
  s_event: number
  date_iso: string | null
  hour_24: number | null
  logradouro: string | null
  weapons: string[]
  tactics: string[]
  outcome: string | null
  source_kind: string
}

export interface OntologyScoreBreakdown {
  s_event_sum: number
  s_event_top3_mean: number
  temporal_concentration: number
  s_loc_raw: number
  m_env: number
  w_src: number
  delta_fb: number
  final_score: number
  priority: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAIXA'
  events_considered: number
  distinct_source_kinds: number
  window_start_iso: string
  window_end_iso: string
  reasons: OntologyReason[]
  top_events: OntologyTopEvent[]
}

export interface OntologyAreaScore {
  area_fm: string
  breakdown: OntologyScoreBreakdown
}

export interface OntologyLogradouroScore {
  logradouro: string
  area_fm: string | null
  breakdown: OntologyScoreBreakdown
}

export interface OntologyScoreReport {
  generated_at: string
  ontology_version: string
  window_days: number
  window_start_iso: string
  window_end_iso: string
  areas: OntologyAreaScore[]
  logradouros: OntologyLogradouroScore[]
}

// ─── Fleet plan ─────────────────────────────────────────────────────────

export interface ShiftAllocation {
  daypart: string
  agents: number
  rationale: string
}

export interface AreaAllocation {
  area_fm: string
  score: number
  priority: string
  agents_total: number
  share_of_fleet: number
  shifts: ShiftAllocation[]
  top_reasons: string[]
  suggested_actions: string[]
}

export interface FleetPlan {
  generated_at: string
  fleet_size: number
  window_start_iso: string
  window_end_iso: string
  allocations: AreaAllocation[]
  unallocated: number
}

// ─── Loaders ────────────────────────────────────────────────────────────

const SCORES_DIR = path.resolve(process.cwd(), '..', '..', 'valente', 'data', 'scores')
const SCORE_REPORT_PATH = path.join(SCORES_DIR, 'score_report.json')
const FLEET_PLAN_PATH = path.join(SCORES_DIR, 'fleet_plan.json')

export function loadScoreReport(): OntologyScoreReport | null {
  try {
    if (!fs.existsSync(SCORE_REPORT_PATH)) return null
    return JSON.parse(fs.readFileSync(SCORE_REPORT_PATH, 'utf-8'))
  } catch {
    return null
  }
}

export function loadFleetPlan(): FleetPlan | null {
  try {
    if (!fs.existsSync(FLEET_PLAN_PATH)) return null
    return JSON.parse(fs.readFileSync(FLEET_PLAN_PATH, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * Localiza o score de uma área FM. Faz match por prefixo (10 chars) para
 * tolerar diferenças menores de normalização entre o pipeline Python e
 * o nome canônico do shapefile usado pelo frontend.
 */
export function findAreaScore(
  report: OntologyScoreReport | null,
  areaName: string,
): OntologyAreaScore | null {
  if (!report) return null
  const prefix = areaName.toLowerCase().slice(0, 10)
  return (
    report.areas.find(a => a.area_fm.toLowerCase().slice(0, 10) === prefix) ?? null
  )
}

export function findAreaAllocation(
  plan: FleetPlan | null,
  areaName: string,
): AreaAllocation | null {
  if (!plan) return null
  const prefix = areaName.toLowerCase().slice(0, 10)
  return (
    plan.allocations.find(a => a.area_fm.toLowerCase().slice(0, 10) === prefix) ?? null
  )
}
