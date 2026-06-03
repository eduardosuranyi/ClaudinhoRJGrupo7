'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { AreasData, Area, MapControl, InspectedPoint } from './types'
import { scoreColor, fmt } from './lib/helpers'
import TopHeader from './components/TopHeader'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import AreaPanel from './components/AreaPanel'
import ComparativoPage from './components/tabs/ComparativoPage'
import AgentPanel from './components/AgentPanel'
import { useMapAgent } from './hooks/useMapAgent'

export default function Home() {
  const [data, setData] = useState<AreasData | null>(null)
  const [selected, setSelected] = useState<Area | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [reloadTick, setReloadTick] = useState(0)
  const [showComparativo, setShowComparativo] = useState(false)

  const [weights, setWeights] = useState({
    mancha: 40, pico: 15, fatores: 25, dinamica: 15,
  })

  const mapControlRef = useRef<MapControl | null>(null)

  const [highlightedTrechos, setHighlightedTrechos] = useState<number[]>([])
  const [inspectedPoint, setInspectedPoint] = useState<InspectedPoint | null>(null)

  useEffect(() => {
    setHighlightedTrechos([])
    setInspectedPoint(null)
  }, [selected])

  const toggleTrecho = useCallback((idx: number) => {
    setHighlightedTrechos(prev =>
      prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    fetch('/areas_data.json')
      .then(r => {
        if (!r.ok) throw new Error(`areas_data.json HTTP ${r.status}`)
        return r.json()
      })
      .then((d: AreasData) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.error('[Home] falha ao carregar areas_data.json:', err)
        setLoadError(true)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [reloadTick])

  const { messages, status, findings, areaId, isActive, isPaused, nextSuggestions, sendMessage, startAgent, startGlobalAgent, abortAgent } =
    useMapAgent({
      mapControlRef,
      setWeights,
      setSelected,
      getArea: (id) => data?.areas.find(a => a.id === id),
    })

  const agentIsActive = isActive

  if (loadError) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)', flexDirection: 'column', gap: 14,
      }}>
        <p style={{ fontSize: 13, color: '#fecaca', margin: 0, maxWidth: 360, textAlign: 'center' }}>
          Não foi possível carregar os dados base (areas_data.json).
          Verifique sua conexão e tente novamente.
        </p>
        <button
          onClick={() => setReloadTick(t => t + 1)}
          style={{
            background: 'var(--accent-soft)', border: '1px solid var(--accent)',
            color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            padding: '6px 16px', borderRadius: 2, cursor: 'pointer',
          }}
        >
          Tentar de novo
        </button>
      </div>
    )
  }

  if (loading || !data) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--bg)', flexDirection: 'column', gap: 10,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--accent)',
          animation: 'pulse-accent 1.2s ease-in-out infinite',
        }} />
        <p className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>
          carregando dados…
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <TopHeader
            data={data}
            onStartGlobal={agentIsActive ? undefined : startGlobalAgent}
          />
        </div>
        <button
          onClick={() => { setShowComparativo(v => !v); if (!showComparativo) setSelected(null) }}
          style={{
            padding: '6px 14px', marginRight: 16,
            background: showComparativo ? 'var(--accent-soft)' : 'none',
            border: `1px solid ${showComparativo ? 'var(--accent)' : 'var(--border)'}`,
            color: showComparativo ? 'var(--accent)' : 'var(--text-dim)',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 2,
            whiteSpace: 'nowrap',
          }}
        >
          {showComparativo ? '← Mapa' : 'Comparativo'}
        </button>
      </div>

      {/* Context strip for selected area */}
      {selected && !showComparativo && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '4px 16px',
          background: 'var(--bg-2)',
          borderBottom: '1px solid var(--border-dim)',
          flexShrink: 0,
          minHeight: 28,
        }}>
          <div style={{ width: 3, height: 14, borderRadius: 1, background: scoreColor(selected.score.total) }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
            {selected.nome.split(' - ')[0]}
          </span>
          <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
          <span className="mono tnum" style={{ fontSize: 11, color: scoreColor(selected.score.total), fontWeight: 600 }}>
            Score {selected.score.total.toFixed(0)}
          </span>
          {selected.n_triple_bingo > 0 && (
            <>
              <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
              <span style={{ fontSize: 10, color: '#ef4444', fontWeight: 600 }}>
                BINGO 3/3: {selected.n_triple_bingo} trechos
              </span>
            </>
          )}
          {selected.relint_disponivel && (
            <>
              <span style={{ width: 1, height: 12, background: 'var(--border)' }} />
              <span style={{ fontSize: 10, color: 'var(--accent)' }}>RELINT disponível</span>
            </>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
            {fmt(selected.stats.crimes_total)} ocorrências · {selected.stats.pico_horario} pico
          </span>
        </div>
      )}

      {showComparativo ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
          <ComparativoPage data={data} weights={weights} />
        </div>
      ) : (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar
            data={data}
            selected={selected}
            weights={weights}
            setWeights={setWeights}
            onSelectArea={setSelected}
            onInvestigate={agentIsActive ? undefined : startAgent}
            agentActiveAreaId={areaId}
          />

          <MapView
            data={data}
            selected={selected}
            weights={weights}
            onSelectArea={setSelected}
            mapControlRef={mapControlRef}
            highlightedTrechos={highlightedTrechos}
            onToggleTrecho={toggleTrecho}
            onSetHighlightedTrechos={setHighlightedTrechos}
            onInspectPoint={setInspectedPoint}
          />

          <div style={{
            width: (agentIsActive || selected) ? 420 : 0,
            minWidth: (agentIsActive || selected) ? 420 : 0,
            opacity: (agentIsActive || selected) ? 1 : 0,
            transform: (agentIsActive || selected) ? 'translateX(0)' : 'translateX(30px)',
            transition: 'width 250ms ease-out, min-width 250ms ease-out, opacity 250ms ease-out, transform 250ms ease-out',
            overflow: 'hidden',
            flexShrink: 0,
            alignSelf: 'stretch',
            display: 'flex',
          }}>
            {agentIsActive ? (
              <AgentPanel
                messages={messages}
                status={status}
                findings={findings}
                currentArea={selected}
                sendMessage={sendMessage}
                onAbort={abortAgent}
                isPaused={isPaused}
                nextSuggestions={nextSuggestions}
              />
            ) : selected ? (
              <AreaPanel
                area={selected}
                allAreas={data.areas}
                weights={weights}
                onClose={() => setSelected(null)}
                highlightedTrechos={highlightedTrechos}
                onToggleTrecho={toggleTrecho}
                inspectedPoint={inspectedPoint}
                onCloseInspect={() => setInspectedPoint(null)}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
