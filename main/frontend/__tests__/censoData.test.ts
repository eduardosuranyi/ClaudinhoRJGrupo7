import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FeatureCollection } from 'geojson'

// `server-only` throws outside an RSC bundle — neutralize for tests.
vi.mock('server-only', () => ({}))

import {
  __setCensoForTest,
  getCensoBairro,
  getCensoBairros,
  getRegiaoAggregate,
  getBairrosProximos,
  getCidadeBaseline,
  normalizeBairro,
} from '@/lib/censoData'

// ~1 km square polygon around a center.
function square(cx: number, cy: number) {
  const d = 0.005
  return {
    type: 'Polygon' as const,
    coordinates: [[
      [cx - d, cy - d], [cx + d, cy - d], [cx + d, cy + d], [cx - d, cy + d], [cx - d, cy - d],
    ]],
  }
}

function feat(nome: string, regiao: string, cx: number, cy: number, props: Record<string, number>) {
  return {
    type: 'Feature' as const,
    properties: { nome, regiao_adm: regiao, codbairro: '000', ...props },
    geometry: square(cx, cy),
  }
}

// X and Y are ~1 km apart in "Zona A"; Z is far away in "Zona B".
const fixture: FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    feat('Bairro X', 'Zona A', -43.20, -22.90, {
      Total_de_pessoas_2010: 1000, Total_de_pessoas_2022: 1200,
      Total_de_domicilios_2022: 500, Total_DP_Ocup_2022: 400,
    }),
    feat('Bairro Y', 'Zona A', -43.19, -22.90, {
      Total_de_pessoas_2010: 2000, Total_de_pessoas_2022: 1800,
      Total_de_domicilios_2022: 900, Total_DP_Ocup_2022: 800,
    }),
    feat('Bairro Z', 'Zona B', -43.50, -22.95, {
      Total_de_pessoas_2010: 500, Total_de_pessoas_2022: 600,
      Total_de_domicilios_2022: 300, Total_DP_Ocup_2022: 250,
    }),
  ],
}

beforeEach(() => {
  __setCensoForTest(fixture)
})

describe('normalizeBairro', () => {
  it('strips accents and lowercases', () => {
    expect(normalizeBairro('São Conceição')).toBe('sao conceicao')
  })
})

describe('getCensoBairro', () => {
  it('returns demographics with growth, density and people-per-dwelling', () => {
    const b = getCensoBairro('Bairro X')!
    expect(b).toBeTruthy()
    expect(b.pop_2022).toBe(1200)
    expect(b.variacao_pct).toBe(20) // (1200-1000)/1000
    expect(b.pessoas_por_domicilio).toBe(3) // 1200 / 400 occupied
    expect(b.area_km2).toBeGreaterThan(0.8)
    expect(b.area_km2).toBeLessThan(1.5)
    expect(b.densidade_hab_km2).toBeGreaterThan(0)
  })

  it('matches case- and accent-insensitively', () => {
    expect(getCensoBairro('bairro x')?.nome).toBe('Bairro X')
  })

  it('returns null for unknown bairro', () => {
    expect(getCensoBairro('Inexistente')).toBeNull()
  })
})

describe('getCensoBairros', () => {
  it('returns multiple, skipping unknown names', () => {
    const list = getCensoBairros(['Bairro X', 'Nada', 'Bairro Z'])
    expect(list.map(b => b.nome)).toEqual(['Bairro X', 'Bairro Z'])
  })
})

describe('getRegiaoAggregate', () => {
  it('sums population and ranks bairros by pop desc', () => {
    const r = getRegiaoAggregate('Zona A')!
    expect(r.n_bairros).toBe(2)
    expect(r.pop_2022).toBe(3000) // 1200 + 1800
    expect(r.pop_2010).toBe(3000) // 1000 + 2000
    expect(r.variacao_pct).toBe(0)
    expect(r.bairros[0].nome).toBe('Bairro Y') // 1800 > 1200
  })

  it('returns null for unknown region', () => {
    expect(getRegiaoAggregate('Zona Q')).toBeNull()
  })
})

describe('getBairrosProximos', () => {
  it('includes a ~1km neighbor within a 3km radius and excludes the far one', () => {
    const near = getBairrosProximos('Bairro X', 3)!
    expect(near.map(b => b.nome)).toEqual(['Bairro Y'])
    expect(near[0].distancia_km).toBeGreaterThan(0)
    expect(near[0].distancia_km).toBeLessThan(2)
  })

  it('excludes the ~1km neighbor with a 0.5km radius', () => {
    expect(getBairrosProximos('Bairro X', 0.5)).toEqual([])
  })
})

describe('getCidadeBaseline', () => {
  it('aggregates all bairros', () => {
    const c = getCidadeBaseline()!
    expect(c.n_bairros).toBe(3)
    expect(c.pop_2022).toBe(3600) // 1200 + 1800 + 600
  })
})
