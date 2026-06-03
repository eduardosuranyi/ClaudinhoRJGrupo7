import 'server-only'

import { existsSync, readFileSync } from 'fs'
import { gunzipSync } from 'zlib'
import { join } from 'path'
import PathFinder from 'geojson-path-finder'
import type { Feature, FeatureCollection, GeoJsonProperties, LineString, Point, Position } from 'geojson'

/**
 * Street-following routing over the IBGE logradouros network.
 *
 * The routable artifact (`eduardo/backend/street_network.routing.geojson`) is
 * produced offline by `build_routing_graph.py` — a noded, snapped, connected
 * street network whose touching endpoints share exact coordinates. Here we load
 * it once per server process, build a Dijkstra graph (`geojson-path-finder`),
 * snap arbitrary input points to the nearest network vertex, and return a path
 * that follows real streets instead of a straight line through buildings.
 *
 * When the two points fall in disconnected parts of the network (no road path
 * exists), we return a `fallback` straight line so the caller can draw it in a
 * distinct "rota aproximada" style — never silently misleading the analyst.
 *
 * Server-only: it reads from disk and pulls in the routing engine. Never import
 * this from a client component.
 */

const FALLBACK_MESSAGE = 'rota aproximada — sem caminho na malha'

export interface RouteResult {
  /** Full path as [lng, lat] pairs, including the short snap legs to the network. */
  coordinates: [number, number][]
  /** Total length in meters (street distance for `ok`, straight-line for `fallback`). */
  distance_m: number
  status: 'ok' | 'fallback'
  /** Offset (m) from the input origin to its network entry point. */
  snap_from_m?: number
  /** Offset (m) from the network exit point to the input destination. */
  snap_to_m?: number
  /** Human-readable explanation, set on fallback. */
  message?: string
}

type Loaded = {
  pathFinder: PathFinder<unknown, GeoJsonProperties>
  vertices: Position[]
}

// `undefined` = not attempted yet, `null` = load failed (degrade to fallback).
let _loaded: Loaded | null | undefined
let _override: Loaded | null = null

const ARTIFACT_PATHS = [
  join(process.cwd(), '..', 'backend', 'street_network.routing.geojson'),
  join(process.cwd(), '..', 'backend', 'street_network.routing.geojson.gz'),
]

function haversineMeters(a: Position, b: Position): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const lat1 = toRad(a[1])
  const lat2 = toRad(b[1])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

function buildFromCollection(fc: FeatureCollection<LineString>): Loaded {
  // geojson-path-finder types the FC properties as Record<string, unknown>; our
  // GeoJSON's properties are GeoJsonProperties (a superset). The cast is safe — we
  // only use edge geometry + the weight fn below, never the properties shape.
  const pathFinder = new PathFinder<unknown, GeoJsonProperties>(fc as FeatureCollection<LineString, Record<string, unknown>>, {
    // Edge weight = real ground distance in meters, so `path.weight` is meters.
    weight: (a, b) => haversineMeters(a, b),
  })
  const vertices = Object.values(pathFinder.graph.sourceCoordinates)
  return { pathFinder, vertices }
}

function load(): Loaded | null {
  if (_override) return _override
  if (_loaded !== undefined) return _loaded
  try {
    const path = ARTIFACT_PATHS.find(p => existsSync(p))
    if (!path) {
      _loaded = null
      return null
    }
    const raw = readFileSync(path)
    const text = path.endsWith('.gz') ? gunzipSync(raw).toString('utf-8') : raw.toString('utf-8')
    const fc = JSON.parse(text) as FeatureCollection<LineString>
    _loaded = buildFromCollection(fc)
  } catch {
    _loaded = null
  }
  return _loaded
}

function nearestVertex(vertices: Position[], pt: [number, number]): Position | null {
  let best: Position | null = null
  let bestD = Infinity
  for (const v of vertices) {
    // Planar squared distance is enough to rank nearest at city scale.
    const dx = v[0] - pt[0]
    const dy = v[1] - pt[1]
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return best
}

function pointFeature(c: Position): Feature<Point> {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} }
}

function fallback(from: [number, number], to: [number, number], message: string): RouteResult {
  return {
    coordinates: [from, to],
    distance_m: Math.round(haversineMeters(from, to)),
    status: 'fallback',
    message,
  }
}

/** Same-ish coordinate (within ~0.5 m) — used to drop redundant snap-leg points. */
function coincident(a: Position, b: Position): boolean {
  return Math.abs(a[0] - b[0]) < 5e-6 && Math.abs(a[1] - b[1]) < 5e-6
}

/**
 * Compute a street-following route between two [lng, lat] points.
 * Returns a `fallback` straight line when no path exists in the network.
 */
export function computeRoute(from: [number, number], to: [number, number]): RouteResult {
  const net = load()
  if (!net || net.vertices.length === 0) {
    return fallback(from, to, 'malha de roteamento indisponível — exibindo linha reta')
  }

  const vFrom = nearestVertex(net.vertices, from)
  const vTo = nearestVertex(net.vertices, to)
  if (!vFrom || !vTo) return fallback(from, to, FALLBACK_MESSAGE)

  const snapFrom = haversineMeters(from, vFrom)
  const snapTo = haversineMeters(to, vTo)

  // Same network vertex: nothing to route, just connect via that vertex.
  if (coincident(vFrom, vTo)) {
    const coords = [from, vFrom as [number, number], to].filter(
      (c, i, arr) => i === 0 || !coincident(c, arr[i - 1]),
    ) as [number, number][]
    return {
      coordinates: coords,
      distance_m: Math.round(snapFrom + snapTo),
      status: 'ok',
      snap_from_m: Math.round(snapFrom),
      snap_to_m: Math.round(snapTo),
    }
  }

  const path = net.pathFinder.findPath(pointFeature(vFrom), pointFeature(vTo))
  if (!path || !path.path || path.path.length < 2) {
    return fallback(from, to, FALLBACK_MESSAGE)
  }

  // Stitch: input origin → network path → input destination, dropping duplicates.
  const stitched: Position[] = [from, ...path.path, to]
  const coordinates = stitched.filter(
    (c, i, arr) => i === 0 || !coincident(c, arr[i - 1]),
  ) as [number, number][]

  return {
    coordinates,
    distance_m: Math.round(path.weight + snapFrom + snapTo),
    status: 'ok',
    snap_from_m: Math.round(snapFrom),
    snap_to_m: Math.round(snapTo),
  }
}

/**
 * Test-only hook: inject a network FeatureCollection (or `null` to reset to the
 * on-disk artifact). Lets unit tests route over a tiny deterministic fixture.
 */
export function __setNetworkForTest(fc: FeatureCollection<LineString> | null): void {
  if (fc === null) {
    _override = null
    _loaded = undefined
    return
  }
  _override = buildFromCollection(fc)
}
