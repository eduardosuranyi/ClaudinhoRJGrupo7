'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Area, AreasData } from '../types'
import { fmt, scoreColor, faccaoColor } from '../lib/helpers'

interface Props {
  data: AreasData
  selected: Area | null
  weights: { mancha: number; pico: number; fatores: number; dinamica: number }
  onSelectArea: (area: Area | null) => void
}

interface LayerVisibility {
  crime: boolean
  fatores: boolean
  cameras: boolean
  psr: boolean
  dominio: boolean
}

// Weighted score given current sliders
function computeScore(area: Area, w: Props['weights']): number {
  const b = area.score.breakdown
  const total = w.mancha + w.pico + w.fatores + w.dinamica || 1
  return Math.round(10 * (
    (b.mancha_criminal / 40) * (w.mancha / total) * 100 +
    (b.pico_horario / 15)    * (w.pico   / total) * 100 +
    (b.fatores_urbanos / 25) * (w.fatores / total) * 100 +
    (b.dinamica / 15)        * (w.dinamica / total) * 100 +
    (b.relint_bonus / 5) * 5
  )) / 10
}

export default function MapView({ data, selected, weights, onSelectArea }: Props) {
  const mapRef   = useRef<HTMLDivElement>(null)
  const mapInst  = useRef<any>(null)
  const popupRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [layers, setLayers] = useState<LayerVisibility>({
    crime: false, fatores: false, cameras: false, psr: false, dominio: false,
  })

  // ─────────────────────────────────────────────────────────
  // 1. MAP INIT
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return
    let map: any
    import('maplibre-gl').then(({ default: maplibregl }) => {
      // CARTO dark-matter GL vector style — full Rio map w/ streets + labels
      // No API key required
      map = new maplibregl.Map({
        container: mapRef.current!,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [-43.37, -22.93],
        zoom: 11.2,
        minZoom: 10,
        maxZoom: 18,
        attributionControl: false,
      })

      // Subtle attribution bottom-right
      map.addControl(
        new maplibregl.AttributionControl({ compact: true }),
        'bottom-right'
      )

      // Zoom controls top-left
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

      // Shared popup
      popupRef.current = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: 8,
        maxWidth: '260px',
      })

      map.on('load', () => {
        mapInst.current = map
        buildDataLayers(map, data)
        setMapReady(true)
      })
    })
    return () => { map?.remove(); mapInst.current = null }
  }, [])

  // ─────────────────────────────────────────────────────────
  // 2. BUILD ALL VECTOR DATA LAYERS
  // ─────────────────────────────────────────────────────────
  function buildDataLayers(map: any, data: AreasData) {
    // ── GeoJSON: area polygons ───────────────────────────
    const areasGJ = buildAreasGeoJSON(data, weights)
    map.addSource('areas', { type: 'geojson', data: areasGJ, promoteId: 'id' })

    // Fill — color by score
    map.addLayer({
      id: 'areas-fill',
      type: 'fill',
      source: 'areas',
      paint: {
        'fill-color': scoreInterpolation(),
        'fill-opacity': ['interpolate', ['linear'], ['zoom'],
          10, 0.45,
          14, 0.25,
        ],
      },
    })

    // Stroke — subtle
    map.addLayer({
      id: 'areas-stroke',
      type: 'line',
      source: 'areas',
      paint: {
        'line-color': scoreInterpolation(),
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 2],
        'line-opacity': 0.9,
      },
    })

    // Selected highlight
    map.addLayer({
      id: 'areas-selected',
      type: 'line',
      source: 'areas',
      filter: ['==', ['get', 'id'], -1],
      paint: {
        'line-color': '#fbb040',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 4],
        'line-opacity': 1,
      },
    })

    // Hover highlight fill
    map.addLayer({
      id: 'areas-hover',
      type: 'fill',
      source: 'areas',
      filter: ['==', ['get', 'id'], -1],
      paint: {
        'fill-color': '#fbb040',
        'fill-opacity': 0.08,
      },
    })

    // ── Crime heatmap ───────────────────────────────────
    const crimeFeatures = data.areas.flatMap(a =>
      a.map_layers.crime_points.map(p => ({
        type: 'Feature' as const,
        properties: { tipo: p.tipo, h: p.h },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      }))
    )
    map.addSource('crime', { type: 'geojson', data: { type: 'FeatureCollection', features: crimeFeatures } })
    map.addLayer({
      id: 'crime-heat',
      type: 'heatmap',
      source: 'crime',
      layout: { visibility: 'none' },
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 2.5],
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0,   'rgba(0,0,0,0)',
          0.15,'rgba(180,60,30,0.35)',
          0.4, 'rgba(255,107,53,0.6)',
          0.7, 'rgba(251,176,64,0.85)',
          1,   'rgba(255,255,200,0.95)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 6, 14, 22],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 15, 0],
      },
    })
    map.addLayer({
      id: 'crime-dot',
      type: 'circle',
      source: 'crime',
      layout: { visibility: 'none' },
      minzoom: 14,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2, 17, 5],
        'circle-color': ['match', ['get', 'tipo'],
          'Roubo a transeunte',      '#ff6b35',
          'Roubo de aparelho celular','#fbb040',
          'Roubo em coletivo',       '#a855f7',
          '#888',
        ],
        'circle-opacity': 0.85,
        'circle-stroke-color': 'rgba(0,0,0,0.5)',
        'circle-stroke-width': 0.5,
      },
    })

    // ── Fatores urbanos ─────────────────────────────────
    const fatoresFeatures = data.areas.flatMap(a =>
      a.map_layers.fatores_points.map(p => ({
        type: 'Feature' as const,
        properties: { tipo: p.tipo, orgao: p.orgao, logradouro: p.logradouro },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      }))
    )
    map.addSource('fatores', { type: 'geojson', data: { type: 'FeatureCollection', features: fatoresFeatures } })
    map.addLayer({
      id: 'fatores-dot',
      type: 'circle',
      source: 'fatores',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 6],
        'circle-color': ['match', ['get', 'orgao'],
          'COMLURB',    '#36c476',
          'Rio Luz',    '#fbb040',
          'SEOP',       '#a855f7',
          'SECONSERVA', '#4a90e2',
          'SMAS',       '#ef4444',
          'CET-Rio',    '#ff6b35',
          '#888',
        ],
        'circle-opacity': 0.9,
        'circle-stroke-color': '#07070a',
        'circle-stroke-width': 1,
      },
    })

    // ── Câmeras ─────────────────────────────────────────
    const camFeatures = data.areas.flatMap(a =>
      a.map_layers.cameras_points.map(p => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      }))
    )
    map.addSource('cameras', { type: 'geojson', data: { type: 'FeatureCollection', features: camFeatures } })
    map.addLayer({
      id: 'cameras-dot',
      type: 'circle',
      source: 'cameras',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 5],
        'circle-color': '#4a90e2',
        'circle-opacity': 0.75,
        'circle-stroke-color': '#07070a',
        'circle-stroke-width': 0.5,
      },
    })

    // ── PSR ─────────────────────────────────────────────
    const psrFeatures = data.areas.flatMap(a =>
      a.map_layers.psr_points.map(p => ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      }))
    )
    map.addSource('psr', { type: 'geojson', data: { type: 'FeatureCollection', features: psrFeatures } })
    map.addLayer({
      id: 'psr-dot',
      type: 'circle',
      source: 'psr',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 15, 4],
        'circle-color': '#a855f7',
        'circle-opacity': 0.5,
      },
    })

    // ── Domínio territorial ─────────────────────────────
    const dominioFeatures = data.areas.flatMap(a =>
      a.dominio_territorial.map(d => ({
        type: 'Feature' as const,
        properties: { nome: d.nome, faccao: d.faccao },
        geometry: d.geometry,
      }))
    )
    map.addSource('dominio', { type: 'geojson', data: { type: 'FeatureCollection', features: dominioFeatures } })
    map.addLayer({
      id: 'dominio-fill',
      type: 'fill',
      source: 'dominio',
      layout: { visibility: 'none' },
      paint: {
        'fill-color': ['match', ['get', 'faccao'],
          'CV',     '#ef4444',
          'TCP',    '#a855f7',
          'ADA',    '#4a90e2',
          'Milícia','#fbb040',
          '#666',
        ],
        'fill-opacity': 0.22,
      },
    })
    map.addLayer({
      id: 'dominio-stroke',
      type: 'line',
      source: 'dominio',
      layout: { visibility: 'none' },
      paint: {
        'line-color': ['match', ['get', 'faccao'],
          'CV',     '#ef4444',
          'TCP',    '#a855f7',
          'ADA',    '#4a90e2',
          'Milícia','#fbb040',
          '#888',
        ],
        'line-width': 1,
        'line-opacity': 0.7,
      },
    })

    // ── Interactions ─────────────────────────────────────
    // Click area
    map.on('click', 'areas-fill', (e: any) => {
      const id = e.features[0].properties.id
      const area = data.areas.find(a => a.id === id) ?? null
      if (!area) return
      onSelectArea(area)
      map.setFilter('areas-selected', ['==', ['get', 'id'], id])
      // Smooth zoom into the area
      const bounds = geomBounds(area.geometry as any)
      if (bounds) {
        map.fitBounds(bounds, {
          padding: { top: 80, bottom: 80, left: 80, right: selected ? 500 : 120 },
          maxZoom: 14,
          duration: 900,
          easing: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        })
      }
      popupRef.current?.remove()
    })

    // Hover popup
    map.on('mouseenter', 'areas-fill', (e: any) => {
      map.getCanvas().style.cursor = 'pointer'
      const f = e.features[0]
      const id = f.properties.id
      const area = data.areas.find(a => a.id === id)
      if (!area) return
      map.setFilter('areas-hover', ['==', ['get', 'id'], id])
      const score = computeScore(area, weights)
      const scoreCol = scoreColor(score)
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:200px">
            <div style="font-size:9px;color:#ff6b35;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Área FM</div>
            <div style="font-size:12px;font-weight:600;margin-bottom:8px;line-height:1.35">${area.nome.split(' - ').slice(0, 2).join(' · ')}</div>
            <div style="display:flex;gap:12px;font-size:11px">
              <div>
                <div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Score</div>
                <div style="color:${scoreCol};font-size:16px;font-weight:600;font-variant-numeric:tabular-nums">${score}</div>
              </div>
              <div>
                <div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Crimes</div>
                <div style="font-size:14px;font-weight:500;font-variant-numeric:tabular-nums">${area.stats.crimes_total.toLocaleString('pt-BR')}</div>
              </div>
              <div>
                <div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Pico</div>
                <div style="font-size:14px;font-weight:500">${area.stats.pico_horario}</div>
              </div>
            </div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid #2a2a35;font-size:10px;color:#8a8a95">
              ${area.stats.fatores_urbanos_total} fatores · ${area.stats.cameras_total} câmeras · ${area.stats.psr_total} PSR
            </div>
            ${area.relint_disponivel ? '<div style="margin-top:4px;font-size:9px;color:#ff6b35">● RELINT disponível</div>' : ''}
            <div style="margin-top:6px;font-size:9px;color:#4a4a55;font-style:italic">Clique para analisar →</div>
          </div>
        `)
        .addTo(map)
    })

    map.on('mousemove', 'areas-fill', (e: any) => {
      popupRef.current?.setLngLat(e.lngLat)
    })

    map.on('mouseleave', 'areas-fill', () => {
      map.getCanvas().style.cursor = ''
      map.setFilter('areas-hover', ['==', ['get', 'id'], -1])
      popupRef.current?.remove()
    })

    // Click outside areas → deselect
    map.on('click', (e: any) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ['areas-fill'] })
      if (features.length === 0) {
        onSelectArea(null)
        map.setFilter('areas-selected', ['==', ['get', 'id'], -1])
      }
    })
  }

  // ─────────────────────────────────────────────────────────
  // 3. SYNC SCORE CHANGES (sliders)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !mapReady) return
    const updated = buildAreasGeoJSON(data, weights)
    mapInst.current.getSource('areas')?.setData(updated)
  }, [weights, mapReady, data])

  // ─────────────────────────────────────────────────────────
  // 4. SYNC SELECTED AREA HIGHLIGHT
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !mapReady) return
    mapInst.current.setFilter('areas-selected', ['==', ['get', 'id'], selected?.id ?? -1])
  }, [selected, mapReady])

  // ─────────────────────────────────────────────────────────
  // 5. LAYER TOGGLE
  // ─────────────────────────────────────────────────────────
  function toggleLayer(key: keyof LayerVisibility) {
    const next = { ...layers, [key]: !layers[key] }
    setLayers(next)
    if (!mapInst.current) return
    const map = mapInst.current
    const layerIds: Record<string, string[]> = {
      crime:   ['crime-heat', 'crime-dot'],
      fatores: ['fatores-dot'],
      cameras: ['cameras-dot'],
      psr:     ['psr-dot'],
      dominio: ['dominio-fill', 'dominio-stroke'],
    }
    layerIds[key].forEach(id => map.setLayoutProperty(id, 'visibility', next[key] ? 'visible' : 'none'))
  }

  // ─────────────────────────────────────────────────────────
  // 6. RENDER
  // ─────────────────────────────────────────────────────────
  const totalCrime   = data.areas.reduce((s, a) => s + a.map_layers.crime_points.length, 0)
  const totalFatores = data.areas.reduce((s, a) => s + a.map_layers.fatores_points.length, 0)
  const totalCameras = data.areas.reduce((s, a) => s + a.stats.cameras_total, 0)
  const totalPSR     = data.areas.reduce((s, a) => s + a.stats.psr_total, 0)
  const totalDominio = data.areas.reduce((s, a) => s + a.dominio_territorial.length, 0)

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* Map container */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Layer controls */}
      <div style={{
        position: 'absolute', top: 12, right: 12,
        background: 'rgba(7,7,10,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(42,42,53,0.9)',
        borderRadius: 3,
        padding: '10px 12px',
        minWidth: 190,
        pointerEvents: 'auto',
      }}>
        <div className="label-overline" style={{ marginBottom: 8 }}>Camadas</div>
        <LayerBtn label="Mancha Criminal"       color="#ff6b35" active={layers.crime}   n={totalCrime}   onClick={() => toggleLayer('crime')} />
        <LayerBtn label="Fatores Urbanos"       color="#36c476" active={layers.fatores} n={totalFatores} onClick={() => toggleLayer('fatores')} />
        <LayerBtn label="Câmeras CIVITAS"       color="#4a90e2" active={layers.cameras} n={totalCameras} onClick={() => toggleLayer('cameras')} />
        <LayerBtn label="Pop. Situação de Rua"  color="#a855f7" active={layers.psr}     n={totalPSR}     onClick={() => toggleLayer('psr')} />
        <LayerBtn label="Domínio Territorial"   color="#fbb040" active={layers.dominio} n={totalDominio} onClick={() => toggleLayer('dominio')} />

        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(42,42,53,0.7)' }}>
          <div className="label-overline" style={{ marginBottom: 5 }}>Legenda Facções</div>
          {[['CV','#ef4444'],['TCP','#a855f7'],['ADA','#4a90e2'],['Milícia','#fbb040']].map(([f, c]) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 8, height: 8, borderRadius: 1, background: c }} />
              <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{f}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Score legend */}
      <div style={{
        position: 'absolute', bottom: 28, left: 48,
        background: 'rgba(7,7,10,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(42,42,53,0.9)',
        borderRadius: 3, padding: '8px 12px',
      }}>
        <div className="label-overline" style={{ marginBottom: 5 }}>Score de Risco</div>
        <div style={{
          width: 140, height: 5,
          background: 'linear-gradient(to right, #2a2a40, #fbb040, #ff6b35, #ef4444)',
          borderRadius: 2,
        }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
          {['0', '25', '50', '75', '100'].map(v => (
            <span key={v} className="mono" style={{ fontSize: 8, color: 'var(--text-muted)' }}>{v}</span>
          ))}
        </div>
      </div>

      {/* Empty state hint */}
      {!selected && (
        <div style={{
          position: 'absolute', bottom: 36, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(7,7,10,0.88)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,107,53,0.3)',
          borderRadius: 3, padding: '8px 16px', pointerEvents: 'none',
        }}>
          <p className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>
            Clique em uma área para analisar · Hover para preview
          </p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

function buildAreasGeoJSON(data: AreasData, w: Props['weights']) {
  return {
    type: 'FeatureCollection' as const,
    features: data.areas.map(area => ({
      type: 'Feature' as const,
      properties: { id: area.id, nome: area.nome, score: computeScore(area, w) },
      geometry: area.geometry,
    })),
  }
}

function scoreInterpolation() {
  return ['interpolate', ['linear'], ['get', 'score'],
    0,  '#1a1a2a',
    20, '#2a3040',
    35, '#8a5020',
    50, '#cc5520',
    65, '#e84020',
    80, '#ef2020',
  ] as any
}

function geomBounds(geom: any): [[number, number], [number, number]] | null {
  const coords: number[][] = []
  const walk = (c: any) => { if (typeof c[0] === 'number') coords.push(c); else c.forEach(walk) }
  if (geom?.coordinates) walk(geom.coordinates)
  if (!coords.length) return null
  const lngs = coords.map(c => c[0]), lats = coords.map(c => c[1])
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]]
}

function LayerBtn({ label, color, active, n, onClick }: {
  label: string; color: string; active: boolean; n: number; onClick: () => void
}) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', padding: '4px 0', background: 'none', border: 'none',
      cursor: 'pointer', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <div style={{
          width: 10, height: 10, border: `1.5px solid ${color}`,
          background: active ? color : 'transparent', borderRadius: 2,
          transition: 'background 0.15s',
        }} />
        <span style={{ fontSize: 11, color: active ? 'var(--text)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>
      <span className="mono" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
        {n.toLocaleString('pt-BR')}
      </span>
    </button>
  )
}
