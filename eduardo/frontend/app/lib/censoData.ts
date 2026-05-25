import 'server-only'

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { FeatureCollection, Polygon, MultiPolygon, Position } from 'geojson'

/**
 * Census (Censo 2022 / IBGE) demographics per bairro, loaded directly from
 * `data/external/censo_2022_bairros.geojson`, cached once per server process.
 *
 * Exposes lookups by bairro, by administrative region (regiao_adm), and by
 * spatial proximity (nearby bairros by centroid distance) so the AI agent can
 * cross-reference demographics with crime/denúncia/1746 data and generate
 * insights — always with an explicit `fonte` (source) attached.
 *
 * Note: the file's `area_plane` field is unreliable (rounded to tiny integers),
 * so area/density is computed from the polygon geometry instead.
 *
 * Server-only: reads from disk. Never import from a client component.
 */

/** Canonical source label for everything in this module. */
export const FONTE_CENSO = 'Censo 2022 (IBGE)'

export interface BairroCenso {
  nome: string
  regiao_adm: string
  cod_bairro: string
  pop_2022: number
  pop_2010: number
  /** Absolute change 2010 → 2022 */
  variacao_abs: number
  /** Percent change 2010 → 2022 (1 decimal) */
  variacao_pct: number
  domicilios_2022: number
  domicilios_ocupados_2022: number
  /** People per occupied dwelling (pop_2022 / occupied), 2 decimals */
  pessoas_por_domicilio: number
  /** Computed from geometry (km²) */
  area_km2: number
  /** Inhabitants per km² (pop_2022 / area_km2), rounded */
  densidade_hab_km2: number
  /** [lng, lat] bbox centroid — used for proximity */
  centroid: [number, number]
}

type Loaded = {
  byNome: Map<string, BairroCenso>
  all: BairroCenso[]
  /** Slim FeatureCollection (geometry + metrics) for the map choropleth. */
  geojson: FeatureCollection
}

let _loaded: Loaded | null | undefined
let _override: Loaded | null = null

const FILE_PATH = join(process.cwd(), '..', '..', 'data', 'external', 'censo_2022_bairros.geojson')

