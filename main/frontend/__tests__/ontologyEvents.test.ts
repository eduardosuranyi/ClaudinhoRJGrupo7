import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockExistsSync = vi.hoisted(() => vi.fn())
const mockReadFileSync = vi.hoisted(() => vi.fn())

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

import { loadOntologyEventsForArea, __resetOntologyCacheForTests } from '@/lib/ontologyEvents'

const SAMPLE_JSONL = [
  JSON.stringify({
    event_id: 'e1',
    crime_type: 'roubo',
    spatial: { area_fm: 'Centro / Lapa', logradouro: 'Rua A' },
    temporal: { data: '2024-03-01', hora: 22 },
    modus_operandi: { tactics: ['armado'] },
    weapons: [{ type: 'arma_fogo' }],
    outcome: { status: 'consumado' },
  }),
  JSON.stringify({
    event_id: 'e2',
    crime_type: 'furto',
    spatial: { area_fm: 'Centro / Lapa', logradouro: 'Rua B' },
    temporal: { data: '2024-05-01', hora: null },
    modus_operandi: { tactics: ['desconhecido'] },
    weapons: [],
    outcome: { status: 'tentado' },
  }),
  JSON.stringify({
    event_id: 'e3',
    crime_type: 'roubo',
    spatial: { area_fm: 'Botafogo', logradouro: 'Rua C' },
    temporal: { data: '2024-01-01', hora: 14 },
  }),
].join('\n')

beforeEach(() => {
  __resetOntologyCacheForTests()
  vi.clearAllMocks()
})

describe('loadOntologyEventsForArea — cache behavior', () => {
  it('test_reads_file_only_once_across_multiple_calls', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(SAMPLE_JSONL)

    loadOntologyEventsForArea('Centro / Lapa')
    loadOntologyEventsForArea('Centro / Lapa')
    loadOntologyEventsForArea('Botafogo')

    expect(mockReadFileSync).toHaveBeenCalledTimes(1)
  })

  it('test_returns_events_for_matching_area', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(SAMPLE_JSONL)

    const events = loadOntologyEventsForArea('Centro / Lapa')
    expect(events).toHaveLength(2)
    expect(events.map((e: { eventId: string }) => e.eventId).sort()).toEqual(['e1', 'e2'])
  })

  it('test_sorts_by_date_desc_and_applies_limit', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(SAMPLE_JSONL)

    const events = loadOntologyEventsForArea('Centro / Lapa', 1)
    expect(events).toHaveLength(1)
    expect(events[0].eventId).toBe('e2') // 2024-05-01 > 2024-03-01
  })

  it('test_returns_empty_when_no_match', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(SAMPLE_JSONL)

    const events = loadOntologyEventsForArea('Inexistente')
    expect(events).toEqual([])
  })

  it('test_returns_empty_when_file_missing_and_caches_that', () => {
    mockExistsSync.mockReturnValue(false)

    expect(loadOntologyEventsForArea('Centro / Lapa')).toEqual([])
    expect(loadOntologyEventsForArea('Botafogo')).toEqual([])
    // existsSync called once during the first build (then cache is non-null)
    expect(mockReadFileSync).not.toHaveBeenCalled()
    expect(mockExistsSync).toHaveBeenCalledTimes(1)
  })
})
