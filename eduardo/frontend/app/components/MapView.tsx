'use client'

import { useEffect, useRef, useState } from 'react'
import type { Map as MaplibreMap, Popup, Marker, GeoJSONSource } from 'maplibre-gl'
import type { Area, AreasData, MapControl, AgentLayerKey, InspectedPoint } from '../types'
import { scoreColor } from '../lib/helpers'

interface Props {
  data: AreasData
  selected: Area | null
  weights: { mancha: number; pico: number; fatores: number; dinamica: number }
  onSelectArea: (area: Area | null) => void
  mapControlRef?: React.MutableRefObject<MapControl | null>
  highlightedTrechos?: number[]
  onToggleTrecho?: (idx: number) => void
  onSetHighlightedTrechos?: (indices: number[]) => void
  onInspectPoint?: (point: InspectedPoint | null) => void
}

interface LayerVisibility {
  crime: boolean
  fatores: boolean
  cameras: boolean
  psr: boolean
  chamados: boolean
  dominio: boolean
  gaps: boolean
  bairros: boolean
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

export default function MapView({ data, selected, weights, onSelectArea, mapControlRef, highlightedTrechos, onToggleTrecho, onSetHighlightedTrechos, onInspectPoint }: Props) {
  const mapRef   = useRef<HTMLDivElement>(null)
  const mapInst  = useRef<MaplibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const annotationsRef = useRef<Marker[]>([])
  // Selected area mirror, so agent-control methods can look up trechos/bairros without stale closures
  const selectedRef = useRef<Area | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [layers, setLayers] = useState<LayerVisibility>({
    crime: false, fatores: false, cameras: false, psr: false, chamados: false, dominio: false, gaps: false, bairros: true,
  })
  const layersRef = useRef<LayerVisibility>({ crime: false, fatores: false, cameras: false, psr: false, chamados: false, dominio: false, gaps: false, bairros: true })

  const cbRef = useRef({ onToggleTrecho, onInspectPoint, onSetHighlightedTrechos })
  useEffect(() => { cbRef.current = { onToggleTrecho, onInspectPoint, onSetHighlightedTrechos } })

  // ─────────────────────────────────────────────────────────
  // 1. MAP INIT
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || mapInst.current) return
    let map: MaplibreMap
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
  function buildDataLayers(map: MaplibreMap, data: AreasData) {
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

    const gapFeatures = data.areas.flatMap(a =>
      a.camera_gaps.gaps.map(g => ({
        type: 'Feature' as const,
        properties: {
          recommendation: g.recommendation,
          rank: g.rank,
          uncovered_crimes: g.uncovered_crimes,
          justification: g.justification,
        },
        geometry: { type: 'Point' as const, coordinates: [g.lng, g.lat] },
      }))
    )
    map.addSource('gaps', { type: 'geojson', data: { type: 'FeatureCollection', features: gapFeatures } })
    map.addLayer({
      id: 'gaps-dot',
      type: 'circle',
      source: 'gaps',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 8],
        'circle-color': ['match', ['get', 'recommendation'], 'instalar', '#ef4444', '#fbb040'],
        'circle-opacity': 0.9,
        'circle-stroke-color': '#07070a',
        'circle-stroke-width': 1.5,
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

    // ── Chamados 1746 ─────────────────────────────────
    const chamadosFeatures = data.areas.flatMap(a =>
      (a.map_layers.chamados_points || []).map(p => ({
        type: 'Feature' as const,
        properties: { tipo: p.tipo, orgao: p.orgao },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      }))
    )
    map.addSource('chamados', { type: 'geojson', data: { type: 'FeatureCollection', features: chamadosFeatures } })
    map.addLayer({
      id: 'chamados-dot',
      type: 'circle',
      source: 'chamados',
      layout: { visibility: 'none' },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 15, 4],
        'circle-color': '#f59e0b',
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

    // ── Bairros do entorno (shown on area selection) ──
    map.addSource('bairros', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'bairros-fill',
      type: 'fill',
      source: 'bairros',
      paint: {
        'fill-color': '#38bdf8',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.12, 14, 0.07],
      },
    })
    map.addLayer({
      id: 'bairros-stroke',
      type: 'line',
      source: 'bairros',
      paint: {
        'line-color': '#38bdf8',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 1.5],
        'line-opacity': 0.7,
        'line-dasharray': [3, 2],
      },
    })
    map.addLayer({
      id: 'bairros-label',
      type: 'symbol',
      source: 'bairros',
      layout: {
        'text-field': ['get', 'nome'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 9, 14, 12],
        'text-font': ['Open Sans Semibold'],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
        'text-padding': 4,
      },
      paint: {
        'text-color': '#7dd3fc',
        'text-halo-color': 'rgba(7,7,10,0.85)',
        'text-halo-width': 1.5,
      },
    })