export function normalizeBairro(s: string): string {
  // NFKD then drop combining diacritics (U+0300–U+036F) by codepoint.
  const decomposed = s.normalize('NFKD')
  let out = ''
  for (const ch of decomposed) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp >= 0x0300 && cp <= 0x036f) continue
    out += ch
  }
  return out.toLowerCase().trim()
}

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Planar area (m²) of a ring via equirectangular projection around lat0. */
function ringAreaM2(ring: Position[], lat0: number): number {
  const R = 6378137
  const toRad = (d: number) => (d * Math.PI) / 180
  const cosLat = Math.cos(toRad(lat0))
  let sum = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const x1 = R * toRad(ring[i][0]) * cosLat
    const y1 = R * toRad(ring[i][1])
    const x2 = R * toRad(ring[i + 1][0]) * cosLat
    const y2 = R * toRad(ring[i + 1][1])
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

function geometryStats(geom: Polygon | MultiPolygon): { areaKm2: number; centroid: [number, number] } {
  const polygons: Position[][][] = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of polygons) {
    for (const ring of poly) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  const lat0 = (minY + maxY) / 2
  let areaM2 = 0
  for (const poly of polygons) {
    poly.forEach((ring, idx) => {
      const a = ringAreaM2(ring, lat0)
      areaM2 += idx === 0 ? a : -a // subtract holes
    })
  }
  return { areaKm2: areaM2 / 1e6, centroid: [(minX + maxX) / 2, (minY + maxY) / 2] }
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function build(fc: FeatureCollection): Loaded {
  const all: BairroCenso[] = []
  const features: FeatureCollection['features'] = []
  for (const ft of fc.features) {
    const p = (ft.properties ?? {}) as Record<string, unknown>
    const nome = typeof p.nome === 'string' ? p.nome : ''
    if (!nome || !ft.geometry || (ft.geometry.type !== 'Polygon' && ft.geometry.type !== 'MultiPolygon')) continue
    const { areaKm2, centroid } = geometryStats(ft.geometry)
    const pop2022 = num(p.Total_de_pessoas_2022)
    const pop2010 = num(p.Total_de_pessoas_2010)
    const domOcup = num(p.Total_DP_Ocup_2022)
    const rec: BairroCenso = {
      nome,
      regiao_adm: typeof p.regiao_adm === 'string' ? p.regiao_adm : '',
      cod_bairro: String(p.codbairro ?? ''),
      pop_2022: pop2022,
      pop_2010: pop2010,
      variacao_abs: pop2022 - pop2010,
      variacao_pct: pop2010 > 0 ? Math.round(((pop2022 - pop2010) / pop2010) * 1000) / 10 : 0,
      domicilios_2022: num(p.Total_de_domicilios_2022),
      domicilios_ocupados_2022: domOcup,
      pessoas_por_domicilio: domOcup > 0 ? Math.round((pop2022 / domOcup) * 100) / 100 : 0,
      area_km2: Math.round(areaKm2 * 100) / 100,
      densidade_hab_km2: areaKm2 > 0 ? Math.round(pop2022 / areaKm2) : 0,
      centroid,
    }
    all.push(rec)
    features.push({
      type: 'Feature',
      geometry: ft.geometry,
      properties: {
        nome: rec.nome,
        regiao_adm: rec.regiao_adm,
        pop_2022: rec.pop_2022,
        pop_2010: rec.pop_2010,
        variacao_pct: rec.variacao_pct,
        densidade_hab_km2: rec.densidade_hab_km2,
        pessoas_por_domicilio: rec.pessoas_por_domicilio,
      },
    })
  }
  const byNome = new Map<string, BairroCenso>()
  for (const b of all) byNome.set(normalizeBairro(b.nome), b)
  return { byNome, all, geojson: { type: 'FeatureCollection', features } }
}

function load(): Loaded | null {
  if (_override) return _override
  if (_loaded !== undefined) return _loaded
  try {
    if (!existsSync(FILE_PATH)) {
      _loaded = null
      return null
    }
    const fc = JSON.parse(readFileSync(FILE_PATH, 'utf-8')) as FeatureCollection
    _loaded = build(fc)
  } catch {
    _loaded = null
  }
  return _loaded
}

/** Census record for one bairro (by name, accent/case-insensitive). */
export function getCensoBairro(nome: string): BairroCenso | null {
  const net = load()
  if (!net) return null
  return net.byNome.get(normalizeBairro(nome)) ?? null
}

/** Census for several bairros (skips unknown names). */
export function getCensoBairros(nomes: string[]): BairroCenso[] {
  const net = load()
  if (!net) return []
  const out: BairroCenso[] = []
  for (const n of nomes) {
    const b = net.byNome.get(normalizeBairro(n))
    if (b) out.push(b)
  }
  return out
}

export interface RegiaoCenso {
  regiao_adm: string
  n_bairros: number
  pop_2022: number
  pop_2010: number
  variacao_pct: number
  densidade_media_hab_km2: number
  bairros: { nome: string; pop_2022: number; densidade_hab_km2: number; variacao_pct: number }[]
}

/** Aggregate + ranking for one administrative region (regiao_adm). */
export function getRegiaoAggregate(regiao: string): RegiaoCenso | null {
  const net = load()
  if (!net) return null
  const key = normalizeBairro(regiao)
  const members = net.all.filter(b => normalizeBairro(b.regiao_adm) === key)
  if (members.length === 0) return null
  const pop2022 = members.reduce((s, b) => s + b.pop_2022, 0)
  const pop2010 = members.reduce((s, b) => s + b.pop_2010, 0)
  const densValues = members.filter(b => b.densidade_hab_km2 > 0).map(b => b.densidade_hab_km2)
  return {
    regiao_adm: members[0].regiao_adm,
    n_bairros: members.length,
    pop_2022: pop2022,
    pop_2010: pop2010,
    variacao_pct: pop2010 > 0 ? Math.round(((pop2022 - pop2010) / pop2010) * 1000) / 10 : 0,
    densidade_media_hab_km2: densValues.length
      ? Math.round(densValues.reduce((s, d) => s + d, 0) / densValues.length)
      : 0,
    bairros: members
      .slice()
      .sort((a, b) => b.pop_2022 - a.pop_2022)
      .map(b => ({
        nome: b.nome,
        pop_2022: b.pop_2022,
        densidade_hab_km2: b.densidade_hab_km2,
        variacao_pct: b.variacao_pct,
      })),
  }
}

export interface BairroProximo extends BairroCenso {
  distancia_km: number
}

/** Bairros whose centroid is within `radiusKm` of `nome`'s centroid (excludes self). */
export function getBairrosProximos(nome: string, radiusKm: number): BairroProximo[] | null {
  const net = load()
  if (!net) return null
  const origin = net.byNome.get(normalizeBairro(nome))
  if (!origin) return null
  return net.all
    .filter(b => b.nome !== origin.nome)
    .map(b => ({ ...b, distancia_km: Math.round(haversineKm(origin.centroid, b.centroid) * 100) / 100 }))
    .filter(b => b.distancia_km <= radiusKm)
    .sort((a, b) => a.distancia_km - b.distancia_km)
}

export interface CidadeBaseline {
  n_bairros: number
  pop_2022: number
  pop_2010: number
  variacao_pct: number
  densidade_mediana_hab_km2: number
}

/** City-wide baseline (all 165 bairros) for contextual comparison. */
export function getCidadeBaseline(): CidadeBaseline | null {
  const net = load()
  if (!net || net.all.length === 0) return null
  const pop2022 = net.all.reduce((s, b) => s + b.pop_2022, 0)
  const pop2010 = net.all.reduce((s, b) => s + b.pop_2010, 0)
  const dens = net.all.filter(b => b.densidade_hab_km2 > 0).map(b => b.densidade_hab_km2).sort((a, b) => a - b)
  const mediana = dens.length ? dens[Math.floor(dens.length / 2)] : 0
  return {
    n_bairros: net.all.length,
    pop_2022: pop2022,
    pop_2010: pop2010,
    variacao_pct: pop2010 > 0 ? Math.round(((pop2022 - pop2010) / pop2010) * 1000) / 10 : 0,
    densidade_mediana_hab_km2: mediana,
  }
}

/** Slim bairro FeatureCollection (geometry + census metrics) for the map choropleth. */
export function getCensoGeoJSON(): FeatureCollection | null {
  const net = load()
  return net ? net.geojson : null
}

/** Test-only hook: inject a census FeatureCollection (or `null` to reset). */
export function __setCensoForTest(fc: FeatureCollection | null): void {
  _override = fc === null ? null : build(fc)
  if (fc === null) _loaded = undefined
}
