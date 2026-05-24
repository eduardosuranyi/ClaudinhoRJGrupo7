import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executeMapTool } from '@/hooks/useMapAgent'
import type { MapControl } from '@/types'

const mapControl: MapControl = {
  toggleLayer: vi.fn(),
  zoomToArea: vi.fn(),
  addAnnotation: vi.fn(),
  clearAnnotations: vi.fn(),
  snapshotLayers: vi.fn().mockReturnValue({}),
  restoreLayers: vi.fn(),
  highlightTrecho: vi.fn().mockReturnValue(true),
  highlightTopTrechos: vi.fn(),
  clearHighlights: vi.fn(),
  focusBairro: vi.fn().mockReturnValue(true),
  setTimeFilter: vi.fn(),
  showRoute: vi.fn(),
}

const mockArea = { id: 1, nome: 'Área Teste' } as any

const setWeights = vi.fn()
const setSelected = vi.fn()
const getArea = vi.fn().mockReturnValue(mockArea)

function makeDeps() {
  return { ctrl: mapControl, setWeights, setSelected, getArea }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('executeMapTool — toggle_layer', () => {
  it('test_calls_toggleLayer_with_correct_args', () => {
    executeMapTool('toggle_layer', { layer: 'crime', visible: true }, makeDeps())
    expect(mapControl.toggleLayer).toHaveBeenCalledWith('crime', true)
  })

  it('test_toggle_false_is_passed', () => {
    executeMapTool('toggle_layer', { layer: 'dominio', visible: false }, makeDeps())
    expect(mapControl.toggleLayer).toHaveBeenCalledWith('dominio', false)
  })
})

describe('executeMapTool — zoom_to_area', () => {
  it('test_calls_zoomToArea_and_setSelected', () => {
    executeMapTool('zoom_to_area', { area_id: 1 }, makeDeps())
    expect(mapControl.zoomToArea).toHaveBeenCalledWith(1)
    expect(getArea).toHaveBeenCalledWith(1)
    expect(setSelected).toHaveBeenCalledWith(mockArea)
  })

  it('test_setSelected_not_called_when_area_not_found', () => {
    getArea.mockReturnValueOnce(undefined)
    executeMapTool('zoom_to_area', { area_id: 99 }, makeDeps())
    expect(mapControl.zoomToArea).toHaveBeenCalledWith(99)
    expect(setSelected).not.toHaveBeenCalled()
  })
})

describe('executeMapTool — show_annotation', () => {
  it('test_calls_addAnnotation_with_correct_args', () => {
    executeMapTool('show_annotation', { lat: -22.9, lng: -43.2, title: 'Rua A', body: 'Crime spot' }, makeDeps())
    expect(mapControl.addAnnotation).toHaveBeenCalledWith(-22.9, -43.2, 'Rua A', 'Crime spot')
  })
})

describe('executeMapTool — update_weights', () => {
  it('test_merges_with_defaults', () => {
    executeMapTool('update_weights', { mancha: 50 }, makeDeps())
    expect(setWeights).toHaveBeenCalledWith({ mancha: 50, pico: 15, fatores: 25, dinamica: 15 })
  })

  it('test_all_weights_can_be_set', () => {
    executeMapTool('update_weights', { mancha: 20, pico: 10, fatores: 30, dinamica: 20 }, makeDeps())
    expect(setWeights).toHaveBeenCalledWith({ mancha: 20, pico: 10, fatores: 30, dinamica: 20 })
  })
})

describe('executeMapTool — highlight_trecho', () => {
  it('test_passes_locf_and_optional_color_label', () => {
    executeMapTool(
      'highlight_trecho',
      { locf_norm: 'Avenida Presidente Vargas', color: '#ef4444', label: 'Crítico' },
      makeDeps(),
    )
    expect(mapControl.highlightTrecho).toHaveBeenCalledWith(
      'Avenida Presidente Vargas',
      { color: '#ef4444', label: 'Crítico' },
    )
  })

  it('test_handles_missing_color_label', () => {
    executeMapTool('highlight_trecho', { locf_norm: 'Rua X' }, makeDeps())
    expect(mapControl.highlightTrecho).toHaveBeenCalledWith('Rua X', { color: undefined, label: undefined })
  })
})

describe('executeMapTool — highlight_top_trechos', () => {
  it('test_passes_n', () => {
    executeMapTool('highlight_top_trechos', { n: 5 }, makeDeps())
    expect(mapControl.highlightTopTrechos).toHaveBeenCalledWith(5)
  })
})

describe('executeMapTool — clear_highlights', () => {
  it('test_calls_clearHighlights', () => {
    executeMapTool('clear_highlights', {}, makeDeps())
    expect(mapControl.clearHighlights).toHaveBeenCalled()
  })
})

describe('executeMapTool — focus_bairro', () => {
  it('test_passes_nome', () => {
    executeMapTool('focus_bairro', { nome: 'Botafogo' }, makeDeps())
    expect(mapControl.focusBairro).toHaveBeenCalledWith('Botafogo')
  })
})

describe('executeMapTool — set_time_filter', () => {
  it('test_passes_hour_window', () => {
    executeMapTool('set_time_filter', { hora_inicio: 20, hora_fim: 23 }, makeDeps())
    expect(mapControl.setTimeFilter).toHaveBeenCalledWith(20, 23)
  })

  it('test_null_resets_filter', () => {
    executeMapTool('set_time_filter', { hora_inicio: null, hora_fim: null }, makeDeps())
    expect(mapControl.setTimeFilter).toHaveBeenCalledWith(null, null)
  })
})

describe('executeMapTool — show_route', () => {
  it('test_converts_to_lnglat_pairs', () => {
    executeMapTool(
      'show_route',
      { from_lat: -22.9, from_lng: -43.2, to_lat: -22.91, to_lng: -43.21, label: 'fuga' },
      makeDeps(),
    )
    expect(mapControl.showRoute).toHaveBeenCalledWith([-43.2, -22.9], [-43.21, -22.91], 'fuga')
  })
})

describe('executeMapTool — pause_for_user (no-op)', () => {
  it('test_does_not_call_any_map_method', () => {
    executeMapTool('pause_for_user', { next_suggestions: ['Mostre top trechos'] }, makeDeps())
    expect(mapControl.toggleLayer).not.toHaveBeenCalled()
    expect(mapControl.zoomToArea).not.toHaveBeenCalled()
    expect(mapControl.highlightTrecho).not.toHaveBeenCalled()
    expect(mapControl.focusBairro).not.toHaveBeenCalled()
    expect(mapControl.setTimeFilter).not.toHaveBeenCalled()
    expect(mapControl.showRoute).not.toHaveBeenCalled()
    expect(mapControl.clearHighlights).not.toHaveBeenCalled()
  })
})

describe('executeMapTool — unknown tool', () => {
  it('test_does_not_throw_for_unknown_tool', () => {
    expect(() => executeMapTool('unknown_tool', {}, makeDeps())).not.toThrow()
  })
})