    // ── Top trechos — line segments from gazetteer (clipped to FM area) ──
    map.addSource('trechos-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'trechos-line',
      type: 'line',
      source: 'trechos-lines',
      paint: {
        'line-color': '#fbb040',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 15, 3],
        'line-opacity': 0.4,
      },
    })
    map.addLayer({
      id: 'trechos-line-glow',
      type: 'line',
      source: 'trechos-lines',
      paint: {
        'line-color': '#fbb040',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 5, 15, 9],
        'line-opacity': 0.08,
        'line-blur': 3,
      },
    })

    // ── Highlighted trecho lines (bright overlay for selected trechos) ──
    map.addSource('trechos-hl-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'trechos-hl-line-glow',
      type: 'line',
      source: 'trechos-hl-lines',
      paint: {
        'line-color': '#fbb040',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 18],
        'line-opacity': 0.2,
        'line-blur': 5,
      },
    })
    map.addLayer({
      id: 'trechos-hl-line',
      type: 'line',
      source: 'trechos-hl-lines',
      paint: {
        'line-color': '#ffffff',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 15, 4.5],
        'line-opacity': 0.75,
      },
    })

    // ── Nearly-invisible interaction layer for area clicks ──
    map.addLayer({
      id: 'areas-interact',
      type: 'fill',
      source: 'areas',
      paint: {
        'fill-color': '#000000',
        'fill-opacity': 0.01,
      },
    })

    // ── Top trechos — numbered point markers (ABOVE areas-interact for hover) ──
    map.addSource('trechos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'trechos-circle',
      type: 'circle',
      source: 'trechos',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          11, ['case', ['==', ['get', 'highlighted'], 1], 9, 6],
          15, ['case', ['==', ['get', 'highlighted'], 1], 15, 12],
        ],
        'circle-color': [
          'case', ['==', ['get', 'highlighted'], 1],
          '#ffffff', '#fbb040',
        ],
        'circle-opacity': 0.9,
        'circle-stroke-color': [
          'case', ['==', ['get', 'highlighted'], 1],
          '#fbb040', '#07070a',
        ],
        'circle-stroke-width': [
          'case', ['==', ['get', 'highlighted'], 1],
          2.5, 1.5,
        ],
      },
    })
    map.addLayer({
      id: 'trechos-label',
      type: 'symbol',
      source: 'trechos',
      layout: {
        'text-field': ['get', 'rank'],
        'text-size': 9,
        'text-font': ['Open Sans Bold'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': [
          'case', ['==', ['get', 'highlighted'], 1],
          '#fbb040', '#07070a',
        ],
      },
    })

    // ── Agent: highlighted street segments ───────────────
    map.addSource('agent-highlights', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-highlights-glow',
      type: 'line',
      source: 'agent-highlights',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 12, 15, 22],
        'line-opacity': 0.25,
        'line-blur': 6,
      },
    })
    map.addLayer({
      id: 'agent-highlights-line',
      type: 'line',
      source: 'agent-highlights',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 4, 15, 8],
        'line-opacity': 0.95,
      },
    })
    map.addLayer({
      id: 'agent-highlights-label',
      type: 'symbol',
      source: 'agent-highlights',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 10, 15, 13],
        'text-font': ['Open Sans Bold'],
        'symbol-placement': 'line',
        'text-allow-overlap': false,
        'text-padding': 6,
      },
      paint: {
        'text-color': '#fffbe6',
        'text-halo-color': 'rgba(7,7,10,0.95)',
        'text-halo-width': 2,
      },
    })

    // ── Agent: temporary route lines (e.g. fuga from RELINT) ──
    map.addSource('agent-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-routes-line',
      type: 'line',
      source: 'agent-routes',
      paint: {
        'line-color': '#22d3ee',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 5],
        'line-opacity': 0.9,
        'line-dasharray': [2, 1.5],
      },
    })
    map.addLayer({
      id: 'agent-routes-label',
      type: 'symbol',
      source: 'agent-routes',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Open Sans Semibold'],
        'symbol-placement': 'line-center',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#a5f3fc',
        'text-halo-color': 'rgba(7,7,10,0.95)',
        'text-halo-width': 2,
      },
    })

    // ── Agent: focused bairro highlight ──
    map.addSource('agent-bairro-focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-bairro-focus-fill',
      type: 'fill',
      source: 'agent-bairro-focus',
      paint: {
        'fill-color': '#38bdf8',
        'fill-opacity': 0.22,
      },
    })
    map.addLayer({
      id: 'agent-bairro-focus-stroke',
      type: 'line',
      source: 'agent-bairro-focus',
      paint: {
        'line-color': '#38bdf8',
        'line-width': 3,
        'line-opacity': 0.95,
      },
    })

    // ── Interactions ─────────────────────────────────────

    const interactiveLayers = ['trechos-circle', 'fatores-dot', 'chamados-dot']
    function hitsInteractive(point: any) {
      for (const l of interactiveLayers) {
        if (map.queryRenderedFeatures(point, { layers: [l] }).length > 0) return true
      }
      return false
    }

    // Click area (skip if a more specific layer was hit)
    map.on('click', 'areas-interact', (e: any) => {
      if (hitsInteractive(e.point)) return
      const id = e.features[0].properties.id
      const area = data.areas.find(a => a.id === id) ?? null
      if (!area) return
      onSelectArea(area)
      map.setFilter('areas-selected', ['==', ['get', 'id'], id])
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

    // Hover popup on area
    map.on('mouseenter', 'areas-interact', (e: any) => {
      map.getCanvas().style.cursor = 'pointer'
      const f = e.features[0]
      const id = f.properties.id
      const area = data.areas.find(a => a.id === id)
      if (!area) return
      map.setFilter('areas-hover', ['==', ['get', 'id'], id])
      const score = computeScore(area, weights)
      const scoreCol = scoreColor(score)
      popupRef.current
        ?.setLngLat(e.lngLat)
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

    map.on('mousemove', 'areas-interact', (e: any) => {
      popupRef.current?.setLngLat(e.lngLat)
    })

    map.on('mouseleave', 'areas-interact', () => {
      map.getCanvas().style.cursor = ''
      map.setFilter('areas-hover', ['==', ['get', 'id'], -1])
      popupRef.current?.remove()
    })

    // Hover on bairro entorno
    map.on('mouseenter', 'bairros-fill', (e: any) => {
      if (map.getCanvas().style.cursor === 'pointer') return
      map.getCanvas().style.cursor = 'crosshair'
      const p = e.features[0].properties
      const pop = Number(p.populacao || 0)
      const dd = Number(p.denuncias || 0)
      const ch = Number(p.chamados_1746 || 0)
      popupRef.current
        ?.setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:180px">
          <div style="font-size:9px;color:#38bdf8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Bairro do Entorno</div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px">${p.nome}</div>
          <div style="display:flex;gap:14px;font-size:11px">
            <div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Populacao</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${pop > 0 ? pop.toLocaleString('pt-BR') : '—'}</div></div>
            <div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Denuncias</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${dd > 0 ? dd.toLocaleString('pt-BR') : '—'}</div></div>
            ${ch > 0 ? `<div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">1746</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${ch.toLocaleString('pt-BR')}</div></div>` : ''}
          </div>
        </div>`)
        .addTo(map)
    })
    map.on('mousemove', 'bairros-fill', (e: any) => {
      popupRef.current?.setLngLat(e.lngLat)
    })
    map.on('mouseleave', 'bairros-fill', () => {
      if (map.getCanvas().style.cursor === 'crosshair') map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })

    // Hover on trecho markers
    map.on('mouseenter', 'trechos-circle', (e: any) => {
      map.getCanvas().style.cursor = 'pointer'
      const p = e.features[0].properties
      const picoH = Number(p.pico) || 0
      const bingo = Number(p.bingo) || 0
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:190px;max-width:240px">
          <div style="font-size:9px;color:#fbb040;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">#${p.rank} Trecho Crítico${bingo >= 2 ? ' · BINGO' : ''}</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;text-transform:capitalize">${p.name}</div>
          <div style="display:flex;gap:10px;font-size:11px;flex-wrap:wrap">
            <div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Total</div><div style="font-weight:600;font-variant-numeric:tabular-nums;color:#fbb040">${Number(p.total).toLocaleString('pt-BR')}</div></div>
            <div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Transeunte</div><div style="font-variant-numeric:tabular-nums">${Number(p.transeunte).toLocaleString('pt-BR')}</div></div>
            <div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Celular</div><div style="font-variant-numeric:tabular-nums">${Number(p.celular).toLocaleString('pt-BR')}</div></div>
            <div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Coletivo</div><div style="font-variant-numeric:tabular-nums">${Number(p.coletivo).toLocaleString('pt-BR')}</div></div>
          </div>
          <div style="margin-top:5px;font-size:10px;color:#8a8a95">Pico: ${picoH}h · Clique para selecionar</div>
        </div>`)
        .addTo(map)
    })
    map.on('mousemove', 'trechos-circle', (e: any) => {
      popupRef.current?.setLngLat(e.lngLat)
    })
    map.on('mouseleave', 'trechos-circle', () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })

    // Click on trecho marker → toggle highlight
    map.on('click', 'trechos-circle', (e: any) => {
      const idx = Number(e.features[0].properties.idx)
      if (!isNaN(idx)) cbRef.current.onToggleTrecho?.(idx)
    })

    // ── Fatores Urbanos hover + click ──
    map.on('mouseenter', 'fatores-dot', (e: any) => {
      map.getCanvas().style.cursor = 'pointer'
      const p = e.features[0].properties
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:180px;max-width:240px">
          <div style="font-size:9px;color:#36c476;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Fator Urbano</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:5px">${p.tipo || '—'}</div>
          <div style="display:flex;gap:10px;font-size:11px;flex-wrap:wrap">
            ${p.orgao ? `<div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Órgão</div><div style="font-weight:500">${p.orgao}</div></div>` : ''}
            ${p.logradouro ? `<div><div style="color:#4a4a55;font-size:9px;text-transform:uppercase">Local</div><div style="font-weight:500;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.logradouro}</div></div>` : ''}
          </div>
          <div style="margin-top:5px;font-size:9px;color:#4a4a55;font-style:italic">Clique para detalhar →</div>
        </div>`)
        .addTo(map)
    })
    map.on('mousemove', 'fatores-dot', (e: any) => {
      popupRef.current?.setLngLat(e.lngLat)
    })
    map.on('mouseleave', 'fatores-dot', () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })
    map.on('click', 'fatores-dot', (e: any) => {
      const p = e.features[0].properties
      const coords = e.features[0].geometry.coordinates
      cbRef.current.onInspectPoint?.({
        type: 'fator',
        lat: coords[1],
        lng: coords[0],
        properties: { tipo: p.tipo, orgao: p.orgao, logradouro: p.logradouro },
      })
      popupRef.current?.remove()
    })

    // ── Chamados 1746 hover + click ──
    map.on('mouseenter', 'chamados-dot', (e: any) => {
      map.getCanvas().style.cursor = 'pointer'
      const p = e.features[0].properties
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:180px;max-width:240px">
          <div style="font-size:9px;color:#f59e0b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Chamado 1746</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:5px">${p.tipo || '—'}</div>
          ${p.orgao ? `<div style="font-size:11px"><span style="color:#4a4a55;font-size:9px;text-transform:uppercase">Órgão</span> <span style="font-weight:500">${p.orgao}</span></div>` : ''}
          <div style="margin-top:5px;font-size:9px;color:#4a4a55;font-style:italic">Clique para detalhar →</div>
        </div>`)
        .addTo(map)
    })
    map.on('mousemove', 'chamados-dot', (e: any) => {
      popupRef.current?.setLngLat(e.lngLat)
    })
    map.on('mouseleave', 'chamados-dot', () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })
    map.on('click', 'chamados-dot', (e: any) => {
      const p = e.features[0].properties
      const coords = e.features[0].geometry.coordinates
      cbRef.current.onInspectPoint?.({
        type: 'chamado',
        lat: coords[1],
        lng: coords[0],
        properties: { tipo: p.tipo, orgao: p.orgao },
      })
      popupRef.current?.remove()
    })

    map.on('mouseenter', 'gaps-dot', (e: any) => {
      map.getCanvas().style.cursor = 'pointer'
      const f = e.features[0].properties
      popupRef.current
        ?.setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;max-width:220px">
          <div style="font-size:9px;color:${f.recommendation === 'instalar' ? '#ef4444' : '#fbb040'};text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">#${f.rank} ${f.recommendation}</div>
          <div style="font-size:11px;margin-bottom:4px">${f.uncovered_crimes} ocorrências sem cobertura</div>
          <div style="font-size:10px;color:#8a8a95">${f.justification}</div>
        </div>`)
        .addTo(map)
    })
    map.on('mouseleave', 'gaps-dot', () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })

    // Click outside interactive elements → deselect
    map.on('click', (e: any) => {
      const areaHit = map.queryRenderedFeatures(e.point, { layers: ['areas-interact'] })
      if (areaHit.length > 0 || hitsInteractive(e.point)) return
      onSelectArea(null)
      map.setFilter('areas-selected', ['==', ['get', 'id'], -1])
    })
  }

  // ─────────────────────────────────────────────────────────
  // 3. SYNC SCORE CHANGES (sliders)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !mapReady) return
    const updated = buildAreasGeoJSON(data, weights)
    ;(mapInst.current.getSource('areas') as GeoJSONSource | undefined)?.setData(updated)
  }, [weights, mapReady, data])

  // ─────────────────────────────────────────────────────────
  // 4a. SYNC SELECTED AREA (polygon + bairros)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    selectedRef.current = selected
    if (!mapInst.current || !mapReady) return
    const map = mapInst.current
    map.setFilter('areas-selected', ['==', ['get', 'id'], selected?.id ?? -1])

    const bairroFeatures = selected?.bairros_entorno
      ? selected.bairros_entorno.map(b => ({
          type: 'Feature' as const,
          properties: { nome: b.nome, populacao: b.populacao, denuncias: b.denuncias, chamados_1746: b.chamados_1746 },
          geometry: b.geometry,
        }))
      : []
    ;(map.getSource('bairros') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: bairroFeatures })
  }, [selected, mapReady])

  // ─────────────────────────────────────────────────────────
  // 4b. SYNC TRECHOS (depends on selected + highlights)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInst.current || !mapReady) return
    const map = mapInst.current
    const hl = new Set(highlightedTrechos ?? [])

    const trechoPointFeatures = selected
      ? selected.top_trechos
          .filter(t => t.lat && t.lng)
          .map((t, i) => ({
            type: 'Feature' as const,
            properties: {
              idx: i,
              rank: String(i + 1),
              name: t.locf_norm,
              total: t.total,
              transeunte: t.roubo_transeunte,
              celular: t.roubo_celular,
              coletivo: t.roubo_coletivo,
              pico: t.pico_hora,
              bingo: t.bingo_count ?? 0,
              highlighted: hl.has(i) ? 1 : 0,
            },
            geometry: { type: 'Point' as const, coordinates: [t.lng, t.lat] },
          }))
      : []
    ;(map.getSource('trechos') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: trechoPointFeatures })

    const trechoLineFeatures = selected
      ? selected.top_trechos
          .filter(t => t.line_geometry)
          .map((t, i) => ({
            type: 'Feature' as const,
            properties: { rank: i + 1, name: t.locf_norm, total: t.total },
            geometry: t.line_geometry!,
          }))
      : []
    ;(map.getSource('trechos-lines') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: trechoLineFeatures })

    const hlLineFeatures = selected
      ? selected.top_trechos
          .map((t, i) => ({ t, i }))
          .filter(({ t, i }) => hl.has(i) && t.line_geometry)
          .map(({ t, i }) => ({
            type: 'Feature' as const,
            properties: { rank: i + 1, name: t.locf_norm },
            geometry: t.line_geometry!,
          }))
      : []
    ;(map.getSource('trechos-hl-lines') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: hlLineFeatures })
  }, [selected, mapReady, highlightedTrechos])

  // ─────────────────────────────────────────────────────────
  // 5. LAYER TOGGLE
  // ─────────────────────────────────────────────────────────
  const LAYER_IDS: Record<string, string[]> = {
    crime:    ['crime-heat', 'crime-dot'],
    fatores:  ['fatores-dot'],
    cameras:  ['cameras-dot'],
    psr:      ['psr-dot'],
    chamados: ['chamados-dot'],
    dominio:  ['dominio-fill', 'dominio-stroke'],
    gaps:     ['gaps-dot'],
    bairros:  ['bairros-fill', 'bairros-stroke', 'bairros-label'],
  }

  function setLayerVisible(key: keyof LayerVisibility, visible: boolean) {
    setLayers(prev => {
      const next = { ...prev, [key]: visible }
      layersRef.current = next
      return next
    })
    const map = mapInst.current
    if (!map) return
    LAYER_IDS[key]?.forEach(id =>
      map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
    )
  }

  function toggleLayer(key: keyof LayerVisibility) {
    setLayerVisible(key, !layersRef.current[key])
  }

  // ─────────────────────────────────────────────────────────
  // 6. EXPOSE MAP CONTROL REF (for agent)
  // ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !mapControlRef) return

    mapControlRef.current = {
      toggleLayer: (layer: AgentLayerKey, visible: boolean) => {
        setLayerVisible(layer, visible)
      },

      zoomToArea: (areaId: number) => {
        const area = data.areas.find(a => a.id === areaId)
        if (!area || !mapInst.current) return
        const bounds = geomBounds(area.geometry as any)
        if (bounds) {
          mapInst.current.fitBounds(bounds, {
            padding: { top: 80, bottom: 80, left: 80, right: 80 },
            maxZoom: 14,
            duration: 900,
            easing: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
          })
        }
        mapInst.current.setFilter('areas-selected', ['==', ['get', 'id'], areaId])
      },

      addAnnotation: (lat: number, lng: number, title: string, body: string) => {
        import('maplibre-gl').then(({ default: maplibregl }) => {
          if (!mapInst.current) return
          const el = document.createElement('div')
          el.style.cssText = [
            'width:10px', 'height:10px', 'border-radius:50%',
            'background:#fbb040', 'border:2px solid #07070a',
            'cursor:pointer', 'box-shadow:0 0 6px rgba(251,176,64,0.5)',
          ].join(';')
          const popup = new maplibregl.Popup({ closeButton: false, offset: 8, maxWidth: '200px' })
            .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3">
              <div style="font-size:10px;font-weight:600;margin-bottom:2px">${title}</div>
              <div style="font-size:10px;color:#8a8a95">${body}</div>
            </div>`)
          const marker = new maplibregl.Marker({ element: el })
            .setLngLat([lng, lat])
            .setPopup(popup)
            .addTo(mapInst.current)
          annotationsRef.current.push(marker)
        })
      },

      clearAnnotations: () => {
        annotationsRef.current.forEach(m => m.remove())
        annotationsRef.current = []
      },

      snapshotLayers: () => ({ ...layersRef.current }),

      restoreLayers: (snapshot: Record<AgentLayerKey, boolean>) => {
        Object.entries(snapshot).forEach(([key, visible]) => {
          setLayerVisible(key as AgentLayerKey, visible)
        })
      },

      highlightTrecho: (locfNorm: string, opts?: { color?: string; label?: string }) => {
        const map = mapInst.current
        const sel = selectedRef.current
        if (!map || !sel) return false
        const target = locfNorm.trim().toLowerCase()
        const t = sel.top_trechos.find(
          x => x.locf_norm.trim().toLowerCase() === target,
        )
        if (!t || !t.line_geometry) return false
        const color = opts?.color ?? '#fbb040'
        const label = opts?.label ?? t.locf_norm
        const src = map.getSource('agent-highlights') as GeoJSONSource | undefined
        if (!src) return false
        const existing = (src as any)._data?.features ?? []
        src.setData({
          type: 'FeatureCollection',
          features: [
            ...existing,
            {
              type: 'Feature',
              properties: { color, label, total: t.total },
              geometry: t.line_geometry,
            },
          ],
        })
        if (typeof t.lat === 'number' && typeof t.lng === 'number') {
          map.flyTo({ center: [t.lng, t.lat], zoom: Math.max(map.getZoom(), 14), duration: 800 })
        }
        return true
      },

      highlightTopTrechos: (n: number) => {
        const map = mapInst.current
        const sel = selectedRef.current
        if (!map || !sel) return
        const features = sel.top_trechos
          .slice(0, Math.max(1, n))
          .filter(t => t.line_geometry)
          .map((t, i) => ({
            type: 'Feature' as const,
            properties: {
              color: i === 0 ? '#ef4444' : i < 3 ? '#fbb040' : '#fde68a',
              label: `${i + 1}. ${t.locf_norm}`,
              total: t.total,
            },
            geometry: t.line_geometry!,
          }))
        ;(map.getSource('agent-highlights') as GeoJSONSource | undefined)
          ?.setData({ type: 'FeatureCollection', features })
      },

      clearHighlights: () => {
        const map = mapInst.current
        if (!map) return
        ;(map.getSource('agent-highlights') as GeoJSONSource | undefined)
          ?.setData({ type: 'FeatureCollection', features: [] })
        ;(map.getSource('agent-routes') as GeoJSONSource | undefined)
          ?.setData({ type: 'FeatureCollection', features: [] })
        ;(map.getSource('agent-bairro-focus') as GeoJSONSource | undefined)
          ?.setData({ type: 'FeatureCollection', features: [] })
      },

      focusBairro: (nome: string) => {
        const map = mapInst.current
        const sel = selectedRef.current
        if (!map || !sel?.bairros_entorno) return false
        const target = nome.trim().toLowerCase()
        const b = sel.bairros_entorno.find(
          x => x.nome.trim().toLowerCase() === target
            || x.nome.trim().toLowerCase().includes(target),
        )
        if (!b) return false
        ;(map.getSource('agent-bairro-focus') as GeoJSONSource | undefined)?.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: { nome: b.nome }, geometry: b.geometry }],
        })
        const bounds = geomBounds(b.geometry as any)
        if (bounds) {
          map.fitBounds(bounds, {
            padding: 80,
            maxZoom: 15,
            duration: 900,
          })
        }
        return true
      },

      setTimeFilter: (horaInicio: number | null, horaFim: number | null) => {
        const map = mapInst.current
        if (!map) return
        const reset = horaInicio === null && horaFim === null
        const filter: any = reset
          ? null
          : [
              'all',
              ['!=', ['get', 'h'], null],
              ['>=', ['to-number', ['get', 'h']], Math.max(0, horaInicio ?? 0)],
              ['<', ['to-number', ['get', 'h']], Math.min(24, horaFim ?? 24)],
            ]
        ;['crime-heat', 'crime-dot'].forEach(id => {
          try { map.setFilter(id, filter) } catch { /* layer not ready */ }
        })
      },

      showRoute: (from: [number, number], to: [number, number], label?: string) => {
        const map = mapInst.current
        if (!map) return
        const src = map.getSource('agent-routes') as GeoJSONSource | undefined
        if (!src) return
        const existing = (src as any)._data?.features ?? []
        src.setData({
          type: 'FeatureCollection',
          features: [
            ...existing,
            {
              type: 'Feature',
              properties: { label: label ?? '' },
              geometry: { type: 'LineString', coordinates: [[from[0], from[1]], [to[0], to[1]]] },
            },
          ],
        })
      },
    }
  }, [mapReady, mapControlRef, data])

  // ─────────────────────────────────────────────────────────
  // 7. RENDER
  // ─────────────────────────────────────────────────────────
  const totalCrime   = data.areas.reduce((s, a) => s + a.map_layers.crime_points.length, 0)
  const totalFatores = data.areas.reduce((s, a) => s + a.map_layers.fatores_points.length, 0)
  const totalCameras = data.areas.reduce((s, a) => s + a.stats.cameras_total, 0)
  const totalPSR     = data.areas.reduce((s, a) => s + a.stats.psr_total, 0)
  const totalChamados = data.areas.reduce((s, a) => s + (a.map_layers.chamados_points?.length || 0), 0)
  const totalDominio = data.areas.reduce((s, a) => s + a.dominio_territorial.length, 0)
  const totalGaps    = data.areas.reduce((s, a) => s + a.camera_gaps.gaps.length, 0)
  const totalBairros = selected?.bairros_entorno?.length ?? 0

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
        {totalChamados > 0 && <LayerBtn label="Chamados 1746"  color="#f59e0b" active={layers.chamados} n={totalChamados} onClick={() => toggleLayer('chamados')} />}
        <LayerBtn label="Domínio Territorial"   color="#fbb040" active={layers.dominio} n={totalDominio} onClick={() => toggleLayer('dominio')} />
        <LayerBtn label="Pontos Cegos"          color="#ef4444" active={layers.gaps}    n={totalGaps}    onClick={() => toggleLayer('gaps')} />
        {selected && <LayerBtn label="Bairros Entorno" color="#38bdf8" active={layers.bairros} n={totalBairros} onClick={() => toggleLayer('bairros')} />}

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
