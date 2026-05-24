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

export function loadOntologyEventsForArea(
  areaName: string,
  limit = 10,
): CrimeEventSummary[] {
  try {
    if (!fs.existsSync(ONTOLOGY_PATH)) return []

    const lines = fs.readFileSync(ONTOLOGY_PATH, 'utf-8').split('\n').filter(Boolean)
    const events: CrimeEventSummary[] = []

    // Match by area_fm using first 10 chars of areaName (handles long names)
    const matchPrefix = areaName.toLowerCase().slice(0, 10)

    for (const line of lines) {
      try {
        const ev = JSON.parse(line)
        const areaFm: string = ev.spatial?.area_fm ?? ''
        if (!areaFm.toLowerCase().includes(matchPrefix)) continue

        events.push({
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
        })
      } catch {
        // skip malformed lines
      }
    }

    return events
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
  } catch {
    return []
  }
}
