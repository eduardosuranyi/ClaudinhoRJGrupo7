'use client'

import { useState, useEffect } from 'react'
import type { AreasData, Area } from './types'
import TopHeader from './components/TopHeader'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import AreaPanel from './components/AreaPanel'
import ComparativoPage from './components/tabs/ComparativoPage'

export default function Home() {
  const [data, setData] = useState<AreasData | null>(null)
  const [selected, setSelected] = useState<Area | null>(null)
  const [loading, setLoading] = useState(true)
  const [showComparativo, setShowComparativo] = useState(false)

  // Scoring weights (default matches backend default)
  const [weights, setWeights] = useState({
    mancha: 40, pico: 15, fatores: 25, dinamica: 15,
  })

  useEffect(() => {
    fetch('/areas_data.json')
      .then(r => r.json())
      .then((d: AreasData) => {
        setData(d)
        setLoading(false)
      })
  }, [])

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
        <div style={{ flex: 1 }}><TopHeader data={data} /></div>
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
          />

          <MapView
            data={data}
            selected={selected}
            weights={weights}
            onSelectArea={setSelected}
          />

          {selected && (
            <AreaPanel
              area={selected}
              allAreas={data.areas}
              weights={weights}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
