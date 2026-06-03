'use client'

/**
 * Painel do **score ontológico**.
 *
 * Diferente do `Score` herdado (count-based, em types.ts), este score é
 * computado a partir do CrimeEvent estruturado pela ontologia. Inclui:
 *   - Decomposição das 5 camadas (S_event, agregação, M_env, W_src, Δ_fb)
 *   - Top razões ordenadas por contribuição
 *   - Top eventos que mais pesaram
 *   - Alocação sugerida de agentes da FM com turnos e ações
 *
 * Estado vazio quando os JSONs ainda não foram gerados — instrui o
 * operador a rodar a CLI valente-ontology.
 */
import { useEffect, useState } from 'react'
import type {
  OntologyAreaScore,
  AreaAllocation,
} from '../lib/ontologyScore'

interface Props {
  areaName: string
}

interface ScoreResponse {
  window: { days: number; start: string; end: string }
  score: OntologyAreaScore
  allocation: AreaAllocation | null
}

interface ErrorResponse {
  error: string
  hint?: string
}

const PRIORITY_COLORS: Record<string, string> = {
  CRITICA: '#d23f31',
  ALTA: '#e88e1a',
  MEDIA: '#d4b227',
  BAIXA: '#5fa15f',
}

export default function OntologyScorePanel({ areaName }: Props) {
  const [data, setData] = useState<ScoreResponse | null>(null)
  const [error, setError] = useState<ErrorResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setData(null)
    fetch(`/api/score?area=${encodeURIComponent(areaName)}`)
      .then(async r => {
        const json = await r.json()
        if (!r.ok) setError(json as ErrorResponse)
        else setData(json as ScoreResponse)
      })
      .catch(e => setError({ error: String(e) }))
      .finally(() => setLoading(false))
  }, [areaName])

  if (loading) {
    return <div style={pad}>Carregando score ontológico…</div>
  }

  if (error) {
    return (
      <div style={pad}>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>
          Score ontológico indisponível
        </div>
        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{error.error}</div>
        {error.hint && (
          <pre style={hintBlock}>{error.hint}</pre>
        )}
      </div>
    )
  }

  if (!data) return null

  const { score, allocation, window } = data
  const bd = score.breakdown
  const color = PRIORITY_COLORS[bd.priority] ?? 'var(--muted)'

  return (
    <div style={pad}>
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Score ontológico
        </div>
        <div style={{ fontSize: 9, color: 'var(--muted)' }}>
          ({bd.events_considered} eventos, janela {window.days}d)
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 32, fontWeight: 700, color }}>
          {bd.final_score.toFixed(0)}
          <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}> /100</span>
        </div>
        <div>
          <div style={{ ...priorityChip, background: color }}>{bd.priority}</div>
          {allocation && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
              alocação sugerida: <strong>{allocation.agents_total}</strong> agentes
              ({(allocation.share_of_fleet * 100).toFixed(0)}% do efetivo)
            </div>
          )}
        </div>
      </div>

      {/* ── Decomposição das camadas ───────────────────────────────── */}
      <details open style={section}>
        <summary style={summary}>Decomposição das 5 camadas</summary>
        <div style={layerGrid}>
          <LayerCell label="S_loc (agregado)" value={bd.s_loc_raw.toFixed(1)} note={`top-3 média ${bd.s_event_top3_mean.toFixed(1)}`} />
          <LayerCell label="× M_env (ambiente)" value={`×${bd.m_env.toFixed(2)}`} note={bd.m_env > 1 ? 'amplificado' : bd.m_env < 1 ? 'rebaixado' : 'neutro'} />
          <LayerCell label="× W_src (fontes)" value={`×${bd.w_src.toFixed(2)}`} note={`${bd.distinct_source_kinds} fonte${bd.distinct_source_kinds === 1 ? '' : 's'}`} />
          <LayerCell label="+ Δ_fb (feedback)" value={`${bd.delta_fb >= 0 ? '+' : ''}${bd.delta_fb.toFixed(1)}`} note={bd.delta_fb === 0 ? 'sem histórico FM' : ''} />
        </div>
        <div style={formula}>
          {bd.s_loc_raw.toFixed(1)} × {bd.m_env.toFixed(2)} × {bd.w_src.toFixed(2)} + ({bd.delta_fb.toFixed(1)}) = <strong>{bd.final_score.toFixed(1)}</strong>
        </div>
      </details>

      {/* ── Por que esse score? ────────────────────────────────────── */}
      <details open style={section}>
        <summary style={summary}>Por que esse score? (top razões)</summary>
        <ul style={list}>
          {bd.reasons.slice(0, 8).map((r, i) => (
            <li key={i} style={reasonItem}>
              <span style={{ ...kindTag, background: kindColor(r.kind) }}>{r.kind}</span>
              <span style={{ flex: 1 }}>{r.label}</span>
              <span style={deltaTag(r.is_multiplier, r.delta)}>
                {r.is_multiplier ? `×${r.delta.toFixed(2)}` : `${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}`}
              </span>
              {r.evidence && <div style={evidenceLine}>{r.evidence}</div>}
            </li>
          ))}
        </ul>
      </details>

      {/* ── Eventos que mais pesaram ───────────────────────────────── */}
      <details style={section}>
        <summary style={summary}>Eventos que mais pesaram (top 5)</summary>
        <ul style={list}>
          {bd.top_events.map(ev => (
            <li key={ev.event_id} style={reasonItem}>
              <span style={{ fontWeight: 600, minWidth: 28, color: 'var(--accent)' }}>
                {ev.s_event.toFixed(0)}
              </span>
              <span style={{ flex: 1 }}>
                {ev.crime_type.replace(/_/g, ' ')}
                {ev.logradouro && <span style={{ color: 'var(--muted)' }}> — {ev.logradouro}</span>}
                {ev.hour_24 != null && <span style={{ color: 'var(--muted)' }}> @{ev.hour_24}h</span>}
                {ev.weapons.length > 0 && (
                  <span style={{ color: '#d23f31', fontWeight: 600 }}> · {ev.weapons.join(', ')}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {/* ── Alocação sugerida (frota) ──────────────────────────────── */}
      {allocation && (
        <details open style={section}>
          <summary style={summary}>
            Alocação sugerida — {allocation.agents_total} agentes
          </summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginTop: 6 }}>
            {allocation.shifts.map(s => (
              <div key={s.daypart} style={shiftCell}>
                <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>{s.daypart}</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{s.agents}</div>
              </div>
            ))}
          </div>
          {allocation.suggested_actions.length > 0 && (
            <>
              <div style={{ ...subhead, marginTop: 10 }}>Ações sugeridas:</div>
              <ul style={list}>
                {allocation.suggested_actions.map((a, i) => (
                  <li key={i} style={{ ...reasonItem, paddingLeft: 0 }}>
                    <span style={{ color: 'var(--accent)' }}>▸</span>
                    <span style={{ flex: 1 }}>{a}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Subcomponente
// ────────────────────────────────────────────────────────────────────────

function LayerCell({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div style={{ padding: 6, background: 'var(--bg-1)', borderRadius: 3 }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2 }}>{value}</div>
      {note && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{note}</div>}
    </div>
  )
}

function kindColor(kind: string): string {
  switch (kind) {
    case 'event': return 'rgba(74,144,226,0.2)'
    case 'aggregate': return 'rgba(126,87,194,0.2)'
    case 'env': return 'rgba(95,161,95,0.2)'
    case 'source': return 'rgba(216,178,39,0.2)'
    case 'feedback': return 'rgba(210,63,49,0.2)'
    default: return 'rgba(150,150,150,0.2)'
  }
}

function deltaTag(isMult: boolean, delta: number): React.CSSProperties {
  const positive = isMult ? delta > 1 : delta > 0
  return {
    fontSize: 10,
    fontWeight: 600,
    color: positive ? '#d23f31' : '#5fa15f',
    minWidth: 42,
    textAlign: 'right',
  }
}

// ────────────────────────────────────────────────────────────────────────
// Estilos
// ────────────────────────────────────────────────────────────────────────

const pad: React.CSSProperties = { padding: 12 }
const section: React.CSSProperties = { marginBottom: 10, borderTop: '1px solid var(--border)', paddingTop: 8 }
const summary: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 6 }
const layerGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }
const formula: React.CSSProperties = { fontFamily: 'monospace', fontSize: 10, color: 'var(--muted)', marginTop: 8, padding: 6, background: 'var(--bg-1)', borderRadius: 3 }
const list: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0 }
const reasonItem: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: 6, padding: '4px 0', borderBottom: '1px dashed var(--border)', fontSize: 11, flexWrap: 'wrap' }
const kindTag: React.CSSProperties = { fontSize: 8, padding: '1px 5px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 600 }
const evidenceLine: React.CSSProperties = { fontSize: 9, color: 'var(--muted)', marginLeft: 50, width: '100%' }
const priorityChip: React.CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 3, fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }
const shiftCell: React.CSSProperties = { padding: 6, background: 'var(--bg-1)', borderRadius: 3, textAlign: 'center' }
const subhead: React.CSSProperties = { fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4 }
const hintBlock: React.CSSProperties = { fontSize: 9, fontFamily: 'monospace', background: 'var(--bg-1)', padding: 6, borderRadius: 3, marginTop: 6, whiteSpace: 'pre-wrap' }
