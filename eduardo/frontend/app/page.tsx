'use client'

import { useState, useEffect } from 'react'
import type { AreasData, Area } from './types'
import TopHeader from './components/TopHeader'
import Sidebar from './components/Sidebar'
import MapView from './components/MapView'
import AreaPanel from './components/AreaPanel'

export default function Home() {
  const [data, setData] = useState<AreasData | null>(null)
  const [selected, setSelected] = useState<Area | null>(null)
  const [loading, setLoading] = useState(true)

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
      <TopHeader data={data} />

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
          <AreaPanel area={selected} onClose={() => setSelected(null)} />
        )}
      </div>
    </div>
  )
}
