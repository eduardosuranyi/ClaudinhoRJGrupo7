import fs from 'fs'
import path from 'path'
import type { Area, AreasData } from '../types'

// Loads the full areas dataset from disk (the same file the client fetches at
// /areas_data.json) so the global agent can reason across all areas without the
// client shipping the multi-MB payload in every request body.
// Mirrors the lazy module-level cache pattern in lib/ontologyEvents.ts.
const AREAS_DATA_PATH = path.resolve(process.cwd(), 'public/areas_data.json')

let cache: Area[] | null = null

export function loadAllAreas(): Area[] {
  if (cache !== null) return cache
  try {
    const raw = fs.readFileSync(AREAS_DATA_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as AreasData
    cache = parsed.areas ?? []
  } catch {
    cache = []
  }
  return cache
}

// Test-only: clears the in-memory cache so a subsequent call re-reads from disk.
export function __resetAreasCacheForTests(): void {
  cache = null
}
