'use client'

import type { Area } from '../../types'
import { fmt, cap, MODUS_LABELS } from '../../lib/helpers'

export default function DenunciasTab({ area }: { area: Area }) {
  if (area.relatos_sample.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
        Sem denúncias geocodadas nesta área.<br />
        <span style={{ fontSize: 10 }}>Total não-geocodificadas: {fmt(area.stats.denuncias_total)}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      <div className="label-overline" style={{ marginBottom: 6 }}>
        Denúncias do Disque Denúncia
      </div>

      {/* KPI row: denúncias + drogas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <MiniKPI label="Denúncias" value={fmt(area.stats.denuncias_total)} />
        {area.stats.denuncias_drogas != null && area.stats.denuncias_drogas > 0 && (
          <MiniKPI label="Cenas de Drogas" value={fmt(area.stats.denuncias_drogas)} accent />
        )}
      </div>

      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 14 }}>
        Amostra de <span className="mono" style={{ color: 'var(--text-dim)' }}>{area.relatos_sample.length}</span> relatos
        de roubo/furto. Modus operandi extraído automaticamente do texto via NLP.
      </p>

      {/* Bairro breakdown */}
      {area.denuncias_por_bairro && area.denuncias_por_bairro.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="label-overline" style={{ marginBottom: 6, fontSize: 9 }}>Distribuição por Bairro (entorno)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {area.denuncias_por_bairro.slice(0, 8).map((db) => {
              const maxTotal = area.denuncias_por_bairro![0].total || 1
              const pct = Math.round((db.total / maxTotal) * 100)
              return (
                <div key={db.bairro}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 1 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{db.bairro}</span>
                    <span className="mono tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{fmt(db.total)}</span>
                  </div>
                  <div style={{ height: 2, background: 'var(--bg-3)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {area.relatos_sample.map((r, i) => (
          <RelatoCard key={i} relato={r} />
        ))}
      </div>
    </div>
  )
}

function RelatoCard({ relato }: { relato: any }) {
  const dataShort = relato.data ? relato.data.split(' ')[0] : ''
  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderRadius: 2,
      padding: '10px 12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)' }} />
          <span style={{ fontSize: 10, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {relato.tipo}
          </span>
        </div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {dataShort}
        </span>
      </div>

      {/* Location */}
      {relato.logradouro && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
          {cap(relato.logradouro)}{relato.bairro && ` · ${cap(relato.bairro)}`}
        </div>
      )}

      {/* Relato */}
      <p style={{
        fontSize: 11,
        color: 'var(--text)',
        lineHeight: 1.55,
        margin: '0 0 8px',
        fontStyle: 'italic',
      }}>
        "{relato.relato}"
      </p>

      {/* Modus tags + suspect profile */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
        {relato.modus.length > 0 && relato.modus.map((m: string) => (
          <span key={m} style={{
            fontSize: 9,
            padding: '2px 6px',
            background: 'rgba(251,176,64,0.08)',
            border: '1px solid rgba(251,176,64,0.3)',
            color: 'var(--amber)',
            borderRadius: 2,
            textTransform: 'lowercase',
          }}>
            {MODUS_LABELS[m] || m}
          </span>
        ))}
        {relato.perfil_suspeito && (
          <span style={{
            fontSize: 9,
            padding: '2px 6px',
            background: 'rgba(168,85,247,0.08)',
            border: '1px solid rgba(168,85,247,0.3)',
            color: '#a855f7',
            borderRadius: 2,
          }}>
            {relato.perfil_suspeito}
          </span>
        )}
      </div>
    </div>
  )
}

function MiniKPI({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-1)',
      border: `1px solid ${accent ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`,
      padding: '6px 10px',
      borderRadius: 2,
      flex: 1,
    }}>
      <div style={{ fontSize: 8, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div className="mono tnum" style={{ fontSize: 14, color: accent ? '#ef4444' : 'var(--text)', fontWeight: 500 }}>{value}</div>
    </div>
  )
}
