'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Area, InspectedPoint, DisplacementData } from '../types'
import { scoreColor, faccaoColor } from '../lib/helpers'
import OverviewTab from './tabs/OverviewTab'
import TrechosTab from './tabs/TrechosTab'
import DenunciasTab from './tabs/DenunciasTab'
import InteligenciaTab from './tabs/InteligenciaTab'
import RelatorioTab from './tabs/RelatorioTab'
import EscalaTab from './tabs/EscalaTab'
import OntologyScorePanel from './OntologyScorePanel'

type TabId = 'escala' | 'analise' | 'ontologia' | 'inteligencia' | 'acao'

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
  const [tab, setTab] = useState<TabId>('analise')
  const [showAllIds, setShowAllIds] = useState(false)
  const [showBairros, setShowBairros] = useState(false)

  const tabs: { id: TabId; label: string; highlight?: boolean; status?: 'ready' | 'pending' }[] = [
    { id: 'escala',       label: 'Efetivo FM',        highlight: true, status: 'ready' },
    { id: 'analise',      label: 'Mancha Criminal',   status: 'ready' },
    { id: 'ontologia',    label: 'Ontologia',         highlight: true, status: 'ready' },
    { id: 'inteligencia', label: 'Dinâmica',          status: area.relint_disponivel ? 'ready' : 'pending' },
    { id: 'acao',         label: 'Plano de Ação',     status: 'pending' },
  ]

  return (
    <aside style={{
      width: 420, minWidth: 420,
      borderLeft: `2px solid ${scoreColor(area.score.total)}`,
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
      height: '100%',
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              {area.identificacao.dominio_principal && area.identificacao.dominio_principal !== '—' && (
                <IdChip label="Domínio" value={area.identificacao.dominio_principal}
                  color={faccaoColor(area.identificacao.dominio_principal)} />
              )}
              {area.identificacao.aisp && <IdChip label="AISP" value={String(area.identificacao.aisp)} />}
              {showAllIds && (
                <>
                  {area.identificacao.risp && <IdChip label="RISP" value={String(area.identificacao.risp)} />}
                  <IdChip label="Base FM" value={area.identificacao.base_fm} />
                  {area.identificacao.subprefeitura && area.identificacao.subprefeitura !== '—' && (
                    <IdChip label="Subpref." value={area.identificacao.subprefeitura} />
                  )}
                </>
              )}
              <button
                onClick={() => setShowAllIds(v => !v)}
                style={{
                  background: 'var(--bg-3)', border: '1px solid var(--border)',
                  borderRadius: 2, padding: '2px 5px', cursor: 'pointer',
                  fontSize: 10, color: 'var(--text-muted)', lineHeight: 1,
                }}
              >
                {showAllIds ? '−' : '+'}
              </button>
            </div>
            {area.identificacao.bairros && area.identificacao.bairros.length > 0 && (
              <div style={{ marginTop: 4 }}>
                {showBairros ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
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
                    <button
                      onClick={() => setShowBairros(false)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 10, color: 'var(--text-muted)', padding: '1px 4px',
                      }}
                    >×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowBairros(true)}
                    style={{
                      background: 'rgba(74,144,226,0.1)',
                      border: '1px solid rgba(74,144,226,0.25)',
                      color: '#4a90e2',
                      borderRadius: 2,
                      fontSize: 10, padding: '1px 6px',
                      cursor: 'pointer',
                    }}
                  >
                    {area.identificacao.bairros.length} bairros
                  </button>
                )}
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
            flex: 1, padding: '10px 4px',
            background: tab === t.id
              ? (t.highlight ? 'var(--amber-soft)' : 'var(--accent-soft)')
              : 'none',
            cursor: 'pointer',
            border: 'none',
            borderBottom: tab === t.id
              ? `3px solid ${t.highlight ? 'var(--amber)' : 'var(--accent)'}`
              : '3px solid transparent',
            color: tab === t.id ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 11, fontWeight: tab === t.id ? 600 : 400,
            transition: 'background 0.15s, color 0.15s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}>
            {t.label}
            {t.status === 'pending' && tab !== t.id && (
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
            )}
            {t.status === 'ready' && tab !== t.id && (
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', opacity: 0.6, flexShrink: 0 }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div key={tab} className="tab-content-enter" style={{ flex: 1, overflowY: 'auto' }}>
        {inspectedPoint && (
          <InspectedPointCard point={inspectedPoint} onClose={() => onCloseInspect?.()} />
        )}
        {tab === 'escala' && <EscalaTab area={area} allAreas={allAreas} weights={weights} />}
        {tab === 'analise' && (
          <>
            <OverviewTab area={area} allAreas={allAreas} />
            <DisplacementCard areaId={area.id} />
            <CensoCard bairros={area.identificacao.bairros} />
            <div style={{ margin: '0 16px', padding: '12px 0', borderTop: '1px solid var(--border)' }}>
              <span className="label-overline" style={{ fontSize: 10 }}>
                Trechos Críticos · {area.top_trechos.length}
              </span>
            </div>
            <TrechosTab area={area} highlightedTrechos={highlightedTrechos} onToggleTrecho={onToggleTrecho} />
          </>
        )}
        {tab === 'ontologia' && <OntologyScorePanel areaName={area.nome} />}
        {tab === 'inteligencia' && (
          <>
            <DenunciasTab area={area} />
            <div style={{ margin: '0 16px', padding: '12px 0', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="label-overline" style={{ fontSize: 10 }}>
                Inteligência Territorial
              </span>
              <RelintDownloadBtn area={area} allAreas={allAreas} />
            </div>
            <InteligenciaTab area={area} allAreas={allAreas} />
          </>
        )}
        {tab === 'acao' && <RelatorioTab area={area} allAreas={allAreas} />}
      </div>

      {/* Quick-action footer */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
        padding: '8px 12px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
      }}>
        <button
          onClick={() => setTab('acao')}
          style={{
            flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)',
            borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>
          Plano de Ação
        </button>
        <button
          onClick={() => setTab('inteligencia')}
          style={{
            flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text-dim)',
            borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
          RELINT
        </button>
        {area.n_triple_bingo > 0 && (
          <div style={{
            padding: '5px 8px', borderRadius: 2,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
            fontSize: 10, fontWeight: 600, color: '#ef4444',
            display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
            {area.n_triple_bingo} BINGO 3/3
          </div>
        )}
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <div style={{ flex: 1, background: 'var(--bg-3)', padding: '5px 7px', borderRadius: 2, border: '1px solid var(--border-dim)' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 1 }}>
        <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{value.toFixed(0)}</span>
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>/{max}</span>
      </div>
      <div style={{ height: 2, background: 'var(--border-dim)', marginTop: 3, borderRadius: 1 }}>
        <div style={{
          height: '100%',
          width: mounted ? `${(value/max)*100}%` : '0%',
          background: 'var(--accent)',
          borderRadius: 1,
          transition: 'width 400ms ease-out',
        }} />
      </div>
    </div>
  )
}

function RelintDownloadBtn({ area, allAreas }: { area: Area; allAreas: Area[] }) {
  const [loading, setLoading] = useState(false)

  async function download() {
    setLoading(true)
    const cacheKey = `relint_cache_${area.id}`
    const CACHE_TTL_MS = 60 * 60 * 1000

    const downloadFromBase64 = (b64: string) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RELINT_${area.nome.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.docx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const { b64, ts } = JSON.parse(cached)
        if (Date.now() - ts < CACHE_TTL_MS && b64) {
          downloadFromBase64(b64)
          setLoading(false)
          return
        }
      }
    } catch { /* ignore */ }

    try {
      const res = await fetch('/api/relint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, allAreas }),
      })
      if (!res.ok) { alert('Erro ao gerar RELINT'); return }
      const blob = await res.blob()
      try {
        const buf = await blob.arrayBuffer()
        const bytes = new Uint8Array(buf)
        let bin = ''
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
        localStorage.setItem(cacheKey, JSON.stringify({ b64: btoa(bin), ts: Date.now() }))
      } catch { /* cache write failed */ }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RELINT_${area.nome.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.docx`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      alert('Erro de conexão.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button onClick={download} disabled={loading} style={{
      padding: '3px 10px',
      background: loading ? 'var(--bg-3)' : 'var(--accent-soft)',
      border: loading ? '1px solid var(--border)' : '1px solid var(--accent)',
      color: loading ? 'var(--text-muted)' : 'var(--accent)',
      fontSize: 10, fontWeight: 600, borderRadius: 2,
      cursor: loading ? 'wait' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 4,
      whiteSpace: 'nowrap',
    }}>
      {loading ? (
        <>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-accent 1s ease-in-out infinite', display: 'inline-block' }} />
          Gerando…
        </>
      ) : '↓ RELINT'}
    </button>
  )
}

interface CensoBairro {
  nome: string
  pop_2022: number
  pop_2010: number
  variacao_pct: number
  domicilios_ocupados: number
  pessoas_por_domicilio: number
  densidade_hab_km2: number
  area_km2: number
}

function CensoCard({ bairros }: { bairros?: string[] }) {
  const [data, setData] = useState<CensoBairro[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    if (data || !bairros?.length) return
    try {
      const res = await fetch(`/api/censo?bairros=${encodeURIComponent(bairros.join(','))}`)
      if (!res.ok) return
      const json = await res.json()
      if (Array.isArray(json.bairros) && json.bairros.length) setData(json.bairros)
    } catch { /* silently degrade */ }
  }, [bairros, data])

  useEffect(() => { if (open) load() }, [open, load])

  if (!bairros?.length) return null

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
  const totPop = data?.reduce((s, b) => s + b.pop_2022, 0) ?? 0
  const totPop2010 = data?.reduce((s, b) => s + b.pop_2010, 0) ?? 0
  const avgDensidade = data?.length ? Math.round(data.reduce((s, b) => s + b.densidade_hab_km2, 0) / data.length) : 0
  const varPct = totPop2010 > 0 ? ((totPop - totPop2010) / totPop2010 * 100) : 0

  return (
    <div style={{ margin: '0 16px', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', gap: 6, width: '100%',
        }}
      >
        <span className="label-overline" style={{ fontSize: 10 }}>Demografia (Censo 2022)</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▾</span>
      </button>

      {open && data && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
            <MiniKpi label="Pop. Total" value={fmt(totPop)} />
            <MiniKpi label="Variação 10→22" value={`${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%`} color={varPct < 0 ? '#ef4444' : '#36c476'} />
            <MiniKpi label="Densid. Média" value={`${fmt(avgDensidade)} hab/km²`} />
          </div>
          {data.length > 1 && (
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {data.map(b => (
                <div key={b.nome} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: 500 }}>{b.nome}</span>
                  <span className="mono tnum">{fmt(b.pop_2022)} · {b.variacao_pct >= 0 ? '+' : ''}{b.variacao_pct.toFixed(1)}% · {fmt(b.densidade_hab_km2)}/km²</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
            Fonte: Censo 2022 (IBGE)
          </div>
        </div>
      )}
      {open && !data && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>Carregando…</div>
      )}
    </div>
  )
}

// Displacement summary lives in public/displacement.json (~3KB). Fetched once per
// session (module-level cache) so opening each area doesn't re-download it.
let _dispCache: Promise<DisplacementData | null> | null = null
function loadDisplacement(): Promise<DisplacementData | null> {
  if (!_dispCache) {
    _dispCache = fetch('/displacement.json')
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
  }
  return _dispCache
}

const DISP_META: Record<string, { txt: string; color: string; desc: string }> = {
  deslocamento_provavel: { txt: 'Deslocamento provável', color: '#ef4444', desc: 'Crime caiu na área mas subiu no entorno (500m) — possível migração para ruas adjacentes, não redução real.' },
  reducao_genuina:       { txt: 'Redução genuína', color: '#36c476', desc: 'Crime caiu tanto na área quanto no entorno — redução consistente.' },
  intensificacao:        { txt: 'Intensificação', color: '#fbb040', desc: 'Crime subiu na área e no entorno — pressão criminal crescente na região.' },
  inconclusivo:          { txt: 'Inconclusivo', color: '#8a8a95', desc: 'Sem divergência clara entre área e entorno (variação dentro da faixa neutra de ±10%).' },
}

function DisplacementCard({ areaId }: { areaId: number }) {
  const [info, setInfo] = useState<DisplacementData['areas'][string] | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    setLoaded(false)
    loadDisplacement().then(d => {
      if (!alive) return
      setInfo(d?.areas?.[String(areaId)] ?? null)
      setLoaded(true)
    })
    return () => { alive = false }
  }, [areaId])

  // Render nothing when displacement.json is absent or this area has no entry.
  if (!loaded || !info) return null
  const d = info.displacement
  const meta = DISP_META[d.label] ?? DISP_META.inconclusivo
  const [yPrev, yCurr] = d.anos_comparados ?? []
  const fmtPct = (v: number | null) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`)

  return (
    <div style={{
      margin: '10px 16px 6px', padding: '10px 12px',
      background: 'var(--bg-1)', border: `1px solid ${meta.color}40`,
      borderLeft: `3px solid ${meta.color}`, borderRadius: 2,
    }}>
      <span style={{ fontSize: 10, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        Alerta de Deslocamento {yPrev != null && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· {yPrev}→{yCurr}</span>}
      </span>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginTop: 3 }}>
        {meta.txt} <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>· confiança {d.confidence}</span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dentro da área</div>
          <div className="mono tnum" style={{ fontSize: 13, fontWeight: 600, marginTop: 1, color: (d.area_yoy_pct ?? 0) < 0 ? '#36c476' : '#ef4444' }}>{fmtPct(d.area_yoy_pct)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>No entorno (500m)</div>
          <div className="mono tnum" style={{ fontSize: 13, fontWeight: 600, marginTop: 1, color: (d.ring_yoy_pct ?? 0) > 0 ? '#ef4444' : '#36c476' }}>{fmtPct(d.ring_yoy_pct)}</div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 8, lineHeight: 1.4 }}>{meta.desc}</div>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
        Hipótese baseada em ocorrências 2020-2024; denúncias (DD) não entram no comparativo anual. Contagens do anel não são normalizadas por área.
      </div>
    </div>
  )
}

function MiniKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 2, padding: '5px 8px' }}>
      <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div className="mono tnum" style={{ fontSize: 12, fontWeight: 600, color: color ?? 'var(--text)', marginTop: 2 }}>{value}</div>
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
