'use client'

import { useState, useMemo } from 'react'
import type { AreasData, Area } from '../types'
import { fmt, shortName, scoreColor } from '../lib/helpers'
import { NIVEL_RISCO_CONFIG } from '../lib/allocation'

type RiskLevel = 'critico' | 'alto' | 'medio' | 'baixo'

function getRiskLevel(score: number): RiskLevel {
  if (score >= 65) return 'critico'
  if (score >= 45) return 'alto'
  if (score >= 30) return 'medio'
  return 'baixo'
}

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
  const [search, setSearch] = useState('')
  const [groupByRisk, setGroupByRisk] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<RiskLevel, boolean>>({
    critico: false, alto: false, medio: false, baixo: false,
  })

  const totalW = weights.mancha + weights.pico + weights.fatores + weights.dinamica

  const areasWithScore = useMemo(() => data.areas.map(a => {
    const b = a.score.breakdown
    const newScore =
      (b.mancha_criminal / 40) * (weights.mancha / totalW) * 100 +
      (b.pico_horario / 15) * (weights.pico / totalW) * 100 +
      (b.fatores_urbanos / 25) * (weights.fatores / totalW) * 100 +
      (b.dinamica / 15) * (weights.dinamica / totalW) * 100 +
      (b.relint_bonus / 5) * 5
    return { ...a, _weighted: Math.round(newScore * 10) / 10 }
  }).sort((a, b) => b._weighted - a._weighted), [data.areas, weights, totalW])

  const filteredAreas = useMemo(() => {
    if (!search.trim()) return areasWithScore
    const q = search.toLowerCase()
    return areasWithScore.filter(a =>
      a.nome.toLowerCase().includes(q) ||
      String(a.identificacao.aisp).includes(q) ||
      (a.identificacao.bairros?.some(b => b.toLowerCase().includes(q)))
    )
  }, [areasWithScore, search])

  const toggleGroup = (level: RiskLevel) => {
    setCollapsedGroups(prev => ({ ...prev, [level]: !prev[level] }))
  }

  return (
    <aside style={{
      width: 300, minWidth: 300,
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {/* Search + group toggle */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar área, AISP, bairro…"
          style={{
            flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)',
            borderRadius: 2, padding: '5px 8px', fontSize: 11,
            color: 'var(--text)', outline: 'none',
          }}
        />
        <button
          onClick={() => setGroupByRisk(v => !v)}
          title="Agrupar por nível de risco"
          style={{
            background: groupByRisk ? 'var(--accent-soft)' : 'var(--bg-2)',
            border: `1px solid ${groupByRisk ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 2, padding: '4px 7px', cursor: 'pointer',
            fontSize: 10, color: groupByRisk ? 'var(--accent)' : 'var(--text-muted)',
            whiteSpace: 'nowrap',
          }}
        >
          ▤
        </button>
      </div>

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
        {groupByRisk ? (
          (['critico', 'alto', 'medio', 'baixo'] as RiskLevel[]).map(level => {
            const group = filteredAreas.filter(a => getRiskLevel(a._weighted) === level)
            if (group.length === 0) return null
            const cfg = NIVEL_RISCO_CONFIG[level]
            const collapsed = collapsedGroups[level]
            return (
              <div key={level}>
                <button
                  onClick={() => toggleGroup(level)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 16px', background: cfg.bg,
                    border: 'none', borderBottom: '1px solid var(--border-dim)',
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 10, color: cfg.color, transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.15s' }}>▼</span>
                  <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {cfg.label}
                  </span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{group.length}</span>
                </button>
                {!collapsed && group.map((area) => (
                  <AreaRow
                    key={area.id}
                    area={area}
                    rank={filteredAreas.indexOf(area) + 1}
                    score={area._weighted}
                    selected={selected?.id === area.id}
                    agentActive={agentActiveAreaId === area.id}
                    onClick={() => onSelectArea(area)}
                    onInvestigate={onInvestigate ? () => onInvestigate(area) : undefined}
                  />
                ))}
              </div>
            )
          })
        ) : (
          filteredAreas.map((area, i) => (
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
          ))
        )}
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
      transition: 'border-left-color 0.15s',
    }}>
      <button onClick={onClick} style={{
        display: 'grid', gridTemplateColumns: '20px 1fr 56px 36px',
        gap: 8,
        width: '100%', padding: '8px 16px',
        alignItems: 'center',
        background: agentActive ? 'rgba(251,176,64,0.06)' : selected ? 'var(--bg-3)' : 'transparent',
        border: 'none',
        cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.15s',
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
            background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(251,176,64,0.15))',
            border: '1px solid rgba(168,85,247,0.4)',
            borderRadius: 3, padding: '4px 9px',
            fontSize: 10, color: '#c4b5fd',
            cursor: 'pointer', opacity: 0,
            transition: 'opacity 0.12s, background 0.15s',
            display: 'flex', alignItems: 'center', gap: 4,
            fontWeight: 500,
          }}
          className="investigate-btn"
          onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(251,176,64,0.25))'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.7)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(251,176,64,0.15))'; e.currentTarget.style.borderColor = 'rgba(168,85,247,0.4)' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
            <path d="M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
          </svg>
          IA
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
