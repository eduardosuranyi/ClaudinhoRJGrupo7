'use client'

import type { AreasData, Area } from '../types'
import { fmt, shortName, scoreColor } from '../lib/helpers'

interface Props {
  data: AreasData
  selected: Area | null
  weights: { mancha: number; pico: number; fatores: number; dinamica: number }
  setWeights: (w: { mancha: number; pico: number; fatores: number; dinamica: number }) => void
  onSelectArea: (area: Area) => void
  onInvestigate?: (area: Area) => void
  agentActiveAreaId?: number | null
}

export default function Sidebar({ data, selected, weights, setWeights, onSelectArea, onInvestigate, agentActiveAreaId }: Props) {
  const totalW = weights.mancha + weights.pico + weights.fatores + weights.dinamica
  // Recompute weighted score
  const areasWithScore = data.areas.map(a => {
    const b = a.score.breakdown
    const newScore =
      (b.mancha_criminal / 40) * (weights.mancha / totalW) * 100 +
      (b.pico_horario / 15) * (weights.pico / totalW) * 100 +
      (b.fatores_urbanos / 25) * (weights.fatores / totalW) * 100 +
      (b.dinamica / 15) * (weights.dinamica / totalW) * 100 +
      (b.relint_bonus / 5) * 5
    return { ...a, _weighted: Math.round(newScore * 10) / 10 }
  }).sort((a, b) => b._weighted - a._weighted)

  return (
    <aside style={{
      width: 300, minWidth: 300,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '20px 1fr 56px 36px',
        padding: '8px 16px',
        gap: 8,
        borderBottom: '1px solid var(--border)',
      }}>
        <span className="label-overline" style={{ fontSize: 10 }}>#</span>
        <span className="label-overline" style={{ fontSize: 10 }}>Área Operacional</span>
        <span className="label-overline" style={{ fontSize: 10, textAlign: 'right' }}>Ocs.</span>
        <span className="label-overline" style={{ fontSize: 10, textAlign: 'right' }}>Score</span>
      </div>

      {/* Area list */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {areasWithScore.map((area, i) => (
          <AreaRow
            key={area.id}
            area={area}
            rank={i + 1}
            score={area._weighted}
            selected={selected?.id === area.id}
            agentActive={agentActiveAreaId === area.id}
            onClick={() => onSelectArea(area)}
            onInvestigate={onInvestigate ? () => onInvestigate(area) : undefined}
          />
        ))}
      </div>

      {/* Weight sliders */}
      <div style={{
        borderTop: '1px solid var(--border)',
        padding: '12px 16px',
        background: 'var(--bg-1)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="label-overline">Pesos do Score</span>
          <button
            onClick={() => setWeights({ mancha: 40, pico: 15, fatores: 25, dinamica: 15 })}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 10, cursor: 'pointer', padding: 0,
              textDecoration: 'underline',
            }}
          >
            reset
          </button>
        </div>

        <WeightSlider label="Mancha criminal" value={weights.mancha} onChange={v => setWeights({ ...weights, mancha: v })} />
        <WeightSlider label="Pico horário" value={weights.pico} onChange={v => setWeights({ ...weights, pico: v })} />
        <WeightSlider label="Fatores urbanos" value={weights.fatores} onChange={v => setWeights({ ...weights, fatores: v })} />
        <WeightSlider label="Dinâmica criminal" value={weights.dinamica} onChange={v => setWeights({ ...weights, dinamica: v })} />
      </div>

      {/* Footer */}
      <div style={{
        padding: '6px 16px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Crimes nos polígonos:</span>
          <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            {fmt(data.meta.total_ocorrencias_em_areas)} / {fmt(data.meta.total_ocorrencias)}
          </span>
        </div>
      </div>
    </aside>
  )
}

function AreaRow({ area, rank, score, selected, agentActive, onClick, onInvestigate }: {
  area: Area; rank: number; score: number; selected: boolean; agentActive?: boolean
  onClick: () => void; onInvestigate?: () => void
}) {
  return (
    <div style={{
      position: 'relative',
      borderBottom: '1px solid var(--border-dim)',
      borderLeft: agentActive ? '2px solid var(--amber)' : selected ? '2px solid var(--accent)' : '2px solid transparent',
    }}>
      <button onClick={onClick} style={{
        display: 'grid', gridTemplateColumns: '20px 1fr 56px 36px',
        gap: 8,
        width: '100%', padding: '8px 16px',
        alignItems: 'center',
        background: agentActive ? 'rgba(251,176,64,0.06)' : selected ? 'var(--bg-3)' : 'transparent',
        border: 'none',
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected && !agentActive) e.currentTarget.style.background = 'var(--bg-2)' }}
      onMouseLeave={e => { if (!selected && !agentActive) e.currentTarget.style.background = 'transparent' }}
      >
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {String(rank).padStart(2, '0')}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, color: selected || agentActive ? 'var(--text)' : 'var(--text-dim)', fontWeight: selected || agentActive ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {shortName(area.nome)}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            {area.identificacao.aisp && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>AISP {area.identificacao.aisp}</span>
            )}
            {area.relint_disponivel && (
              <span style={{ fontSize: 10, color: 'var(--accent)' }}>· RELINT</span>
            )}
            {agentActive && (
              <span style={{ fontSize: 10, color: 'var(--amber)' }}>· IA ativa</span>
            )}
          </div>
        </div>
        <span className="mono tnum" style={{ fontSize: 11, textAlign: 'right', color: 'var(--text-dim)' }}>
          {fmt(area.stats.crimes_total)}
        </span>
        <div style={{ textAlign: 'right' }}>
          <span className="mono tnum" style={{
            fontSize: 12,
            color: scoreColor(score),
            fontWeight: 600,
          }}>
            {score.toFixed(0)}
          </span>
        </div>
      </button>

      {/* Investigate button — appears on hover of the row */}
      {onInvestigate && !agentActive && (
        <button
          onClick={e => { e.stopPropagation(); onInvestigate() }}
          title="Investigar com IA"
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'var(--bg-4)', border: '1px solid var(--border)',
            borderRadius: 2, padding: '3px 7px',
            fontSize: 10, color: 'var(--text-muted)',
            cursor: 'pointer', opacity: 0,
            transition: 'opacity 0.12s',
          }}
          className="investigate-btn"
        >
          IA ↗
        </button>
      )}
    </div>
  )
}

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text)' }}>{value}</span>
      </div>
      <input
        type="range" min="0" max="60" value={value}
        onChange={e => onChange(parseInt(e.target.value))}
        className="range-slider"
      />
    </div>
  )
}
