'use client'

import { useState } from 'react'
import type { Area, AreasData, InspectedPoint } from '../types'
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
  highlightedTrechos?: number[]
  onToggleTrecho?: (idx: number) => void
  inspectedPoint?: InspectedPoint | null
  onCloseInspect?: () => void
}

export default function AreaPanel({ area, allAreas, weights, onClose, highlightedTrechos, onToggleTrecho, inspectedPoint, onCloseInspect }: Props) {
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
            <span className="label-overline" style={{ color: 'var(--accent)', fontSize: 10 }}>Área FM</span>
            <h2 style={{ fontSize: 13, fontWeight: 600, margin: '2px 0 6px', color: 'var(--text)', lineHeight: 1.35 }}>
              {area.nome}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {area.identificacao.aisp && <IdChip label="AISP" value={String(area.identificacao.aisp)} />}
              {area.identificacao.risp && <IdChip label="RISP" value={String(area.identificacao.risp)} />}
              <IdChip label="Base FM" value={area.identificacao.base_fm} />
              {area.identificacao.subprefeitura && area.identificacao.subprefeitura !== '—' && (
                <IdChip label="Subpref." value={area.identificacao.subprefeitura} />
              )}
              {area.identificacao.dominio_principal && area.identificacao.dominio_principal !== '—' && (
                <IdChip label="Domínio" value={area.identificacao.dominio_principal}
                  color={faccaoColor(area.identificacao.dominio_principal)} />
              )}
            </div>
            {area.identificacao.bairros && area.identificacao.bairros.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
                {area.identificacao.bairros.map(b => (
                  <span key={b} style={{
                    fontSize: 10,
                    padding: '1px 5px',
                    background: 'rgba(74,144,226,0.1)',
                    border: '1px solid rgba(74,144,226,0.25)',
                    color: '#4a90e2',
                    borderRadius: 2,
                  }}>
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ textAlign: 'right' }}>
              <span className="label-overline" style={{ fontSize: 10, display: 'block' }}>SCORE</span>
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
                fontSize: 10,
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
        {inspectedPoint && (
          <InspectedPointCard point={inspectedPoint} onClose={() => onCloseInspect?.()} />
        )}
        {tab === 'escala'       && <EscalaTab area={area} allAreas={allAreas} weights={weights} />}
        {tab === 'overview'     && <OverviewTab area={area} allAreas={allAreas} />}
        {tab === 'trechos'      && <TrechosTab area={area} highlightedTrechos={highlightedTrechos} onToggleTrecho={onToggleTrecho} />}
        {tab === 'denuncias'    && <DenunciasTab area={area} />}
        {tab === 'inteligencia' && <InteligenciaTab area={area} allAreas={allAreas} />}
        {tab === 'relatorio'    && <RelatorioTab area={area} allAreas={allAreas} />}
      </div>
    </aside>
  )
}

function IdChip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-3)', padding: '2px 6px', borderRadius: 2, border: color ? `1px solid ${color}` : '1px solid var(--border)' }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</span>
      <span className="mono tnum" style={{ fontSize: 10, color: color || 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function BreakdownPill({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <div style={{ flex: 1, background: 'var(--bg-3)', padding: '5px 7px', borderRadius: 2, border: '1px solid var(--border-dim)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 1 }}>
        <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{value.toFixed(0)}</span>
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>/{max}</span>
      </div>
      <div style={{ height: 2, background: 'var(--border-dim)', marginTop: 3, borderRadius: 1 }}>
        <div style={{ height: '100%', width: `${(value/max)*100}%`, background: 'var(--accent)', borderRadius: 1 }} />
      </div>
    </div>
  )
}

function InspectedPointCard({ point, onClose }: { point: InspectedPoint; onClose: () => void }) {
  const isFator = point.type === 'fator'
  const accent = isFator ? '#36c476' : '#f59e0b'
  const label = isFator ? 'Fator Urbano' : 'Chamado 1746'

  return (
    <div style={{
      margin: '10px 16px 6px',
      padding: '10px 12px',
      background: 'var(--bg-1)',
      border: `1px solid ${accent}40`,
      borderLeft: `3px solid ${accent}`,
      borderRadius: 2,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: accent, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            {label}
          </span>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 3, lineHeight: 1.35 }}>
            {point.properties.tipo || '—'}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 14, padding: '0 0 0 8px', lineHeight: 1,
        }}>×</button>
      </div>

      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11 }}>
        {point.properties.orgao && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Órgão</div>
            <div style={{ color: 'var(--text-dim)', fontWeight: 500, marginTop: 1 }}>{point.properties.orgao}</div>
          </div>
        )}
        {point.properties.logradouro && (
          <div style={{ flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logradouro</div>
            <div style={{ color: 'var(--text-dim)', fontWeight: 500, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {point.properties.logradouro}
            </div>
          </div>
        )}
      </div>

      <div className="mono" style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
        {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
      </div>
    </div>
  )
}
