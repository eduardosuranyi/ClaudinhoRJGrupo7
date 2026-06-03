'use client'

import type { Area, Trecho } from '../../types'
import { fmt, cap } from '../../lib/helpers'

interface TrechosTabProps {
  area: Area
  highlightedTrechos?: number[]
  onToggleTrecho?: (idx: number) => void
}

export default function TrechosTab({ area, highlightedTrechos, onToggleTrecho }: TrechosTabProps) {
  if (area.top_trechos.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        Sem dados de trecho.
      </div>
    )
  }

  const totalCrimes = area.top_trechos.reduce((s, t) => s + t.total, 0)
  const hlSet = new Set(highlightedTrechos ?? [])

  return (
    <div style={{ padding: '12px 16px' }}>
      <div className="label-overline" style={{ marginBottom: 6 }}>Top trechos por incidência</div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
        Top {area.top_trechos.length} concentram <span className="mono" style={{ color: 'var(--text-dim)' }}>{fmt(totalCrimes)}</span> ocorrências
        ({Math.round(totalCrimes / area.stats.crimes_total * 100)}% do total da área).
      </p>
      {onToggleTrecho && (
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 10, fontStyle: 'italic' }}>
          Clique para selecionar no mapa{hlSet.size > 0 ? ` · ${hlSet.size} selecionado${hlSet.size > 1 ? 's' : ''}` : ''}
        </p>
      )}

      <div style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 2,
      }}>
        {area.top_trechos.map((t, i) => (
          <TrechoRow
            key={i}
            rank={i + 1}
            trecho={t}
            maxTotal={area.top_trechos[0].total}
            highlighted={hlSet.has(i)}
            onClick={onToggleTrecho ? () => onToggleTrecho(i) : undefined}
          />
        ))}
      </div>
    </div>
  )
}

function TrechoRow({ rank, trecho, maxTotal, highlighted, onClick }: {
  rank: number; trecho: Trecho; maxTotal: number; highlighted?: boolean; onClick?: () => void
}) {
  const pct = (trecho.total / maxTotal) * 100

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border-dim)',
        position: 'relative',
        cursor: onClick ? 'pointer' : 'default',
        borderLeft: highlighted ? '3px solid #fbb040' : '3px solid transparent',
        background: highlighted ? 'rgba(251,176,64,0.08)' : 'transparent',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Background bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: `${pct}%`,
        background: highlighted ? 'rgba(251,176,64,0.06)' : 'rgba(255,107,53,0.06)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px', gap: 10, alignItems: 'center', position: 'relative' }}>
        <span className="mono tnum" style={{ fontSize: 11, color: highlighted ? '#fbb040' : 'var(--text-muted)', textAlign: 'right' }}>
          {String(rank).padStart(2, '0')}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontWeight: 500,
          }}>
            {cap(trecho.locf_norm)}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 10, flexWrap: 'wrap' }}>
            <ChipBreak label="transeunte" value={trecho.roubo_transeunte} color="#ff6b35" />
            <ChipBreak label="celular" value={trecho.roubo_celular} color="#fbb040" />
            <ChipBreak label="coletivo" value={trecho.roubo_coletivo} color="#a855f7" />
            {trecho.pico_hora !== undefined && (
              <span style={{ color: 'var(--text-muted)' }}>pico {trecho.pico_hora}h</span>
            )}
            {trecho.bingo_count !== undefined && trecho.bingo_count >= 2 && (
              <span style={{
                padding: '1px 5px',
                borderRadius: 2,
                fontSize: 10,
                fontWeight: 700,
                background: trecho.bingo_count >= 3 ? 'rgba(239,68,68,0.15)' : 'rgba(251,176,64,0.15)',
                border: `1px solid ${trecho.bingo_count >= 3 ? '#ef4444' : '#fbb040'}`,
                color: trecho.bingo_count >= 3 ? '#ef4444' : '#fbb040',
              }}>
                BINGO {trecho.bingo_count}/3
              </span>
            )}
            {trecho.bingo_layers && trecho.bingo_count !== undefined && trecho.bingo_count >= 2 && (
              <span style={{ display: 'inline-flex', gap: 2 }}>
                {trecho.bingo_layers.crime && <LayerPill label="Crime" bg="rgba(239,68,68,0.15)" color="#ef4444" />}
                {trecho.bingo_layers.fatores && <LayerPill label="Fator" bg="rgba(251,176,64,0.15)" color="#fbb040" />}
                {trecho.bingo_layers.sinais && <LayerPill label="Sinal" bg="rgba(255,107,53,0.15)" color="#ff6b35" />}
              </span>
            )}
          </div>
        </div>
        <span className="mono tnum" style={{
          fontSize: 14, textAlign: 'right', color: 'var(--text)', fontWeight: 500,
        }}>
          {fmt(trecho.total)}
        </span>
      </div>
    </div>
  )
}

function LayerPill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      fontSize: 10,
      padding: '0px 3px',
      background: bg,
      color,
      borderRadius: 1,
      fontWeight: 600,
      letterSpacing: '0.03em',
    }}>
      {label}
    </span>
  )
}

function ChipBreak({ label, value, color }: { label: string; value: number; color: string }) {
  if (value === 0) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />
      <span className="mono tnum" style={{ color: 'var(--text-dim)' }}>{value}</span>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
    </span>
  )
}
