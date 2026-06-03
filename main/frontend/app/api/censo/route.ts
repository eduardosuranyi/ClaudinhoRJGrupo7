/**
 * GET /api/censo
 *   → FeatureCollection (bairro polygons + Censo 2022 metrics) for the map choropleth.
 *
 * GET /api/censo?bairros=Centro,Copacabana
 *   → Filtered to only the requested bairros (for the AreaPanel card).
 */
import { NextRequest, NextResponse } from 'next/server'
import { getCensoGeoJSON, getCensoBairros } from '../../lib/censoData'

export async function GET(req: NextRequest) {
  const bairrosParam = new URL(req.url).searchParams.get('bairros')

  if (bairrosParam) {
    const nomes = bairrosParam.split(',').map(s => s.trim()).filter(Boolean)
    const bairros = getCensoBairros(nomes)
    return NextResponse.json({ fonte: 'Censo 2022 (IBGE)', bairros })
  }

  const fc = getCensoGeoJSON()
  if (!fc) {
    return NextResponse.json(
      { error: 'censo_2022_bairros.geojson not found' },
      { status: 404 },
    )
  }
  return NextResponse.json(fc)
}
