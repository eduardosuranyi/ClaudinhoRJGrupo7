'use client'

import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from 'recharts'
import type { AreasData, Area } from '../../types'
import { fmt, shortName, scoreColor } from '../../lib/helpers'

interface Props {
  data: AreasData
  weights: { mancha: number; pico: number; fatores: number; dinamica: number }
}

const TOOLTIP_STYLE = {
  contentStyle: { background: '#14141a', border: '1px solid #2a2a35', fontSize: 10 },
  labelStyle: { color: '#8a8a95' },
  itemStyle: { color: '#f0f0f3' },
}

const AREA_COLORS = ['#ff6b35', '#fbb040', '#a855f7', '#4a90e2', '#22c55e', '#ef4444', '#06b6d4', '#ec4899']

function computeScore(area: Area, weights: Props['weights']): number {
  const totalW = weights.mancha + weights.pico + weights.fatores + weights.dinamica || 1
  const b = area.score.breakdown
  return Math.round((
    (b.mancha_criminal / 40) * (weights.mancha / totalW) * 100 +
    (b.pico_horario / 15) * (weights.pico / totalW) * 100 +
    (b.fatores_urbanos / 25) * (weights.fatores / totalW) * 100 +
    (b.dinamica / 15) * (weights.dinamica / totalW) * 100 +
    (b.relint_bonus / 5) * 5
  ) * 10) / 10
}

function crimeBarColor(value: number, min: number, max: number): string {
  const t = max === min ? 1 : (value - min) / (max - min)
  const r = Math.round(251 + (239 - 251) * t)
  const g = Math.round(176 + (68 - 176) * t)
  const b = Math.round(64 + (68 - 64) * t)
  return `rgb(${r},${g},${b})`
}

export default function ComparativoPage({ data, weights }: Props) {
  const crimeData = useMemo(() => {
    const sorted = [...data.areas].sort((a, b) => b.stats.crimes_total - a.stats.crimes_total)
    const counts = sorted.map(a => a.stats.crimes_total)
    const min = Math.min(...counts)
    const max = Math.max(...counts)
    return sorted.map(a => ({
      name: shortName(a.nome),
      crimes: a.stats.crimes_total,
      color: crimeBarColor(a.stats.crimes_total, min, max),
    }))
  }, [data.areas])

  const radarData = useMemo(() => {
    const areas = data.areas
    const maxCrimes = Math.max(...areas.map(a => a.stats.crimes_total), 1)
    const maxFatores = Math.max(...areas.map(a => a.stats.fatores_urbanos_total), 1)
    const maxCameras = Math.max(...areas.map(a => a.stats.cameras_total), 1)
    const maxDenuncias = Math.max(...areas.map(a => a.stats.denuncias_total), 1)
    const maxPsr = Math.max(...areas.map(a => a.stats.psr_total), 1)

    const axes = [
      { key: 'Crimes', get: (a: Area) => a.stats.crimes_total / maxCrimes },
      { key: 'Fatores', get: (a: Area) => a.stats.fatores_urbanos_total / maxFatores },
      { key: 'Cameras', get: (a: Area) => a.stats.cameras_total / maxCameras },
      { key: 'Denuncias', get: (a: Area) => a.stats.denuncias_total / maxDenuncias },
      { key: 'PSR', get: (a: Area) => a.stats.psr_total / maxPsr },
    ]

    return axes.map(({ key, get }) => {
      const row: Record<string, string | number> = { axis: key }
      areas.forEach((a, i) => {
        row[`area_${i}`] = get(a)
      })
      return row
    })
  }, [data.areas])

  const ranked = useMemo(() =>
    [...data.areas]
      .map(a => ({ area: a, score: computeScore(a, weights) }))
      .sort((a, b) => b.score - a.score),
    [data.areas, weights],
  )

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section>
        <div className="label-overline" style={{ marginBottom: 8 }}>Ocorrências por Área</div>
        <div style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={crimeData}
              margin={{ top: 4, right: 48, left: 4, bottom: 4 }}
            >
              <XAxis
                type="number"
                tick={{ fontSize: 9, fill: '#4a4a55' }}
                tickLine={false}
                axisLine={{ stroke: '#2a2a35' }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={110}
                tick={{ fontSize: 10, fill: '#8a8a95' }}
                tickLine={false}
                axisLine={{ stroke: '#2a2a35' }}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(255,107,53,0.08)' }}
                formatter={(value) => [
                  fmt(typeof value === 'number' ? value : Number(value)),
                  'Ocorrências',
                ]}
              />
              <Bar
                dataKey="crimes"
                radius={[0, 2, 2, 0]}
                label={{
                  position: 'right',
                  fill: '#8a8a95',
                  fontSize: 10,
                  formatter: (v: unknown) => fmt(Number(v ?? 0)),
                }}
              >
                {crimeData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <div className="label-overline" style={{ marginBottom: 8 }}>Comparativo Multidimensional</div>
        <div style={{ height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} margin={{ top: 16, right: 24, bottom: 16, left: 24 }}>
              <PolarGrid stroke="#2a2a35" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fontSize: 10, fill: '#8a8a95' }}
              />
              <PolarRadiusAxis
                domain={[0, 1]}
                tick={{ fontSize: 8, fill: '#4a4a55' }}
                axisLine={false}
                tickCount={5}
              />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(value) => {
                  const n = typeof value === 'number' ? value : Number(value)
                  return [(n * 100).toFixed(0) + '%', '']
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 10, color: '#8a8a95' }}
              />
              {data.areas.map((a, i) => (
                <Radar
                  key={a.id}
                  name={shortName(a.nome)}
                  dataKey={`area_${i}`}
                  stroke={AREA_COLORS[i % AREA_COLORS.length]}
                  fill={AREA_COLORS[i % AREA_COLORS.length]}
                  fillOpacity={0.3}
                  strokeWidth={1.5}
                />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <div className="label-overline" style={{ marginBottom: 8 }}>Ranking Geral</div>
        <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 2 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--bg-1)', borderBottom: '1px solid var(--border)' }}>
                {['#', 'Área', 'Score', 'Crimes', 'Fatores', 'Câmeras', 'Denúncias', 'Bingo'].map(col => (
                  <th
                    key={col}
                    className="label-overline"
                    style={{
                      padding: '8px 10px',
                      textAlign: col === 'Área' ? 'left' : 'right',
                      fontSize: 9,
                      fontWeight: 400,
                      color: 'var(--text-muted)',
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ area, score }, idx) => (
                <tr
                  key={area.id}
                  style={{
                    borderBottom: '1px solid var(--border-dim)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <td className="mono tnum" style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-muted)' }}>
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {shortName(area.nome)}
                  </td>
                  <td className="mono tnum" style={{ padding: '7px 10px', textAlign: 'right', color: scoreColor(score), fontWeight: 600 }}>
                    {score.toFixed(1)}
                  </td>
                  <td className="mono tnum" style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text)' }}>
                    {fmt(area.stats.crimes_total)}
                  </td>
                  <td className="mono tnum" style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>
                    {fmt(area.stats.fatores_urbanos_total)}
                  </td>
                  <td className="mono tnum" style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>
                    {fmt(area.stats.cameras_total)}
                  </td>
                  <td className="mono tnum" style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>
                    {fmt(area.stats.denuncias_total)}
                  </td>
                  <td className="mono tnum" style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--text-dim)' }}>
                    {fmt(area.n_bingo_trechos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
