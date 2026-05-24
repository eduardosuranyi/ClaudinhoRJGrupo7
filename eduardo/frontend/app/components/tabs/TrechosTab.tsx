'use client'

import type { Area } from '../../types'
import { fmt, cap } from '../../lib/helpers'

export default function TrechosTab({ area }: { area: Area }) {
  if (area.top_trechos.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        Sem dados de trecho.
      </div>
    )
  }

  const totalCrimes = area.top_trechos.reduce((s, t) => s + t.total, 0)

  return (
    <div style={{ padding: '12px 16px' }}>
      <div className="label-overline" style={{ marginBottom: 6 }}>Top trechos por incidência</div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
        Top {area.top_trechos.length} concentram <span className="mono" style={{ color: 'var(--text-dim)' }}>{fmt(totalCrimes)}</span> ocorrências
        ({Math.round(totalCrimes / area.stats.crimes_total * 100)}% do total da área).
      </p>

      <div style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 2,
      }}>
        {area.top_trechos.map((t, i) => (
          <TrechoRow key={i} rank={i + 1} trecho={t} maxTotal={area.top_trechos[0].total} />
        ))}
      </div>
    </div>
  )
}

function TrechoRow({ rank, trecho, maxTotal }: { rank: number; trecho: any; maxTotal: number }) {
  const pct = (trecho.total / maxTotal) * 100
  const totalTrecho = trecho.roubo_transeunte + trecho.roubo_celular + trecho.roubo_coletivo

  return (
    <div style={{
      padding: '10px 12px',
      borderBottom: '1px solid var(--border-dim)',
      position: 'relative',
    }}>
      {/* Background bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: `${pct}%`,
        background: 'rgba(255,107,53,0.06)',
        pointerEvents: 'none',
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 50px', gap: 10, alignItems: 'center', position: 'relative' }}>
        <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
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
          <div style={{ display: 'flex', gap: 10, marginTop: 4, fontSize: 9 }}>
            <ChipBreak label="transeunte" value={trecho.roubo_transeunte} color="#ff6b35" />
            <ChipBreak label="celular" value={trecho.roubo_celular} color="#fbb040" />
            <ChipBreak label="coletivo" value={trecho.roubo_coletivo} color="#a855f7" />
            {trecho.pico_hora !== undefined && (
              <span style={{ color: 'var(--text-muted)' }}>pico {trecho.pico_hora}h</span>
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
