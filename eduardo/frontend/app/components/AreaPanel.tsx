'use client'

import { useState } from 'react'
import type { Area, AreasData } from '../types'
import { fmt, scoreColor, faccaoColor } from '../lib/helpers'
import OverviewTab from './tabs/OverviewTab'
import TrechosTab from './tabs/TrechosTab'
import DenunciasTab from './tabs/DenunciasTab'
import InteligenciaTab from './tabs/InteligenciaTab'
import RelatorioTab from './tabs/RelatorioTab'
import EscalaTab from './tabs/EscalaTab'

type TabId = 'escala' | 'overview' | 'trechos' | 'denuncias' | 'inteligencia' | 'relatorio'

interface Props {
  area: Area
  allAreas: Area[]
  weights: { mancha: number; pico: number; fatores: number; dinamica: number }
  onClose: () => void
}

export default function AreaPanel({ area, allAreas, weights, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('escala')

  const tabs: { id: TabId; label: string; badge?: string; highlight?: boolean }[] = [
    { id: 'escala',       label: 'Escala',       badge: '600', highlight: true },
    { id: 'overview',     label: 'Dados' },
    { id: 'trechos',      label: 'Trechos',      badge: String(area.top_trechos.length) },
    { id: 'denuncias',    label: 'Denúncias',    badge: String(area.relatos_sample.length) },
    { id: 'inteligencia', label: 'Inteligência', badge: area.relint_disponivel ? 'RELINT' : undefined },
    { id: 'relatorio',    label: 'Plano de Ação' },
  ]

  return (
    <aside style={{
      width: 420, minWidth: 420,
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        background: 'var(--bg-1)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, paddingRight: 12 }}>
            <span className="label-overline" style={{ color: 'var(--accent)', fontSize: 9 }}>Área FM</span>
            <h2 style={{ fontSize: 13, fontWeight: 600, margin: '2px 0 6px', color: 'var(--text)', lineHeight: 1.35 }}>
              {area.nome}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {area.identificacao.aisp && <IdChip label="AISP" value={String(area.identificacao.aisp)} />}
              {area.identificacao.risp && <IdChip label="RISP" value={String(area.identificacao.risp)} />}
              <IdChip label="Base FM" value={area.identificacao.base_fm} />
              {area.identificacao.dominio_principal && area.identificacao.dominio_principal !== '—' && (
                <IdChip label="Domínio" value={area.identificacao.dominio_principal}
                  color={faccaoColor(area.identificacao.dominio_principal)} />
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ textAlign: 'right' }}>
              <span className="label-overline" style={{ fontSize: 8, display: 'block' }}>SCORE</span>
              <span className="mono tnum" style={{
                fontSize: 26, fontWeight: 500, color: scoreColor(area.score.total), lineHeight: 1,
              }}>
                {area.score.total.toFixed(0)}
              </span>
            </div>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, marginTop: 6,
            }}>×</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          <BreakdownPill label="Mancha" value={area.score.breakdown.mancha_criminal} max={40} />
          <BreakdownPill label="Pico"   value={area.score.breakdown.pico_horario}    max={15} />
          <BreakdownPill label="Fatores" value={area.score.breakdown.fatores_urbanos} max={25} />
          <BreakdownPill label="Dinâmica" value={area.score.breakdown.dinamica}       max={15} />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-1)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '9px 2px',
            background: 'none', cursor: 'pointer',
            border: 'none',
            borderBottom: tab === t.id
              ? `2px solid ${t.highlight ? 'var(--amber)' : 'var(--accent)'}`
              : '2px solid transparent',
            color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 10.5, fontWeight: tab === t.id ? 600 : 400,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
            <span>{t.label}</span>
            {t.badge && (
              <span className="mono" style={{
                fontSize: 8,
                background: tab === t.id
                  ? t.highlight ? 'var(--amber-soft)' : 'var(--accent-soft)'
                  : 'var(--bg-3)',
                color: tab === t.id
                  ? t.highlight ? 'var(--amber)' : 'var(--accent)'
                  : 'var(--text-muted)',
                padding: '1px 4px', borderRadius: 2,
              }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'escala'       && <EscalaTab area={area} allAreas={allAreas} weights={weights} />}
        {tab === 'overview'     && <OverviewTab area={area} allAreas={allAreas} />}
        {tab === 'trechos'      && <TrechosTab area={area} />}
        {tab === 'denuncias'    && <DenunciasTab area={area} />}
        {tab === 'inteligencia' && <InteligenciaTab area={area} />}
        {tab === 'relatorio'    && <RelatorioTab area={area} />}
      </div>
    </aside>
  )
}

function IdChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 2, border: color ? `1px solid ${color}` : '1px solid var(--border)' }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</span>
      <span className="mono tnum" style={{ fontSize: 10, color: color || 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function BreakdownPill({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-3)', padding: '5px 7px', borderRadius: 2, border: '1px solid var(--border-dim)' }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 1 }}>
        <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{value.toFixed(0)}</span>
        <span className="mono tnum" style={{ fontSize: 8, color: 'var(--text-muted)' }}>/{max}</span>
      </div>
      <div style={{ height: 2, background: 'var(--border-dim)', marginTop: 3, borderRadius: 1 }}>
        <div style={{ height: '100%', width: `${(value/max)*100}%`, background: 'var(--accent)', borderRadius: 1 }} />
      </div>
    </div>
  )
}
