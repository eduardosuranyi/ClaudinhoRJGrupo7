import { describe, it, expect } from 'vitest'

type Weights = { mancha: number; pico: number; fatores: number; dinamica: number }

type MockArea = {
  score: {
    breakdown: {
      mancha_criminal: number
      pico_horario: number
      fatores_urbanos: number
      dinamica: number
      relint_bonus: number
    }
  }
}

const DEFAULT_WEIGHTS: Weights = { mancha: 40, pico: 15, fatores: 25, dinamica: 15 }

function computeScore(area: MockArea, weights: Weights): number {
  const b = area.score.breakdown
  const totalW = weights.mancha + weights.pico + weights.fatores + weights.dinamica
  const raw =
    (b.mancha_criminal / 40) * (weights.mancha / totalW) * 100 +
    (b.pico_horario / 15) * (weights.pico / totalW) * 100 +
    (b.fatores_urbanos / 25) * (weights.fatores / totalW) * 100 +
    (b.dinamica / 15) * (weights.dinamica / totalW) * 100 +
    (b.relint_bonus / 5) * 5
  return Math.round(raw * 10) / 10
}

function mockArea(breakdown: MockArea['score']['breakdown']): MockArea {
  return { score: { breakdown } }
}

describe('computeScore', () => {
  it('test_computeScore_default_weights', () => {
    const area = mockArea({
      mancha_criminal: 20,
      pico_horario: 7.5,
      fatores_urbanos: 12.5,
      dinamica: 7.5,
      relint_bonus: 0,
    })
    expect(computeScore(area, DEFAULT_WEIGHTS)).toBe(50)
  })

  it('test_computeScore_zero_single_weight', () => {
    const area = mockArea({
      mancha_criminal: 0,
      pico_horario: 15,
      fatores_urbanos: 0,
      dinamica: 0,
      relint_bonus: 0,
    })
    const withPico = computeScore(area, DEFAULT_WEIGHTS)
    const withoutPico = computeScore(area, { ...DEFAULT_WEIGHTS, pico: 0 })
    expect(withoutPico).toBeLessThan(withPico)
    expect(withPico).toBe(15.8)
    expect(withoutPico).toBe(0)
  })

  it('test_computeScore_custom_weights', () => {
    const area = mockArea({
      mancha_criminal: 40,
      pico_horario: 0,
      fatores_urbanos: 0,
      dinamica: 0,
      relint_bonus: 0,
    })
    const defaultScore = computeScore(area, DEFAULT_WEIGHTS)
    const customScore = computeScore(area, { ...DEFAULT_WEIGHTS, mancha: 80 })
    expect(customScore).not.toBe(defaultScore)
    expect(defaultScore).toBe(42.1)
    expect(customScore).toBe(59.3)
  })

  it('test_computeScore_relint_bonus', () => {
    const area = mockArea({
      mancha_criminal: 0,
      pico_horario: 0,
      fatores_urbanos: 0,
      dinamica: 0,
      relint_bonus: 5,
    })
    const defaultResult = computeScore(area, DEFAULT_WEIGHTS)
    const customResult = computeScore(area, { mancha: 80, pico: 10, fatores: 5, dinamica: 5 })
    expect(defaultResult).toBe(5)
    expect(customResult).toBe(5)
  })
})
