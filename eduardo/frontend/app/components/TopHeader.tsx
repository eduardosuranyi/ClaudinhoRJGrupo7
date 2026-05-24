'use client'

import { fmt, timeAgo } from '../lib/helpers'
import type { AreasData } from '../types'
import { useEffect, useState } from 'react'

interface Props {
  data: AreasData
}

export default function TopHeader({ data }: Props) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(i)
  }, [])

  const totalCrimes = data.areas.reduce((s, a) => s + a.stats.crimes_total, 0)
  const totalFatores = data.areas.reduce((s, a) => s + a.stats.fatores_urbanos_total, 0)
  const totalCameras = data.areas.reduce((s, a) => s + a.stats.cameras_total, 0)
  const areasAlerta = data.areas.filter(a => a.score.total >= 40).length
  const totalDenuncias = data.areas.reduce((s, a) => s + a.stats.denuncias_total, 0)

  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-1)',
      height: 48,
      flexShrink: 0,
    }}>
      {/* Logo / title */}
      <div style={{
        padding: '0 16px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderRight: '1px solid var(--border)',
        minWidth: 280,
      }}>
        <div className="pulse-dot" style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--accent)',
        }} />
        <div>
          <div style={{ fontSize: 10, color: 'var(--accent)', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600 }}>
            CompStat Municipal
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginTop: -1 }}>
            Plataforma de Inteligência Criminal
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', height: '100%', flex: 1 }}>
        <KPI label="Áreas" value={fmt(data.meta.total_areas)} sub={`${areasAlerta} em alerta`} />
        <KPI label="Ocorrências" value={fmt(totalCrimes)} sub={data.meta.periodo_criminal} />
        <KPI label="Denúncias" value={fmt(totalDenuncias)} sub={data.meta.periodo_denuncias} />
        <KPI label="Fatores" value={fmt(totalFatores)} sub="pendentes" />
        <KPI label="Câmeras" value={fmt(totalCameras)} sub="CIVITAS" />
        {data.meta.populacao_total_bairros_fm != null && (
          <KPI label="Pop. FM" value={fmt(data.meta.populacao_total_bairros_fm)} sub="Censo 2022" />
        )}
      </div>

      {/* Status & time */}
      <div style={{
        padding: '0 16px',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderLeft: '1px solid var(--border)',
        minWidth: 220,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
          <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>Conectado</span>
        </div>
        <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {timeAgo(now)} BRT
        </div>
      </div>
    </header>
  )
}

function KPI({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{
      padding: '6px 16px',
      borderRight: '1px solid var(--border-dim)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      minWidth: 140,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="label-overline">{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 1 }}>
        <span className="mono tnum" style={{ fontSize: 17, color: 'var(--text)', fontWeight: 500 }}>
          {value}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sub}</span>
      </div>
    </div>
  )
}
