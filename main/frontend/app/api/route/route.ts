import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { computeRoute } from '../../lib/routing'

// Routing reads the on-disk network artifact via fs — force the Node runtime.
export const runtime = 'nodejs'

const Body = z.object({
  from: z.tuple([z.number(), z.number()]), // [lng, lat]
  to: z.tuple([z.number(), z.number()]),   // [lng, lat]
})

/**
 * Street-following route between two points, for the operator's manual
 * "Traçar rota" tool. Returns a path that follows real streets, or a `fallback`
 * straight line when no road path exists in the IBGE network.
 */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'corpo inválido: esperado { from: [lng,lat], to: [lng,lat] }' },
      { status: 400 },
    )
  }
  const { from, to } = parsed.data
  return NextResponse.json(computeRoute(from, to))
}
