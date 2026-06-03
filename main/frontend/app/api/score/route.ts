/**
 * GET /api/score
 *   ?area=<nome>  → score + alocação de frota da área (default)
 *   ?all=1        → report completo + plano de frota completo
 *
 * Lê os artefatos produzidos por `valente-ontology score` e `fleet`.
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  loadScoreReport,
  loadFleetPlan,
  findAreaScore,
  findAreaAllocation,
} from '../../lib/ontologyScore'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const area = url.searchParams.get('area')
  const all = url.searchParams.get('all') === '1'

  const report = loadScoreReport()
  const plan = loadFleetPlan()

  if (!report) {
    return NextResponse.json(
      {
        error: 'score_report.json não encontrado',
        hint:
          'Rode `cd valente && uv run python -m valente_ontology.cli score` ' +
          'para gerar.',
      },
      { status: 404 },
    )
  }

  if (all) {
    return NextResponse.json({ report, plan })
  }

  if (!area) {
    return NextResponse.json(
      { error: 'parâmetro `area` obrigatório (ou use `all=1`)' },
      { status: 400 },
    )
  }

  const score = findAreaScore(report, area)
  const allocation = findAreaAllocation(plan, area)

  if (!score) {
    return NextResponse.json(
      {
        error: 'área não encontrada no score_report',
        area_requested: area,
        available_areas: report.areas.map(a => a.area_fm),
      },
      { status: 404 },
    )
  }

  return NextResponse.json({
    window: {
      days: report.window_days,
      start: report.window_start_iso,
      end: report.window_end_iso,
    },
    score,
    allocation,
  })
}
