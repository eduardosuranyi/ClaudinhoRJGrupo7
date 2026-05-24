import fs from 'fs'
import path from 'path'

export interface CrimeEventSummary {
  eventId: string
  crimeType: string
  date: string
  hour: number | null
  logradouro: string
  tactics: string[]
  weapons: string[]
  outcome: string
}

const ONTOLOGY_PATH = path.resolve(
  process.cwd(),
  '../../../../valente/data/ontology/crime_events.jsonl',
)

// Module-level cache: areaFm(lowercase) -> events
// Populated lazily on first call; lives until the Next.js server restarts.
let cache: Map<string, CrimeEventSummary[]> | null = null

function buildCache(): Map<string, CrimeEventSummary[]> {
  const map = new Map<string, CrimeEventSummary[]>()
  try {
    if (!fs.existsSync(ONTOLOGY_PATH)) return map
    const lines = fs.readFileSync(ONTOLOGY_PATH, 'utf-8').split('\n').filter(Boolean)
    for (const line of lines) {
      try {
        const ev = JSON.parse(line)
        const areaFm: string = (ev.spatial?.area_fm ?? '').toLowerCase()
        if (!areaFm) continue
        const summary: CrimeEventSummary = {
          eventId: ev.event_id ?? '',
          crimeType: ev.crime_type ?? 'desconhecido',
          date: ev.temporal?.data ?? '',
          hour: ev.temporal?.hora ?? null,
          logradouro: ev.spatial?.logradouro ?? '',
          tactics: (ev.modus_operandi?.tactics ?? []).filter(
            (t: string) => t !== 'desconhecido',
          ),
          weapons: (ev.weapons ?? [])
            .map((w: { type?: string }) => w.type ?? 'desconhecido')
            .filter((t: string) => t !== 'desconhecido'),
          outcome: ev.outcome?.status ?? 'desconhecido',
        }
        const bucket = map.get(areaFm)
        if (bucket) bucket.push(summary)
        else map.set(areaFm, [summary])
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // ignore — return whatever we built so far (possibly empty)
  }
  return map
}

export function loadOntologyEventsForArea(
  areaName: string,
  limit = 10,
): CrimeEventSummary[] {
  if (cache === null) cache = buildCache()

  const matchPrefix = areaName.toLowerCase().slice(0, 10)
  const out: CrimeEventSummary[] = []
  for (const [areaFm, events] of cache) {
    if (areaFm.includes(matchPrefix)) out.push(...events)
  }
  return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

// Test-only: clears the in-memory cache so a subsequent call rebuilds it.
export function __resetOntologyCacheForTests(): void {
  cache = null
}
