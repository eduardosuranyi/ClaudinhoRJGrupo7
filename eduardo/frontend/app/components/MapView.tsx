'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Map as MaplibreMap, Popup, Marker, GeoJSONSource } from 'maplibre-gl'
import type { Area, AreasData, MapControl, AgentLayerKey, InspectedPoint, RioContext } from '../types'
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
  censo: boolean
  rioRings: boolean
  rioCrime: boolean
  rioDD: boolean
  rioDominio: boolean
}

// Hour-window presets for the user-facing time filter
const TIME_PRESETS: [string, number | null, number | null][] = [
  ['Tudo', null, null],
  ['Madrugada', 0, 6],
  ['Manhã', 6, 12],
  ['Tarde', 12, 18],
  ['Noite', 18, 24],
]

// Period-of-day label for a given hour (matches TIME_PRESETS bands)
function dayPart(h: number): string {
  return h < 6 ? 'Madrugada' : h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite'
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
  // Manual route-picking ("Traçar rota"): the operator clicks origin then destination.
  const routePickRef = useRef<{ active: boolean; from: [number, number] | null; onDone?: (r: any) => void }>({ active: false, from: null })
  const routeStartMarkerRef = useRef<Marker | null>(null)
  // Suppresses area select/deselect on the same click that drives a route pick.
  const pickGuardRef = useRef(false)
  const [routePickActive, setRoutePickActive] = useState(false)
  const [routePickHint, setRoutePickHint] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)
  const [layers, setLayers] = useState<LayerVisibility>({
    crime: false, fatores: false, cameras: false, psr: false, chamados: false, dominio: false, gaps: false, bairros: true,
    censo: false, rioRings: false, rioCrime: false, rioDD: false, rioDominio: false,
  })
  const layersRef = useRef<LayerVisibility>({
    crime: false, fatores: false, cameras: false, psr: false, chamados: false, dominio: false, gaps: false, bairros: true,
    censo: false, rioRings: false, rioCrime: false, rioDD: false, rioDominio: false,
  })

  const agentHighlightFeatures = useRef<any[]>([])
  // Accumulated agent features per source — tracked in refs instead of reading the
  // map source's private `_data`, which is unreliable and made each new circle/route
  // replace the previous one.
  const agentRadiusFeatures = useRef<any[]>([])
  const agentRouteFeatures = useRef<any[]>([])

  // Lazy-loaded census choropleth GeoJSON (fetched on first toggle)
  const censoLoaded = useRef(false)
  const [censoCount, setCensoCount] = useState(0)
  // Lazy-loaded Rio context (city-wide layers, fetched on first toggle)
  const rioLoaded = useRef(false)
  const [rioCtx, setRioCtx] = useState<RioContext | null>(null)

  // Active crime time filter (hour window) — shared by the agent and the user control + on-map badge
  const [timeFilter, setTimeFilter] = useState<{ start: number | null; end: number | null }>({ start: null, end: null })
  // Comparison legend entries (compare_trechos)
  const [comparison, setComparison] = useState<{ color: string; label: string; total: number }[] | null>(null)
  // Timeline animation progress (animate_timeline)
  const [timeline, setTimeline] = useState<{ hour: number; shown: number; total: number; done: boolean } | null>(null)
  const timelineTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastTimelineOptsRef = useRef<{ tipo?: 'transeunte' | 'celular' | 'coletivo'; stepMs?: number } | undefined>(undefined)
  // Route animation (play_route_animation) + location pings (pulse_location)
  const routeAnimRaf = useRef<number | null>(null)
  const pulsesRef = useRef<Marker[]>([])

  const cbRef = useRef({ onToggleTrecho, onInspectPoint, onSetHighlightedTrechos })
  useEffect(() => { cbRef.current = { onToggleTrecho, onInspectPoint, onSetHighlightedTrechos } })

  // Apply (or reset) the crime hour filter on the map AND mirror it into React state so the
  // on-map badge + user control stay in sync. Shared by the agent tool and the user control.
  const applyTimeFilter = useCallback((start: number | null, end: number | null) => {
    const map = mapInst.current
    const reset = start === null && end === null
    const filter: any = reset
      ? null
      : [
          'all',
          ['!=', ['get', 'h'], null],
          ['>=', ['to-number', ['get', 'h']], Math.max(0, start ?? 0)],
          ['<', ['to-number', ['get', 'h']], Math.min(24, end ?? 24)],
        ]
    if (map) {
      ;['crime-heat', 'crime-dot'].forEach(id => {
        try { map.setFilter(id, filter) } catch { /* layer not ready */ }
      })
    }
    setTimeFilter({ start: reset ? null : start, end: reset ? null : end })
  }, [])

  // Stop any running timeline animation and clear its layer + badge.
  const stopTimeline = useCallback(() => {
    if (timelineTimer.current) { clearInterval(timelineTimer.current); timelineTimer.current = null }
    setTimeline(null)
    const map = mapInst.current
    ;(map?.getSource('crime-timeline') as GeoJSONSource | undefined)
      ?.setData({ type: 'FeatureCollection', features: [] })
  }, [])

  // Run (or replay) the timeline animation. New crimes for the current hour are tagged isNew=1 so
  // the paint can pop them; accumulated ones dim. Shared by the agent tool and the badge replay.
  const runTimeline = useCallback((opts?: { tipo?: 'transeunte' | 'celular' | 'coletivo'; stepMs?: number }) => {
    const map = mapInst.current
    const sel = selectedRef.current
    if (!map || !sel) return
    stopTimeline()
    lastTimelineOptsRef.current = opts
    const src = map.getSource('crime-timeline') as GeoJSONSource | undefined
    if (!src) return
    const pts = sel.map_layers.crime_points.filter(p => p.h !== null && (!opts?.tipo || matchTipo(p.tipo, opts.tipo)))
    if (pts.length === 0) { setTimeline(null); return }   // no broken empty run
    const total = pts.length
    const bounds = geomBounds(sel.geometry as any)
    if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 600 })
    let hour = 0
    const stepMs = Math.max(200, opts?.stepMs ?? 600)
    const tick = () => {
      const feats = pts
        .filter(p => (p.h as number) <= hour)
        .map(p => ({
          type: 'Feature' as const,
          properties: { isNew: (p.h as number) === hour ? 1 : 0 },
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        }))
      src.setData({ type: 'FeatureCollection', features: feats })
      const done = hour >= 23
      setTimeline({ hour, shown: feats.length, total, done })
      if (done && timelineTimer.current) { clearInterval(timelineTimer.current); timelineTimer.current = null }
      hour += 1
    }
    tick()
    timelineTimer.current = setInterval(tick, stepMs)
  }, [stopTimeline])

  // Stop any running route animation and clear its layers.
  const stopRouteAnim = useCallback(() => {
    if (routeAnimRaf.current) { cancelAnimationFrame(routeAnimRaf.current); routeAnimRaf.current = null }
    const map = mapInst.current
    ;['agent-route-anim-line', 'agent-route-anim-trail', 'agent-route-anim-dot'].forEach(id => {
      ;(map?.getSource(id) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] })
    })
  }, [])

  // Animate a glowing dot traveling along a path, drawing a bright trail behind it.
  // Smooth via requestAnimationFrame with ease-in-out motion.
  const runRouteAnimation = useCallback((path: [number, number][], opts?: { durationMs?: number; color?: string; label?: string; loop?: boolean }) => {
    const map = mapInst.current
    if (!map || path.length < 2) return
    stopRouteAnim()
    const color = opts?.color ?? '#22d3ee'
    ;(map.getSource('agent-route-anim-line') as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { color, label: opts?.label ?? '' }, geometry: { type: 'LineString', coordinates: path } }],
    })
    const segLen: number[] = []
    const cum = [0]
    let totalLen = 0
    for (let i = 1; i < path.length; i++) {
      const d = haversineM(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1])
      segLen.push(d); totalLen += d; cum.push(totalLen)
    }
    const lngs = path.map(p => p[0]), lats = path.map(p => p[1])
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 100, maxZoom: 15, duration: 600 })
    const duration = Math.max(800, opts?.durationMs ?? 4000)
    const dotSrc = map.getSource('agent-route-anim-dot') as GeoJSONSource | undefined
    const trailSrc = map.getSource('agent-route-anim-trail') as GeoJSONSource | undefined
    const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2) // easeInOutQuad
    let start: number | null = null
    const frame = (ts: number) => {
      if (start === null) start = ts
      let raw = (ts - start) / duration
      if (raw >= 1) { if (opts?.loop) { start = ts; raw = 0 } else raw = 1 }
      const t = ease(Math.min(1, Math.max(0, raw)))
      const target = t * totalLen
      let pos: [number, number] = path[path.length - 1]
      const traveled: [number, number][] = [path[0]]
      for (let i = 0; i < segLen.length; i++) {
        if (cum[i + 1] < target) { traveled.push(path[i + 1]); continue }
        const f = segLen[i] > 0 ? (target - cum[i]) / segLen[i] : 0
        pos = [path[i][0] + (path[i + 1][0] - path[i][0]) * f, path[i][1] + (path[i + 1][1] - path[i][1]) * f]
        traveled.push(pos)
        break
      }
      dotSrc?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: pos } }] })
      trailSrc?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { color }, geometry: { type: 'LineString', coordinates: traveled } }] })
      if (raw < 1 || opts?.loop) routeAnimRaf.current = requestAnimationFrame(frame)
      else routeAnimRaf.current = null
    }
    routeAnimRaf.current = requestAnimationFrame(frame)
  }, [stopRouteAnim])

  // Stop animations when the selected area changes; cancel raf/interval on unmount.
  useEffect(() => { stopTimeline(); stopRouteAnim() }, [selected, stopTimeline, stopRouteAnim])
  useEffect(() => () => {
    if (timelineTimer.current) clearInterval(timelineTimer.current)
    if (routeAnimRaf.current) cancelAnimationFrame(routeAnimRaf.current)
    pulsesRef.current.forEach(m => m.remove())
    pulsesRef.current = []
  }, [])

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
        registerMapIcons(map)
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
        // Baixa no zoom-out p/ nao saturar tudo em branco (mancha grande "sem divisao"),
        // sobe gradualmente conforme aproxima.
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.25, 13, 1, 15, 2.5],
        // Rampa com mais paradas e inicio translucido = bordas suaves (feather) e gradiente visivel.
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0,    'rgba(0,0,0,0)',
          0.1,  'rgba(180,60,30,0.0)',
          0.25, 'rgba(180,60,30,0.4)',
          0.45, 'rgba(255,107,53,0.6)',
          0.65, 'rgba(255,140,40,0.75)',
          0.85, 'rgba(251,176,64,0.88)',
          1,    'rgba(255,255,200,0.95)',
        ],
        // Raio um pouco maior no zoom-out faz os kernels se misturarem suavemente.
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 14, 14, 24],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 15, 0],
      },
    })
    map.addLayer({
      id: 'crime-dot',
      type: 'symbol',
      source: 'crime',
      minzoom: 13,
      layout: {
        visibility: 'none',
        'icon-image': ['match', ['get', 'tipo'],
          'Roubo a transeunte',       'icon-crime-transeunte',
          'Roubo de aparelho celular', 'icon-crime-celular',
          'Roubo em coletivo',         'icon-crime-coletivo',
          'icon-crime-default',
        ],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.38, 17, 0.75],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
      // Fade de entrada em vez de 'pop' seco: cresce de 0 (z13.5) a 0.9 (z14.5).
      paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 13.5, 0, 14.5, 0.9] },
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
      type: 'symbol',
      source: 'fatores',
      layout: {
        visibility: 'none',
        'icon-image': ['match', ['get', 'orgao'],
          'COMLURB',    'icon-fator-comlurb',
          'Rio Luz',    'icon-fator-rioluz',
          'SEOP',       'icon-fator-seop',
          'SECONSERVA', 'icon-fator-seconserva',
          'SMAS',       'icon-fator-smas',
          'CET-Rio',    'icon-fator-cetrio',
          'icon-fator-default',
        ],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.4, 15, 0.7],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': 0.9 },
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
      type: 'symbol',
      source: 'cameras',
      layout: {
        visibility: 'none',
        'icon-image': 'icon-camera',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.35, 15, 0.65],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': 0.8 },
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
      type: 'symbol',
      source: 'gaps',
      layout: {
        visibility: 'none',
        'icon-image': ['match', ['get', 'recommendation'],
          'instalar',  'icon-gap-instalar',
          'icon-gap-remanejar',
        ],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.5, 15, 0.85],
        'icon-allow-overlap': true,
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': 0.95 },
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
      type: 'symbol',
      source: 'psr',
      layout: {
        visibility: 'none',
        'icon-image': 'icon-psr',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.32, 15, 0.55],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': 0.6 },
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
      type: 'symbol',
      source: 'chamados',
      layout: {
        visibility: 'none',
        'icon-image': 'icon-chamado',
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.32, 15, 0.55],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 0,
      },
      paint: { 'icon-opacity': 0.6 },
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 2],
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

    // ── Censo 2022 choropleth (lazy-loaded GeoJSON, initially empty) ──
    map.addSource('censo', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'censo-fill',
      type: 'fill',
      source: 'censo',
      paint: {
        'fill-color': ['interpolate', ['linear'], ['get', 'densidade_hab_km2'],
          0, '#eff6ff', 3000, '#93c5fd', 10000, '#3b82f6', 25000, '#1e40af', 50000, '#1e3a5f'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.45, 14, 0.25],
      },
      layout: { visibility: 'none' },
    })
    map.addLayer({
      id: 'censo-stroke',
      type: 'line',
      source: 'censo',
      paint: {
        'line-color': '#60a5fa',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 15, 1],
        'line-opacity': 0.5,
      },
      layout: { visibility: 'none' },
    })

    // ── Rio context layers (lazy-loaded, initially empty) ──
    map.addSource('rio-rings', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'rio-rings-fill',
      type: 'fill',
      source: 'rio-rings',
      paint: {
        'fill-color': '#a5f3fc',
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.1, 14, 0.06, 16, 0.04],
      },
      layout: { visibility: 'none' },
    })
    map.addLayer({
      id: 'rio-rings-stroke',
      type: 'line',
      source: 'rio-rings',
      paint: {
        'line-color': '#22d3ee',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.5, 16, 2.5],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 0.7],
        'line-dasharray': [4, 3],
      },
      layout: { visibility: 'none' },
    })

    map.addSource('rio-crime', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'rio-crime-heat',
      type: 'heatmap',
      source: 'rio-crime',
      paint: {
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 0.15, 11, 0.4, 13, 1, 15, 1.5],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 8, 11, 14, 14, 22, 16, 28],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.35, 16, 0],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)', 0.15, 'rgba(255,107,53,0.3)', 0.4, 'rgba(255,107,53,0.55)',
          0.7, '#fbb040', 1, '#ef4444',
        ],
      },
      layout: { visibility: 'none' },
    })
    map.addLayer({
      id: 'rio-crime-dot',
      type: 'circle',
      source: 'rio-crime',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2, 16, 5],
        'circle-color': ['match', ['get', 'tipo'],
          'Roubo a transeunte', '#ff6b35',
          'Roubo de aparelho celular', '#fbb040',
          'Roubo em coletivo', '#a855f7',
          '#ff6b35'],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 0.5, 16, 0.8],
        'circle-blur': 0.15,
        'circle-stroke-color': 'rgba(7,7,10,0.5)',
        'circle-stroke-width': 0.5,
      },
      layout: { visibility: 'none' },
    })

    map.addSource('rio-dd', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'rio-dd-dot',
      type: 'circle',
      source: 'rio-dd',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 14, 4, 16, 6],
        'circle-color': '#f59e0b',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.3, 14, 0.6, 16, 0.8],
        'circle-blur': 0.2,
        'circle-stroke-color': 'rgba(7,7,10,0.4)',
        'circle-stroke-width': 0.4,
      },
      layout: { visibility: 'none' },
    })

    map.addSource('rio-dominio', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'rio-dominio-fill',
      type: 'fill',
      source: 'rio-dominio',
      paint: {
        'fill-color': ['match', ['get', 'faccao'],
          'CV', '#ef4444', 'TCP', '#a855f7', 'ADA', '#4a90e2', 'Milícia', '#fbb040', '#888'],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.1, 14, 0.07, 16, 0.05],
      },
      layout: { visibility: 'none' },
    })
    map.addLayer({
      id: 'rio-dominio-stroke',
      type: 'line',
      source: 'rio-dominio',
      paint: {
        'line-color': ['match', ['get', 'faccao'],
          'CV', '#ef4444', 'TCP', '#a855f7', 'ADA', '#4a90e2', 'Milícia', '#fbb040', '#888'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 15, 1.5, 16, 2],
        'line-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 16, 0.7],
      },
      layout: { visibility: 'none' },
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
    // Real street-following routes (status ok): cyan dashed line.
    map.addLayer({
      id: 'agent-routes-line',
      type: 'line',
      source: 'agent-routes',
      filter: ['!=', ['get', 'fallback'], 1],
      paint: {
        'line-color': '#22d3ee',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 15, 5],
        'line-opacity': 0.9,
        'line-dasharray': [2, 1.5],
      },
    })
    // Fallback routes (no path in the network): gray, sparse dash, dimmer — an
    // "approximate" line. MapLibre 5.x can't data-drive line-dasharray, so this
    // is a separate layer filtered on the `fallback` property.
    map.addLayer({
      id: 'agent-routes-line-fallback',
      type: 'line',
      source: 'agent-routes',
      filter: ['==', ['get', 'fallback'], 1],
      paint: {
        'line-color': '#9ca3af',
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 3.5],
        'line-opacity': 0.7,
        'line-dasharray': [1, 2.5],
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
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 4],
        'line-opacity': 0.95,
      },
    })

    // ── Agent: radius circles (coverage / influence areas) ──
    map.addSource('agent-radius', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-radius-fill',
      type: 'fill',
      source: 'agent-radius',
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'fill-opacity': 0.12,
      },
    })
    map.addLayer({
      id: 'agent-radius-stroke',
      type: 'line',
      source: 'agent-radius',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.2, 15, 2.8],
        'line-opacity': 0.85,
        'line-dasharray': [2, 1.5],
      },
    })
    map.addLayer({
      id: 'agent-radius-label',
      type: 'symbol',
      source: 'agent-radius',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': 11,
        'text-font': ['Open Sans Semibold'],
        'text-offset': [0, -0.6],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#e0f7ff',
        'text-halo-color': 'rgba(7,7,10,0.95)',
        'text-halo-width': 2,
      },
    })

    // ── Agent: custom (filtered) crime heatmap — cyan/purple to read as "temporary" ──
    map.addSource('crime-heat-custom', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'crime-heat-custom',
      type: 'heatmap',
      source: 'crime-heat-custom',
      paint: {
        'heatmap-weight': 1,
        // Mesma logica do crime-heat: baixa intensity no zoom-out p/ nao saturar em branco.
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 1.2, 15, 3],
        // Rampa com mais paradas + inicio translucido = bordas suaves e gradiente visivel.
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
          0,    'rgba(0,0,0,0)',
          0.1,  'rgba(34,211,238,0.0)',
          0.25, 'rgba(34,211,238,0.4)',
          0.45, 'rgba(74,144,226,0.6)',
          0.65, 'rgba(120,110,240,0.75)',
          0.85, 'rgba(168,85,247,0.88)',
          1,    'rgba(255,255,255,0.95)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 16, 15, 30],
        'heatmap-opacity': 0.85,
      },
    })

    // ── Agent: timeline animation points (isNew=1 → current hour pops; older dims) ──
    map.addSource('crime-timeline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'crime-timeline-dot',
      type: 'circle',
      source: 'crime-timeline',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'],
          11, ['case', ['==', ['get', 'isNew'], 1], 5, 2.5],
          15, ['case', ['==', ['get', 'isNew'], 1], 9, 5],
        ],
        'circle-color': ['case', ['==', ['get', 'isNew'], 1], '#fde68a', '#ff6b35'],
        'circle-opacity': ['case', ['==', ['get', 'isNew'], 1], 1, 0.45],
        // Feather leve p/ os pontos antigos nao virarem 'specks' duros no zoom-out;
        // os 'isNew' ficam quase crisp p/ continuarem em destaque.
        'circle-blur': ['case', ['==', ['get', 'isNew'], 1], 0.15, 0.4],
        'circle-stroke-color': '#07070a',
        'circle-stroke-width': ['case', ['==', ['get', 'isNew'], 1], 1, 0.4],
      },
    })

    // ── Agent: route animation (traveling dot along a path) ──
    map.addSource('agent-route-anim-line', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-route-anim-line-glow',
      type: 'line',
      source: 'agent-route-anim-line',
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 8, 15, 16],
        'line-opacity': 0.18,
        'line-blur': 4,
      },
    })
    map.addLayer({
      id: 'agent-route-anim-line',
      type: 'line',
      source: 'agent-route-anim-line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 3],
        'line-opacity': 0.32,
        'line-dasharray': [2, 1.5],
      },
    })
    // Bright "traveled" trail that draws itself as the dot advances
    map.addSource('agent-route-anim-trail', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-route-anim-trail-glow',
      type: 'line',
      source: 'agent-route-anim-trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 9, 15, 18],
        'line-opacity': 0.22,
        'line-blur': 5,
      },
    })
    map.addLayer({
      id: 'agent-route-anim-trail',
      type: 'line',
      source: 'agent-route-anim-trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3.5, 15, 6],
        'line-opacity': 0.95,
      },
    })
    map.addLayer({
      id: 'agent-route-anim-line-label',
      type: 'symbol',
      source: 'agent-route-anim-line',
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
    map.addSource('agent-route-anim-dot', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-route-anim-dot-glow',
      type: 'circle',
      source: 'agent-route-anim-dot',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 12, 15, 20],
        'circle-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'circle-opacity': 0.25,
        'circle-blur': 1,
      },
    })
    map.addLayer({
      id: 'agent-route-anim-dot',
      type: 'circle',
      source: 'agent-route-anim-dot',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 5, 15, 8],
        'circle-color': '#ffffff',
        'circle-stroke-color': ['coalesce', ['get', 'color'], '#22d3ee'],
        'circle-stroke-width': 3,
      },
    })

    // ── Agent: crime clusters (DBSCAN) ──
    map.addSource('agent-clusters', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'agent-clusters-circle',
      type: 'circle',
      source: 'agent-clusters',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 14, 100, 44],
        'circle-color': ['interpolate', ['linear'], ['get', 'count'],
          1, '#fde68a', 30, '#fbb040', 80, '#ef4444'],
        // Feather + opacidade crescente com a densidade = blob suave em vez de puck chapado.
        'circle-blur': 0.5,
        'circle-opacity': ['interpolate', ['linear'], ['get', 'count'], 1, 0.3, 100, 0.6],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    })
    map.addLayer({
      id: 'agent-clusters-label',
      type: 'symbol',
      source: 'agent-clusters',
      layout: {
        'text-field': ['to-string', ['get', 'count']],
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 15, 14],
        'text-font': ['Open Sans Bold'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#07070a',
        'text-halo-color': 'rgba(255,255,255,0.75)',
        'text-halo-width': 1,
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
      if (routePickRef.current.active || pickGuardRef.current) return
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
            <div style="font-size:10px;color:#ff6b35;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Área FM</div>
            <div style="font-size:12px;font-weight:600;margin-bottom:8px;line-height:1.35">${area.nome.split(' - ').slice(0, 2).join(' · ')}</div>
            <div style="display:flex;gap:12px;font-size:11px">
              <div>
                <div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Score</div>
                <div style="color:${scoreCol};font-size:16px;font-weight:600;font-variant-numeric:tabular-nums">${score}</div>
              </div>
              <div>
                <div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Crimes</div>
                <div style="font-size:14px;font-weight:500;font-variant-numeric:tabular-nums">${area.stats.crimes_total.toLocaleString('pt-BR')}</div>
              </div>
              <div>
                <div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Pico</div>
                <div style="font-size:14px;font-weight:500">${area.stats.pico_horario}</div>
              </div>
            </div>
            <div style="margin-top:8px;padding-top:6px;border-top:1px solid #2a2a35;font-size:10px;color:#8a8a95">
              ${area.stats.fatores_urbanos_total} fatores · ${area.stats.cameras_total} câmeras · ${area.stats.psr_total} PSR
            </div>
            ${area.relint_disponivel ? '<div style="margin-top:4px;font-size:10px;color:#ff6b35">● RELINT disponível</div>' : ''}
            <div style="margin-top:6px;font-size:10px;color:#4a4a55;font-style:italic">Clique para analisar →</div>
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
          <div style="font-size:10px;color:#38bdf8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Bairro do Entorno</div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px">${p.nome}</div>
          <div style="display:flex;gap:14px;font-size:11px">
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Populacao</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${pop > 0 ? pop.toLocaleString('pt-BR') : '—'}</div></div>
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Denuncias</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${dd > 0 ? dd.toLocaleString('pt-BR') : '—'}</div></div>
            ${ch > 0 ? `<div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">1746</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${ch.toLocaleString('pt-BR')}</div></div>` : ''}
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

    // Hover on censo choropleth
    map.on('mouseenter', 'censo-fill', (e: any) => {
      if (map.getCanvas().style.cursor === 'pointer') return
      const p = e.features[0].properties
      const pop = Number(p.pop_2022 || 0)
      const variacao = Number(p.variacao_pct || 0)
      const dens = Number(p.densidade_hab_km2 || 0)
      const varSign = variacao >= 0 ? '+' : ''
      const varColor = variacao < 0 ? '#ef4444' : '#36c476'
      popupRef.current
        ?.setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:180px">
          <div style="font-size:10px;color:#60a5fa;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Censo 2022 (IBGE)</div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px">${p.nome}</div>
          <div style="display:flex;gap:14px;font-size:11px">
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Pop. 2022</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${pop > 0 ? pop.toLocaleString('pt-BR') : '—'}</div></div>
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Variação</div><div style="font-weight:500;color:${varColor};font-variant-numeric:tabular-nums">${varSign}${variacao.toFixed(1)}%</div></div>
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Densidade</div><div style="font-weight:500;font-variant-numeric:tabular-nums">${dens > 0 ? dens.toLocaleString('pt-BR') : '—'}/km²</div></div>
          </div>
        </div>`)
        .addTo(map)
    })
    map.on('mousemove', 'censo-fill', (e: any) => { popupRef.current?.setLngLat(e.lngLat) })
    map.on('mouseleave', 'censo-fill', () => { popupRef.current?.remove() })

    // Hover on Rio entorno rings
    map.on('mouseenter', 'rio-rings-fill', (e: any) => {
      if (map.getCanvas().style.cursor === 'pointer') return
      const p = e.features[0].properties
      const crimes = Number(p.crimes || 0)
      const dd = Number(p.dd || 0)
      popupRef.current
        ?.setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:170px">
          <div style="font-size:10px;color:#22d3ee;text-transform:uppercase;letter-spacing:.1em;margin-bottom:4px">Anel de Entorno (500m)</div>
          <div style="font-size:13px;font-weight:600;margin-bottom:6px">${p.nome}</div>
          <div style="display:flex;gap:14px;font-size:11px">
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Crimes</div><div style="font-weight:500;font-variant-numeric:tabular-nums;color:#ff6b35">${crimes > 0 ? crimes.toLocaleString('pt-BR') : '—'}</div></div>
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Denúncias</div><div style="font-weight:500;font-variant-numeric:tabular-nums;color:#f59e0b">${dd > 0 ? dd.toLocaleString('pt-BR') : '—'}</div></div>
          </div>
        </div>`)
        .addTo(map)
    })
    map.on('mousemove', 'rio-rings-fill', (e: any) => { popupRef.current?.setLngLat(e.lngLat) })
    map.on('mouseleave', 'rio-rings-fill', () => { popupRef.current?.remove() })

    // Hover on trecho markers
    map.on('mouseenter', 'trechos-circle', (e: any) => {
      map.getCanvas().style.cursor = 'pointer'
      const p = e.features[0].properties
      const picoH = Number(p.pico) || 0
      const bingo = Number(p.bingo) || 0
      if (!popupRef.current) return
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:190px;max-width:240px">
          <div style="font-size:10px;color:#fbb040;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">#${p.rank} Trecho Crítico${bingo >= 2 ? ' · BINGO' : ''}</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:6px;text-transform:capitalize">${p.name}</div>
          <div style="display:flex;gap:10px;font-size:11px;flex-wrap:wrap">
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Total</div><div style="font-weight:600;font-variant-numeric:tabular-nums;color:#fbb040">${Number(p.total).toLocaleString('pt-BR')}</div></div>
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Transeunte</div><div style="font-variant-numeric:tabular-nums">${Number(p.transeunte).toLocaleString('pt-BR')}</div></div>
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Celular</div><div style="font-variant-numeric:tabular-nums">${Number(p.celular).toLocaleString('pt-BR')}</div></div>
            <div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Coletivo</div><div style="font-variant-numeric:tabular-nums">${Number(p.coletivo).toLocaleString('pt-BR')}</div></div>
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
      if (!popupRef.current) return
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:180px;max-width:240px">
          <div style="font-size:10px;color:#36c476;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Fator Urbano</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:5px">${p.tipo || '—'}</div>
          <div style="display:flex;gap:10px;font-size:11px;flex-wrap:wrap">
            ${p.orgao ? `<div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Órgão</div><div style="font-weight:500">${p.orgao}</div></div>` : ''}
            ${p.logradouro ? `<div><div style="color:#4a4a55;font-size:10px;text-transform:uppercase">Local</div><div style="font-weight:500;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.logradouro}</div></div>` : ''}
          </div>
          <div style="margin-top:5px;font-size:10px;color:#4a4a55;font-style:italic">Clique para detalhar →</div>
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
      if (!popupRef.current) return
      popupRef.current
        .setLngLat(e.lngLat)
        .setHTML(`<div style="font-family:Inter,sans-serif;color:#f0f0f3;min-width:180px;max-width:240px">
          <div style="font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">Chamado 1746</div>
          <div style="font-size:12px;font-weight:600;margin-bottom:5px">${p.tipo || '—'}</div>
          ${p.orgao ? `<div style="font-size:11px"><span style="color:#4a4a55;font-size:10px;text-transform:uppercase">Órgão</span> <span style="font-weight:500">${p.orgao}</span></div>` : ''}
          <div style="margin-top:5px;font-size:10px;color:#4a4a55;font-style:italic">Clique para detalhar →</div>
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
          <div style="font-size:10px;color:${f.recommendation === 'instalar' ? '#ef4444' : '#fbb040'};text-transform:uppercase;letter-spacing:.1em;margin-bottom:3px">#${f.rank} ${f.recommendation}</div>
          <div style="font-size:11px;margin-bottom:4px">${f.uncovered_crimes} ocorrências sem cobertura</div>
          <div style="font-size:10px;color:#8a8a95">${f.justification}</div>
        </div>`)
        .addTo(map)
    })
    map.on('mouseleave', 'gaps-dot', () => {
      map.getCanvas().style.cursor = ''
      popupRef.current?.remove()
    })

    // Manual route-picking: 1st click = origin, 2nd click = destination → /api/route.
    // Registered before the deselect handler so it captures the click first.
    map.on('click', (e: any) => {
      const pick = routePickRef.current
      if (!pick.active) return
      pickGuardRef.current = true
      setTimeout(() => { pickGuardRef.current = false }, 0)
      const lngLat: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      if (!pick.from) {
        pick.from = lngLat
        setRoutePickHint('Clique no destino da rota')
        import('maplibre-gl').then(({ default: maplibregl }) => {
          if (!mapInst.current) return
          routeStartMarkerRef.current?.remove()
          routeStartMarkerRef.current = new maplibregl.Marker({ color: '#22d3ee' })
            .setLngLat(lngLat)
            .addTo(mapInst.current)
        })
        return
      }
      const from = pick.from
      const to = lngLat
      const onDone = pick.onDone
      routePickRef.current = { active: false, from: null }
      setRoutePickActive(false)
      setRoutePickHint('Calculando rota…')
      map.getCanvas().style.cursor = ''
      routeStartMarkerRef.current?.remove()
      routeStartMarkerRef.current = null
      fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
        .then(r => r.json())
        .then((res: any) => {
          if (res && Array.isArray(res.coordinates) && res.coordinates.length >= 2) {
            mapControlRef?.current?.showRoute(res.coordinates, {
              label: 'Rota manual',
              fallback: res.status === 'fallback',
              distanceM: res.distance_m,
            })
            setRoutePickHint(null)
            onDone?.(res)
          } else {
            setRoutePickHint(null)
            onDone?.({ error: res?.error ?? 'falha ao calcular rota' })
          }
        })
        .catch((err: unknown) => {
          setRoutePickHint(null)
          onDone?.({ error: String(err) })
        })
    })

    // Click outside interactive elements → deselect
    map.on('click', (e: any) => {
      if (routePickRef.current.active || pickGuardRef.current) return
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
    censo:    ['censo-fill', 'censo-stroke'],
    rioRings: ['rio-rings-fill', 'rio-rings-stroke'],
    rioCrime: ['rio-crime-heat', 'rio-crime-dot'],
    rioDD:    ['rio-dd-dot'],
    rioDominio: ['rio-dominio-fill', 'rio-dominio-stroke'],
  }

  // Lazy-load censo GeoJSON when toggled on for the first time
  useEffect(() => {
    if (!layers.censo || censoLoaded.current || !mapReady) return
    censoLoaded.current = true
    fetch('/api/censo')
      .then(r => r.ok ? r.json() : null)
      .then(fc => {
        if (!fc?.features) return
        setCensoCount(fc.features.length)
        ;(mapInst.current?.getSource('censo') as GeoJSONSource | undefined)?.setData(fc)
      })
      .catch(() => {})
  }, [layers.censo, mapReady])

  // Lazy-load rio_context.json when any Rio layer is toggled on
  useEffect(() => {
    const anyRio = layers.rioRings || layers.rioCrime || layers.rioDD || layers.rioDominio
    if (!anyRio || rioLoaded.current || !mapReady) return
    rioLoaded.current = true
    fetch('/rio_context.json')
      .then(r => r.ok ? r.json() : null)
      .then((ctx: RioContext | null) => {
        if (!ctx) return
        setRioCtx(ctx)
        const map = mapInst.current
        if (!map) return
        // Rings
        const ringFeatures = ctx.rings
          .filter(r => r.geometry)
          .map(r => ({ type: 'Feature' as const, geometry: r.geometry, properties: { nome: r.nome, crimes: r.crimes_in_ring, dd: r.dd_in_ring } }))
        ;(map.getSource('rio-rings') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: ringFeatures })
        // Crime points
        const crimeFeatures = ctx.crime_points.map(p => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
          properties: { tipo: p.tipo, h: p.h },
        }))
        ;(map.getSource('rio-crime') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: crimeFeatures })
        // DD points
        const ddFeatures = ctx.dd_points.map(p => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
          properties: { tipo: p.tipo },
        }))
        ;(map.getSource('rio-dd') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: ddFeatures })
        // Domínio
        ;(map.getSource('rio-dominio') as GeoJSONSource | undefined)?.setData(ctx.dominio)
      })
      .catch(() => {})
  }, [layers.rioRings, layers.rioCrime, layers.rioDD, layers.rioDominio, mapReady])

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
    const next = !layersRef.current[key]
    setLayerVisible(key, next)
    if (key === 'rioRings' && next) {
      if (!layersRef.current.rioCrime) setLayerVisible('rioCrime', true)
      if (!layersRef.current.rioDD) setLayerVisible('rioDD', true)
    }
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
          // Pulsing ring marker (orange core + animated halo) — visually distinct from the
          // flat amber numbered trecho circles.
          const el = document.createElement('div')
          el.className = 'annotation-marker'
          const ring = document.createElement('div')
          ring.className = 'annotation-marker-ring'
          const core = document.createElement('div')
          core.className = 'annotation-marker-core'
          el.appendChild(ring)
          el.appendChild(core)
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
        const newFeature = {
          type: 'Feature' as const,
          properties: { color, label, total: t.total },
          geometry: t.line_geometry,
        }
        agentHighlightFeatures.current = [...agentHighlightFeatures.current, newFeature]
        src.setData({
          type: 'FeatureCollection',
          features: agentHighlightFeatures.current,
        })
        const bounds = geomBounds(t.line_geometry)
        if (bounds) {
          map.fitBounds(bounds, {
            padding: { top: 100, bottom: 100, left: 100, right: 100 },
            maxZoom: 15.5,
            duration: 800,
            easing: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
          })
        } else if (typeof t.lat === 'number' && typeof t.lng === 'number') {
          map.flyTo({ center: [t.lng, t.lat], zoom: Math.min(map.getZoom() + 1, 15), duration: 800 })
        }
        return true
      },

      highlightTopTrechos: (n: number) => {
        const map = mapInst.current
        const sel = selectedRef.current
        if (!map || !sel) return
        const trechos = sel.top_trechos.slice(0, Math.max(1, n)).filter(t => t.line_geometry)
        const features = trechos.map((t, i) => ({
            type: 'Feature' as const,
            properties: {
              color: i === 0 ? '#ef4444' : i < 3 ? '#fbb040' : '#fde68a',
              label: `${i + 1}. ${t.locf_norm}`,
              total: t.total,
            },
            geometry: t.line_geometry!,
          }))
        agentHighlightFeatures.current = features
        ;(map.getSource('agent-highlights') as GeoJSONSource | undefined)
          ?.setData({ type: 'FeatureCollection', features })
        if (trechos.length > 0) {
          const allGeoms = trechos.map(t => t.line_geometry!)
          const allBounds = allGeoms.map(g => geomBounds(g)).filter(Boolean) as [[number,number],[number,number]][]
          if (allBounds.length > 0) {
            const combined: [[number,number],[number,number]] = [
              [Math.min(...allBounds.map(b => b[0][0])), Math.min(...allBounds.map(b => b[0][1]))],
              [Math.max(...allBounds.map(b => b[1][0])), Math.max(...allBounds.map(b => b[1][1]))],
            ]
            map.fitBounds(combined, {
              padding: { top: 100, bottom: 100, left: 100, right: 100 },
              maxZoom: 15.5,
              duration: 900,
              easing: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            })
          }
        }
      },

      clearHighlights: (opts?: { annotations?: boolean; timeFilter?: boolean }) => {
        const map = mapInst.current
        if (!map) return
        agentHighlightFeatures.current = []
        agentRadiusFeatures.current = []
        agentRouteFeatures.current = []
        ;['agent-highlights', 'agent-routes', 'agent-bairro-focus', 'agent-radius', 'agent-clusters', 'crime-heat-custom', 'agent-route-anim-line', 'agent-route-anim-trail', 'agent-route-anim-dot'].forEach(id => {
          ;(map.getSource(id) as GeoJSONSource | undefined)
            ?.setData({ type: 'FeatureCollection', features: [] })
        })
        stopTimeline()
        stopRouteAnim()
        pulsesRef.current.forEach(m => m.remove())
        pulsesRef.current = []
        setComparison(null)
        if (opts?.annotations) {
          annotationsRef.current.forEach(m => m.remove())
          annotationsRef.current = []
        }
        if (opts?.timeFilter) applyTimeFilter(null, null)
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
        applyTimeFilter(horaInicio, horaFim)
      },

      showRoute: (polyline: [number, number][], opts?: { label?: string; fallback?: boolean; distanceM?: number }) => {
        const map = mapInst.current
        if (!map || polyline.length < 2) return
        const src = map.getSource('agent-routes') as GeoJSONSource | undefined
        if (!src) return
        const base = opts?.label ?? ''
        const dist = typeof opts?.distanceM === 'number'
          ? (opts.distanceM >= 1000 ? `${(opts.distanceM / 1000).toFixed(1)} km` : `${Math.round(opts.distanceM)} m`)
          : ''
        const label = opts?.fallback
          ? `${base || 'rota aproximada'} — sem caminho na malha`
          : [base, dist].filter(Boolean).join(' · ')
        agentRouteFeatures.current = [
          ...agentRouteFeatures.current,
          {
            type: 'Feature' as const,
            properties: { label, fallback: opts?.fallback ? 1 : 0 },
            geometry: { type: 'LineString' as const, coordinates: polyline.map(c => [c[0], c[1]]) },
          },
        ]
        src.setData({ type: 'FeatureCollection', features: agentRouteFeatures.current })
      },

      startRoutePick: (onDone) => {
        routePickRef.current = { active: true, from: null, onDone }
        setRoutePickActive(true)
        setRoutePickHint('Clique na origem da rota')
        routeStartMarkerRef.current?.remove()
        routeStartMarkerRef.current = null
        const map = mapInst.current
        if (map) map.getCanvas().style.cursor = 'crosshair'
      },

      cancelRoutePick: () => {
        routePickRef.current = { active: false, from: null }
        setRoutePickActive(false)
        setRoutePickHint(null)
        routeStartMarkerRef.current?.remove()
        routeStartMarkerRef.current = null
        const map = mapInst.current
        if (map) map.getCanvas().style.cursor = ''
      },

      addRadiusCircle: (lat: number, lng: number, radiusM: number, opts?: { label?: string; color?: string }) => {
        const map = mapInst.current
        const src = map?.getSource('agent-radius') as GeoJSONSource | undefined
        if (!map || !src) return
        const color = opts?.color ?? '#22d3ee'
        const label = opts?.label ?? `${Math.round(radiusM)}m`
        const feature = {
          type: 'Feature' as const,
          properties: { color, label },
          geometry: circlePolygon(lng, lat, radiusM),
        }
        agentRadiusFeatures.current = [...agentRadiusFeatures.current, feature]
        src.setData({ type: 'FeatureCollection', features: agentRadiusFeatures.current })
        // Frame all circles so adding the n-th one doesn't yank the camera off the others.
        const bounds = featuresBounds(agentRadiusFeatures.current)
        if (bounds) {
          map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 700 })
        } else {
          map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 700 })
        }
      },

      compareTrechos: (locfNorms: string[]) => {
        const map = mapInst.current
        const sel = selectedRef.current
        if (!map || !sel) return
        const palette = ['#ef4444', '#22d3ee', '#fbb040', '#a855f7', '#36c476']
        const entries: { color: string; label: string; total: number }[] = []
        const features: any[] = []
        locfNorms.forEach((name, i) => {
          const target = name.trim().toLowerCase()
          const t = sel.top_trechos.find(x => x.locf_norm.trim().toLowerCase() === target)
          if (!t || !t.line_geometry) return
          const color = palette[i % palette.length]
          entries.push({ color, label: t.locf_norm, total: t.total })
          features.push({
            type: 'Feature' as const,
            properties: { color, label: t.locf_norm, total: t.total },
            geometry: t.line_geometry,
          })
        })
        agentHighlightFeatures.current = features
        ;(map.getSource('agent-highlights') as GeoJSONSource | undefined)
          ?.setData({ type: 'FeatureCollection', features })
        setComparison(entries.length > 0 ? entries : null)
        const allBounds = features
          .map(f => geomBounds(f.geometry)).filter(Boolean) as [[number, number], [number, number]][]
        if (allBounds.length > 0) {
          const combined: [[number, number], [number, number]] = [
            [Math.min(...allBounds.map(b => b[0][0])), Math.min(...allBounds.map(b => b[0][1]))],
            [Math.max(...allBounds.map(b => b[1][0])), Math.max(...allBounds.map(b => b[1][1]))],
          ]
          map.fitBounds(combined, { padding: { top: 120, bottom: 120, left: 120, right: 120 }, maxZoom: 15.5, duration: 900 })
        }
      },

      showHeatmapCustom: (opts?: { tipo?: 'transeunte' | 'celular' | 'coletivo'; horaInicio?: number | null; horaFim?: number | null }) => {
        const map = mapInst.current
        const sel = selectedRef.current
        if (!map || !sel) return
        const hi = opts?.horaInicio ?? null
        const hf = opts?.horaFim ?? null
        const pts = sel.map_layers.crime_points.filter(p => {
          if (opts?.tipo && !matchTipo(p.tipo, opts.tipo)) return false
          if (hi !== null && (p.h === null || p.h < hi)) return false
          if (hf !== null && (p.h === null || p.h >= hf)) return false
          return true
        })
        const features = pts.map(p => ({
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        }))
        ;(map.getSource('crime-heat-custom') as GeoJSONSource | undefined)
          ?.setData({ type: 'FeatureCollection', features })
        const bounds = geomBounds(sel.geometry as any)
        if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 800 })
      },

      animateTimeline: (opts?: { tipo?: 'transeunte' | 'celular' | 'coletivo'; stepMs?: number }) => {
        runTimeline(opts)
      },

      playRouteAnimation: (path: [number, number][], opts?: { durationMs?: number; color?: string; label?: string; loop?: boolean }) => {
        runRouteAnimation(path, opts)
      },

      pulseLocation: (lat: number, lng: number, opts?: { color?: string; label?: string; durationMs?: number }) => {
        import('maplibre-gl').then(({ default: maplibregl }) => {
          const map = mapInst.current
          if (!map) return
          const color = opts?.color ?? '#ff6b35'
          const el = document.createElement('div')
          el.className = 'location-ping'
          el.style.color = color
          const ring = document.createElement('div')
          ring.className = 'location-ping-ring'
          const core = document.createElement('div')
          core.className = 'location-ping-core'
          el.appendChild(ring)
          el.appendChild(core)
          const marker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map)
          if (opts?.label) {
            marker.setPopup(new maplibregl.Popup({ closeButton: false, offset: 14, maxWidth: '200px' })
              .setHTML(`<div style="font-family:Inter,sans-serif;font-size:10px;color:#f0f0f3">${opts.label}</div>`))
              .togglePopup()
          }
          pulsesRef.current.push(marker)
          map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 14), duration: 700 })
          const ttl = Math.max(1000, opts?.durationMs ?? 4000)
          setTimeout(() => {
            marker.remove()
            pulsesRef.current = pulsesRef.current.filter(m => m !== marker)
          }, ttl)
        })
      },

      clusterCrimes: (opts?: { epsM?: number; minPts?: number }) => {
        const map = mapInst.current
        const sel = selectedRef.current
        const src = map?.getSource('agent-clusters') as GeoJSONSource | undefined
        if (!map || !sel || !src) return
        const epsM = opts?.epsM ?? 150
        const minPts = opts?.minPts ?? 5
        const pts = sel.map_layers.crime_points.map(p => ({ lat: p.lat, lng: p.lng }))
        const clusters = dbscan(pts, epsM, minPts)
        const features = clusters.map(c => ({
          type: 'Feature' as const,
          properties: { count: c.points.length },
          geometry: { type: 'Point' as const, coordinates: [c.cx, c.cy] },
        }))
        src.setData({ type: 'FeatureCollection', features })
        const bounds = geomBounds(sel.geometry as any)
        if (bounds) map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 800 })
      },

      stopAnimations: () => {
        // Halt the ephemeral, moving/looping visuals (route dot, timeline, pulses)
        // but keep static context (highlights, drawn routes, focus, radii, clusters).
        stopRouteAnim()
        stopTimeline()
        pulsesRef.current.forEach(m => m.remove())
        pulsesRef.current = []
      },

      zoomToPoint: (lat: number, lng: number, zoom?: number) => {
        const map = mapInst.current
        if (!map) return
        map.flyTo({
          center: [lng, lat],
          zoom: typeof zoom === 'number' ? Math.max(10, Math.min(18, zoom)) : 16,
          duration: 800,
          easing: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
        })
      },

      adjustZoom: (direction: 'in' | 'out', steps?: number) => {
        const map = mapInst.current
        if (!map) return
        const delta = Math.max(1, Math.min(5, steps ?? 1))
        const target = map.getZoom() + (direction === 'in' ? delta : -delta)
        map.easeTo({ zoom: Math.max(10, Math.min(18, target)), duration: 600 })
      },

      zoomOverview: () => {
        const map = mapInst.current
        if (!map) return
        const sel = selectedRef.current
        const bounds = sel ? geomBounds(sel.geometry as any) : null
        if (bounds) {
          map.fitBounds(bounds, {
            padding: { top: 80, bottom: 80, left: 80, right: 80 },
            maxZoom: 14,
            duration: 800,
            easing: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
          })
          return
        }
        // Global / no selection: fit to every area so the analyst regains context.
        const allBounds = data.areas
          .map(a => geomBounds(a.geometry as any))
          .filter(Boolean) as [[number, number], [number, number]][]
        if (allBounds.length === 0) return
        const combined: [[number, number], [number, number]] = [
          [Math.min(...allBounds.map(b => b[0][0])), Math.min(...allBounds.map(b => b[0][1]))],
          [Math.max(...allBounds.map(b => b[1][0])), Math.max(...allBounds.map(b => b[1][1]))],
        ]
        map.fitBounds(combined, { padding: 60, maxZoom: 13, duration: 800 })
      },
    }
  }, [mapReady, mapControlRef, data, applyTimeFilter, stopTimeline, stopRouteAnim, runTimeline, runRouteAnimation])

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
  const activeLayerCount = Object.values(layers).filter(Boolean).length

  return (
    <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
      {/* Map container */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* Manual route tool ("Traçar rota") — operator clicks two points */}
      <div style={{ position: 'absolute', top: 12, left: 12, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          onClick={() => {
            if (routePickActive) mapControlRef?.current?.cancelRoutePick()
            else mapControlRef?.current?.startRoutePick()
          }}
          title="Traçar uma rota seguindo as ruas entre dois pontos"
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(7,7,10,0.88)',
            backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid', borderColor: routePickActive ? 'rgba(34,211,238,0.6)' : 'rgba(42,42,53,0.9)',
            borderRadius: 3, padding: '8px 12px', cursor: 'pointer',
            color: routePickActive ? '#22d3ee' : 'var(--text-dim)',
            fontSize: 11, fontWeight: 500, transition: 'border-color 0.2s, color 0.2s',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" />
            <path d="M8 18c6-1 8-3 8-11" />
          </svg>
          <span>{routePickActive ? 'Cancelar rota' : 'Traçar rota'}</span>
        </button>
        {routePickHint && (
          <div style={{
            background: 'rgba(7,7,10,0.92)', border: '1px solid rgba(34,211,238,0.35)',
            borderRadius: 3, padding: '6px 10px', color: '#a5f3fc', fontSize: 10.5, fontWeight: 500,
            maxWidth: 200,
          }}>
            {routePickHint}
          </div>
        )}
      </div>

      {/* Layer controls — collapsible */}
      <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'auto' }}>
        {/* Toggle button */}
        <button
          onClick={() => setLayerPanelOpen(o => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            background: 'rgba(7,7,10,0.88)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(42,42,53,0.9)',
            borderRadius: 3,
            padding: '8px 12px',
            cursor: 'pointer',
            color: 'var(--text-dim)',
            fontSize: 11,
            fontWeight: 500,
            transition: 'border-color 0.2s',
            borderColor: layerPanelOpen ? 'rgba(255,107,53,0.4)' : 'rgba(42,42,53,0.9)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" />
            <polyline points="2 17 12 22 22 17" />
            <polyline points="2 12 12 17 22 12" />
          </svg>
          <span>Camadas</span>
          {activeLayerCount > 0 && (
            <span className="mono tnum" style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--accent)',
              background: 'var(--accent-soft)',
              padding: '1px 5px',
              borderRadius: 2,
              lineHeight: 1.3,
            }}>
              {activeLayerCount}
            </span>
          )}
          <span style={{
            fontSize: 10,
            transition: 'transform 0.2s',
            transform: layerPanelOpen ? 'rotate(180deg)' : 'none',
            display: 'inline-block',
            marginLeft: 2,
          }}>▾</span>
        </button>

        {/* Dropdown panel */}
        {layerPanelOpen && (
          <div style={{
            marginTop: 4,
            background: 'rgba(7,7,10,0.92)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid rgba(42,42,53,0.9)',
            borderRadius: 3,
            padding: '10px 12px',
            minWidth: 210,
          }}>
            <LayerBtn label="Mancha Criminal"       color="#ff6b35" active={layers.crime}   n={totalCrime}   onClick={() => toggleLayer('crime')} shape="circle" />
            {layers.crime && (
              <div style={{ paddingLeft: 17, marginBottom: 4 }}>
                {([
                  ['#ff6b35', 'Roubo a transeunte',       'person'],
                  ['#fbb040', 'Roubo de aparelho celular', 'phone'],
                  ['#a855f7', 'Roubo em coletivo',        'bus'],
                ] as const).map(([c, label, icon]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <LegendIcon icon={icon} color={c} />
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
                  </div>
                ))}
              </div>
            )}
            <LayerBtn label="Fatores Urbanos"       color="#36c476" active={layers.fatores} n={totalFatores} onClick={() => toggleLayer('fatores')} shape="square" />
            {layers.fatores && (
              <div style={{ paddingLeft: 17, marginBottom: 4 }}>
                {([
                  ['#36c476', 'COMLURB'],  ['#fbb040', 'Rio Luz'],
                  ['#a855f7', 'SEOP'],     ['#4a90e2', 'SECONSERVA'],
                  ['#ef4444', 'SMAS'],     ['#ff6b35', 'CET-Rio'],
                ] as const).map(([c, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 8, height: 8, background: c, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
                  </div>
                ))}
              </div>
            )}
            <LayerBtn label="Câmeras CIVITAS"       color="#4a90e2" active={layers.cameras} n={totalCameras} onClick={() => toggleLayer('cameras')} shape="camera" />
            <LayerBtn label="Pop. Situação de Rua"  color="#a855f7" active={layers.psr}     n={totalPSR}     onClick={() => toggleLayer('psr')} shape="diamond" />
            {totalChamados > 0 && <LayerBtn label="Chamados 1746"  color="#f59e0b" active={layers.chamados} n={totalChamados} onClick={() => toggleLayer('chamados')} shape="triangle" />}
            <LayerBtn label="Domínio Territorial"   color="#fbb040" active={layers.dominio} n={totalDominio} onClick={() => toggleLayer('dominio')} shape="square" />
            <LayerBtn label="Pontos Cegos"          color="#ef4444" active={layers.gaps}    n={totalGaps}    onClick={() => toggleLayer('gaps')} shape="warning" />
            {layers.gaps && (
              <div style={{ paddingLeft: 17, marginBottom: 4 }}>
                {([['#ef4444', 'Instalar câmera'], ['#fbb040', 'Remanejar câmera']] as const).map(([c, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <svg width="10" height="10" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
                      <polygon points="6,1 11,10 1,10" fill={c} stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" />
                      <text x="6" y="8.5" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">!</text>
                    </svg>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
                  </div>
                ))}
              </div>
            )}
            {selected && <LayerBtn label="Bairros Entorno" color="#38bdf8" active={layers.bairros} n={totalBairros} onClick={() => toggleLayer('bairros')} shape="square" />}
            <LayerBtn label="Censo (Densidade)" color="#3b82f6" active={layers.censo} n={censoCount || '…'} onClick={() => toggleLayer('censo')} shape="square" />
            {layers.censo && (
              <div style={{ paddingLeft: 17, marginBottom: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
                {([['#eff6ff','< 3k'], ['#93c5fd','3–10k'], ['#3b82f6','10–25k'], ['#1e40af','25k+']] as const).map(([c, label]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 8, height: 8, background: c, border: '1px solid rgba(255,255,255,0.1)' }} />
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{label}</span>
                  </div>
                ))}
                <span style={{ fontSize: 9, color: 'var(--text-muted)', marginLeft: 2 }}>hab/km²</span>
              </div>
            )}

            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(42,42,53,0.7)' }}>
              <div className="label-overline" style={{ marginBottom: 5 }}>Rio Inteiro</div>
              <LayerBtn label="Anéis de Entorno" color="#22d3ee" active={layers.rioRings} n={rioCtx?.rings.length ?? '—'} onClick={() => toggleLayer('rioRings')} shape="square" />
              <LayerBtn label="Crimes (Rio)" color="#ff6b35" active={layers.rioCrime} n={rioCtx?.meta.crime_total ?? '—'} onClick={() => toggleLayer('rioCrime')} shape="circle" />
              <LayerBtn label="Denúncias DD (Rio)" color="#f59e0b" active={layers.rioDD} n={rioCtx?.meta.dd_total ?? '—'} onClick={() => toggleLayer('rioDD')} shape="circle" />
              <LayerBtn label="Domínio (Rio)" color="#fbb040" active={layers.rioDominio} n={rioCtx?.meta.dominio_total ?? '—'} onClick={() => toggleLayer('rioDominio')} shape="square" />
            </div>

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
        )}
      </div>

      {/* Time filter control + active-window indicator */}
      <div style={{
        position: 'absolute', bottom: 28, right: 12,
        background: 'rgba(7,7,10,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid',
        borderColor: timeFilter.start !== null ? 'rgba(255,107,53,0.45)' : 'rgba(42,42,53,0.9)',
        borderRadius: 3, padding: '8px 12px', width: 212, pointerEvents: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="label-overline">⏱ Filtro Horário</span>
          {timeFilter.start !== null && (
            <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>
              {timeFilter.start}h–{timeFilter.end}h
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {TIME_PRESETS.map(([label, s, e]) => {
            const active = timeFilter.start === s && timeFilter.end === e
            return (
              <button
                key={label}
                onClick={() => applyTimeFilter(s, e)}
                style={{
                  fontSize: 10, padding: '3px 7px', borderRadius: 2, cursor: 'pointer',
                  border: '1px solid',
                  borderColor: active ? 'var(--accent)' : 'rgba(42,42,53,0.9)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-dim)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
              <span>Início</span><span className="mono">{timeFilter.start ?? 0}h</span>
            </div>
            <input
              type="range" min={0} max={23} className="range-slider"
              value={timeFilter.start ?? 0}
              onChange={e => { const v = +e.target.value; applyTimeFilter(v, Math.max(v + 1, timeFilter.end ?? 24)) }}
            />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
              <span>Fim</span><span className="mono">{timeFilter.end ?? 24}h</span>
            </div>
            <input
              type="range" min={1} max={24} className="range-slider"
              value={timeFilter.end ?? 24}
              onChange={e => { const v = +e.target.value; applyTimeFilter(Math.min(timeFilter.start ?? 0, v - 1), v) }}
            />
          </div>
        </div>
      </div>

      {/* Timeline animation badge — hour, day-part, progress, count, controls */}
      {timeline !== null && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(7,7,10,0.9)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255,107,53,0.45)',
          borderRadius: 3, padding: '7px 12px', pointerEvents: 'auto', minWidth: 230,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
              🕐 {String(timeline.hour).padStart(2, '0')}h
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{dayPart(timeline.hour)}</span>
            <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              {timeline.shown} / {timeline.total} crimes
            </span>
            {timeline.done && (
              <span style={{ display: 'flex', gap: 4, marginLeft: 6 }}>
                <button
                  onClick={() => runTimeline(lastTimelineOptsRef.current)}
                  title="Repetir"
                  style={{ cursor: 'pointer', background: 'transparent', border: '1px solid rgba(42,42,53,0.9)', borderRadius: 2, color: 'var(--accent)', fontSize: 11, padding: '1px 6px' }}
                >↻</button>
                <button
                  onClick={() => stopTimeline()}
                  title="Fechar"
                  style={{ cursor: 'pointer', background: 'transparent', border: '1px solid rgba(42,42,53,0.9)', borderRadius: 2, color: 'var(--text-dim)', fontSize: 11, padding: '1px 6px' }}
                >✕</button>
              </span>
            )}
          </div>
          <div style={{ height: 3, background: 'rgba(42,42,53,0.9)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(timeline.hour / 23) * 100}%`, background: 'var(--accent)', transition: 'width 0.25s linear' }} />
          </div>
        </div>
      )}

      {/* Comparison legend (compare_trechos) */}
      {comparison && comparison.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 96, left: 48,
          background: 'rgba(7,7,10,0.88)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(42,42,53,0.9)',
          borderRadius: 3, padding: '8px 12px', minWidth: 170, maxWidth: 240, pointerEvents: 'auto',
        }}>
          <div className="label-overline" style={{ marginBottom: 5 }}>Comparação de Trechos</div>
          {comparison.map(c => (
            <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <div style={{ width: 14, height: 3, background: c.color, flexShrink: 0, borderRadius: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
              <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto' }}>{c.total}</span>
            </div>
          ))}
        </div>
      )}

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
            <span key={v} className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v}</span>
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

// Combined bounds over a list of GeoJSON features (each with a `.geometry`).
function featuresBounds(features: { geometry: any }[]): [[number, number], [number, number]] | null {
  const all = features.map(f => geomBounds(f.geometry)).filter(Boolean) as [[number, number], [number, number]][]
  if (all.length === 0) return null
  return [
    [Math.min(...all.map(b => b[0][0])), Math.min(...all.map(b => b[0][1]))],
    [Math.max(...all.map(b => b[1][0])), Math.max(...all.map(b => b[1][1]))],
  ]
}

// Metric distance (meters) between two lng/lat points (haversine).
function haversineM(aLng: number, aLat: number, bLng: number, bLat: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLng = toRad(bLng - aLng)
  const lat1 = toRad(aLat), lat2 = toRad(bLat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Build a GeoJSON polygon approximating a circle of `radiusM` meters around [lng, lat].
function circlePolygon(lng: number, lat: number, radiusM: number, steps = 64): GeoJSON.Polygon {
  const coords: [number, number][] = []
  const latR = radiusM / 111320
  const lngR = radiusM / (111320 * Math.cos((lat * Math.PI) / 180))
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI
    coords.push([lng + lngR * Math.cos(theta), lat + latR * Math.sin(theta)])
  }
  return { type: 'Polygon', coordinates: [coords] }
}

// Match a crime's full descrição (e.g. "Roubo a transeunte") against a short tipo key.
function matchTipo(desc: string, tipo: 'transeunte' | 'celular' | 'coletivo'): boolean {
  const d = desc.toLowerCase()
  if (tipo === 'transeunte') return d.includes('transeunte')
  if (tipo === 'celular') return d.includes('celular') || d.includes('aparelho')
  if (tipo === 'coletivo') return d.includes('coletivo')
  return true
}

// Minimal DBSCAN over lng/lat points (eps in meters). Returns clusters with centroid + members.
function dbscan(
  pts: { lat: number; lng: number }[],
  epsM: number,
  minPts: number,
): { cx: number; cy: number; points: { lat: number; lng: number }[] }[] {
  const n = pts.length
  const visited = new Array(n).fill(false)
  const assigned = new Array(n).fill(false)
  const neighbors = (i: number): number[] => {
    const out: number[] = []
    for (let j = 0; j < n; j++) {
      if (haversineM(pts[i].lng, pts[i].lat, pts[j].lng, pts[j].lat) <= epsM) out.push(j)
    }
    return out
  }
  const clusters: { cx: number; cy: number; points: { lat: number; lng: number }[] }[] = []
  for (let i = 0; i < n; i++) {
    if (visited[i]) continue
    visited[i] = true
    let nb = neighbors(i)
    if (nb.length < minPts) continue
    const members: number[] = []
    const queue = [...nb]
    assigned[i] = true
    members.push(i)
    while (queue.length) {
      const q = queue.shift() as number
      if (!visited[q]) {
        visited[q] = true
        const qnb = neighbors(q)
        if (qnb.length >= minPts) queue.push(...qnb)
      }
      if (!assigned[q]) { assigned[q] = true; members.push(q) }
    }
    const memberPts = members.map(m => pts[m])
    const cx = memberPts.reduce((s, p) => s + p.lng, 0) / memberPts.length
    const cy = memberPts.reduce((s, p) => s + p.lat, 0) / memberPts.length
    clusters.push({ cx, cy, points: memberPts })
  }
  return clusters.sort((a, b) => b.points.length - a.points.length)
}

// ─────────────────────────────────────────────────────────
// MAP ICON REGISTRATION (canvas-drawn icons for symbol layers)
// ─────────────────────────────────────────────────────────
function registerMapIcons(map: any) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const S = 32
  const px = Math.round(S * dpr)
  const C = S / 2

  function reg(name: string, draw: (ctx: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas')
    c.width = px; c.height = px
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr)
    draw(ctx)
    map.addImage(name, {
      width: px, height: px,
      data: new Uint8Array(ctx.getImageData(0, 0, px, px).data.buffer),
    }, { pixelRatio: dpr })
  }

  function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r)
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r)
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r)
    ctx.closePath()
  }

  function filledCircle(ctx: CanvasRenderingContext2D, col: string, r = 10) {
    ctx.beginPath(); ctx.arc(C, C, r, 0, Math.PI * 2)
    ctx.fillStyle = col; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
  }

  function filledSquare(ctx: CanvasRenderingContext2D, col: string, sz = 18) {
    const h = sz / 2
    ctx.fillStyle = col; ctx.fillRect(C - h, C - h, sz, sz)
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.strokeRect(C - h, C - h, sz, sz)
  }

  function filledDiamond(ctx: CanvasRenderingContext2D, col: string, r = 11) {
    ctx.beginPath()
    ctx.moveTo(C, C - r); ctx.lineTo(C + r, C); ctx.lineTo(C, C + r); ctx.lineTo(C - r, C)
    ctx.closePath()
    ctx.fillStyle = col; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
  }

  function filledTriangle(ctx: CanvasRenderingContext2D, col: string, r = 13) {
    ctx.beginPath()
    ctx.moveTo(C, C - r); ctx.lineTo(C + r * 0.87, C + r * 0.5); ctx.lineTo(C - r * 0.87, C + r * 0.5)
    ctx.closePath()
    ctx.fillStyle = col; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
  }

  // ── Crime: walking person (Roubo a transeunte) ──
  reg('icon-crime-transeunte', (ctx) => {
    const col = '#ff6b35'
    ctx.fillStyle = col
    ctx.beginPath(); ctx.arc(C, 6, 4, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'
    ctx.beginPath(); ctx.moveTo(C, 10); ctx.lineTo(C, 19); ctx.stroke()
    ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(C, 19); ctx.lineTo(C - 5, 28); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(C, 19); ctx.lineTo(C + 5, 28); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(C, 13); ctx.lineTo(C - 6, 18); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(C, 13); ctx.lineTo(C + 6, 18); ctx.stroke()
  })

  // ── Crime: phone (Roubo de aparelho celular) ──
  reg('icon-crime-celular', (ctx) => {
    const col = '#fbb040', x = C - 6, y = C - 10, w = 12, h = 20
    ctx.beginPath(); rrect(ctx, x, y, w, h, 2.5)
    ctx.fillStyle = col; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fillRect(x + 2, y + 3, w - 4, h - 7)
    ctx.beginPath(); ctx.arc(C, y + h - 2.5, 1.3, 0, Math.PI * 2); ctx.fill()
  })

  // ── Crime: bus (Roubo em coletivo) ──
  reg('icon-crime-coletivo', (ctx) => {
    const col = '#a855f7', x = C - 10, y = 4, w = 20, h = 18
    ctx.beginPath(); rrect(ctx, x, y, w, h, 3)
    ctx.fillStyle = col; ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.3)'
    ctx.fillRect(x + 3, y + 3, 5.5, 5.5)
    ctx.fillRect(x + 10.5, y + 3, 5.5, 5.5)
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.beginPath(); ctx.arc(x + 5.5, y + h + 1.5, 2.5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + w - 5.5, y + h + 1.5, 2.5, 0, Math.PI * 2); ctx.fill()
  })

  reg('icon-crime-default', (ctx) => filledCircle(ctx, '#888', 8))

  // ── Camera icon ──
  reg('icon-camera', (ctx) => {
    const col = '#4a90e2'
    ctx.fillStyle = col
    ctx.beginPath()
    ctx.moveTo(C - 4, C - 7); ctx.lineTo(C + 4, C - 7)
    ctx.lineTo(C + 6, C - 3); ctx.lineTo(C - 6, C - 3)
    ctx.closePath(); ctx.fill()
    ctx.beginPath(); rrect(ctx, C - 10, C - 3, 20, 14, 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.beginPath(); ctx.arc(C, C + 4, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill()
    ctx.beginPath(); ctx.arc(C, C + 4, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill()
  })

  // ── Warning triangles for camera gaps ──
  function warningTri(ctx: CanvasRenderingContext2D, col: string) {
    filledTriangle(ctx, col, 13)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 14px sans-serif'
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('!', C, C + 2)
  }
  reg('icon-gap-instalar', (ctx) => warningTri(ctx, '#ef4444'))
  reg('icon-gap-remanejar', (ctx) => warningTri(ctx, '#fbb040'))

  // ── Fatores urbanos: colored squares per orgão ──
  const fatoresColors: [string, string][] = [
    ['comlurb', '#36c476'], ['rioluz', '#fbb040'], ['seop', '#a855f7'],
    ['seconserva', '#4a90e2'], ['smas', '#ef4444'], ['cetrio', '#ff6b35'], ['default', '#888'],
  ]
  for (const [key, col] of fatoresColors) {
    reg(`icon-fator-${key}`, (ctx) => filledSquare(ctx, col, 18))
  }

  // ── PSR: diamond ──
  reg('icon-psr', (ctx) => filledDiamond(ctx, '#a855f7', 11))

  // ── Chamados 1746: triangle ──
  reg('icon-chamado', (ctx) => filledTriangle(ctx, '#f59e0b', 11))
}

function LegendIcon({ icon, color }: { icon: 'person' | 'phone' | 'bus'; color: string }) {
  switch (icon) {
    case 'person':
      return (
        <svg width="10" height="12" viewBox="0 0 20 26" style={{ flexShrink: 0 }}>
          <circle cx="10" cy="4" r="3.5" fill={color} />
          <line x1="10" y1="8" x2="10" y2="17" stroke={color} strokeWidth="2.8" strokeLinecap="round" />
          <line x1="10" y1="17" x2="6" y2="24" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="10" y1="17" x2="14" y2="24" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="10" y1="11" x2="5" y2="15" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
          <line x1="10" y1="11" x2="15" y2="15" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )
    case 'phone':
      return (
        <svg width="8" height="12" viewBox="0 0 14 22" style={{ flexShrink: 0 }}>
          <rect x="1" y="1" width="12" height="20" rx="2" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
          <rect x="3" y="3.5" width="8" height="12" rx="0.5" fill="rgba(0,0,0,0.25)" />
          <circle cx="7" cy="18" r="1.2" fill="rgba(0,0,0,0.25)" />
        </svg>
      )
    case 'bus':
      return (
        <svg width="12" height="12" viewBox="0 0 22 22" style={{ flexShrink: 0 }}>
          <rect x="1" y="1" width="20" height="16" rx="2.5" fill={color} stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
          <rect x="3.5" y="3.5" width="6" height="5" rx="0.5" fill="rgba(255,255,255,0.35)" />
          <rect x="12" y="3.5" width="6" height="5" rx="0.5" fill="rgba(255,255,255,0.35)" />
          <circle cx="6" cy="19.5" r="2.2" fill="rgba(0,0,0,0.5)" />
          <circle cx="16" cy="19.5" r="2.2" fill="rgba(0,0,0,0.5)" />
        </svg>
      )
  }
}

function LayerBtn({ label, color, active, n, onClick, shape = 'square' }: {
  label: string; color: string; active: boolean; n: number | string; onClick: () => void
  shape?: 'circle' | 'square' | 'diamond' | 'triangle' | 'camera' | 'warning'
}) {
  let shapeEl: React.ReactNode
  const fill = active ? color : 'transparent'
  switch (shape) {
    case 'circle':
      shapeEl = <div style={{ width: 10, height: 10, borderRadius: '50%', border: `1.5px solid ${color}`, background: fill, transition: 'background 0.15s', flexShrink: 0 }} />
      break
    case 'diamond':
      shapeEl = <div style={{ width: 9, height: 9, border: `1.5px solid ${color}`, background: fill, transform: 'rotate(45deg)', transition: 'background 0.15s', flexShrink: 0 }} />
      break
    case 'triangle':
      shapeEl = (
        <svg width="11" height="11" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
          <polygon points="6,1.5 11,10.5 1,10.5" fill={fill} stroke={color} strokeWidth="1.5" />
        </svg>
      )
      break
    case 'camera':
      shapeEl = (
        <svg width="12" height="10" viewBox="0 0 16 12" style={{ flexShrink: 0 }}>
          <rect x="1" y="3" width="14" height="8" rx="1.5" fill={fill} stroke={color} strokeWidth="1.3" />
          <path d="M5.5 3 L7 0.5 L9 0.5 L10.5 3" fill={fill} stroke={color} strokeWidth="1" strokeLinejoin="round" />
          <circle cx="8" cy="7.5" r="2.5" fill="none" stroke={active ? 'rgba(0,0,0,0.3)' : color} strokeWidth="1" />
        </svg>
      )
      break
    case 'warning':
      shapeEl = (
        <svg width="11" height="11" viewBox="0 0 12 12" style={{ flexShrink: 0 }}>
          <polygon points="6,1 11.5,11 0.5,11" fill={fill} stroke={color} strokeWidth="1.3" />
          {active && <text x="6" y="9.5" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="bold">!</text>}
        </svg>
      )
      break
    default:
      shapeEl = <div style={{ width: 10, height: 10, border: `1.5px solid ${color}`, background: fill, borderRadius: 1, transition: 'background 0.15s', flexShrink: 0 }} />
  }

  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      width: '100%', padding: '4px 0', background: 'none', border: 'none',
      cursor: 'pointer', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {shapeEl}
        <span style={{ fontSize: 11, color: active ? 'var(--text)' : 'var(--text-dim)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>
      <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        {n.toLocaleString('pt-BR')}
      </span>
    </button>
  )
}
