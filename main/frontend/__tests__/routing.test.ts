import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FeatureCollection, LineString } from 'geojson'

// `server-only` throws if imported outside an RSC bundle — neutralize it for tests.
vi.mock('server-only', () => ({}))

import { computeRoute, __setNetworkForTest } from '@/lib/routing'

// Tiny deterministic network with exact shared endpoints.
//   A───B───C     (component 0, a "T": B also connects down to D)
//       │
//       D
//   E───F         (component 1, isolated)
const A: [number, number] = [-43.20, -22.90]
const B: [number, number] = [-43.19, -22.90]
const C: [number, number] = [-43.18, -22.90]
const D: [number, number] = [-43.19, -22.91]
const E: [number, number] = [-43.50, -22.95]
const F: [number, number] = [-43.49, -22.95]

function seg(a: [number, number], b: [number, number]) {
  return {
    type: 'Feature' as const,
    properties: { component: 0 },
    geometry: { type: 'LineString' as const, coordinates: [a, b] },
  }
}

const network: FeatureCollection<LineString> = {
  type: 'FeatureCollection',
  features: [seg(A, B), seg(B, C), seg(B, D), seg(E, F)],
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000
  const r = (d: number) => (d * Math.PI) / 180
  const dLat = r(b[1] - a[1])
  const dLng = r(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[1])) * Math.cos(r(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

beforeEach(() => {
  __setNetworkForTest(network)
})

describe('computeRoute', () => {
  it('test_routes_through_the_network_following_streets', () => {
    // From just off A to just off D — must go A → B → D (an L), not a diagonal.
    const from: [number, number] = [-43.2009, -22.9001]
    const to: [number, number] = [-43.1899, -22.9101]
    const r = computeRoute(from, to)

    expect(r.status).toBe('ok')
    // More than the 2 endpoints → it bent through intermediate street vertices.
    expect(r.coordinates.length).toBeGreaterThan(2)
    // Street path (A→B→D) is longer than the straight diagonal.
    expect(r.distance_m).toBeGreaterThan(haversine(from, to))
    // Path passes through the B junction.
    expect(r.coordinates).toContainEqual(B)
  })

  it('test_snaps_off_network_points_to_nearest_vertex', () => {
    // Points well away from any vertex still snap onto the network and route.
    const r = computeRoute([-43.2015, -22.8995], [-43.1805, -22.9008])
    expect(r.status).toBe('ok')
    expect(r.snap_from_m).toBeGreaterThan(0)
    expect(r.snap_to_m).toBeGreaterThan(0)
    expect(r.coordinates).toContainEqual(B)
  })

  it('test_returns_fallback_when_points_are_in_disconnected_components', () => {
    // A is in component 0, E is in the isolated component 1 → no path.
    const from: [number, number] = [-43.2001, -22.9001]
    const to: [number, number] = [-43.5001, -22.9501]
    const r = computeRoute(from, to)

    expect(r.status).toBe('fallback')
    expect(r.coordinates).toEqual([from, to]) // straight line, just the 2 endpoints
    expect(r.message).toContain('sem caminho na malha')
  })

  it('test_real_artifact_routes_two_connected_points', () => {
    // Integration: load the committed street_network.routing.geojson.gz and route
    // two points a few blocks apart in Copacabana (same component).
    __setNetworkForTest(null) // reset override → use the on-disk artifact
    const from: [number, number] = [-43.1875, -22.9711]
    const to: [number, number] = [-43.1822, -22.9668]
    const r = computeRoute(from, to)

    expect(r.status).toBe('ok')
    expect(r.coordinates.length).toBeGreaterThan(2) // follows streets, not a straight line
    expect(r.distance_m).toBeGreaterThan(0)
  })
})
