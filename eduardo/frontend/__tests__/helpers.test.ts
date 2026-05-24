import { describe, it, expect } from 'vitest'
import {
  fmt,
  scoreColor,
  faccaoColor,
  shortName,
  cap,
  MODUS_LABELS,
  ORGAO_LABELS,
  ORGAO_EMAIL,
} from '../app/lib/helpers'

describe('helpers', () => {
  it('test_fmt_formats_number', () => {
    const result = fmt(1234)
    expect(result).toContain('1')
    expect(result).toContain('234')
  })

  it('test_fmt_zero', () => {
    expect(fmt(0)).toBe('0')
  })

  it('test_scoreColor_high', () => {
    expect(scoreColor(70)).toBe('var(--red)')
  })

  it('test_scoreColor_medium', () => {
    expect(scoreColor(45)).toBe('var(--accent)')
  })

  it('test_scoreColor_low', () => {
    expect(scoreColor(30)).toBe('var(--amber)')
  })

  it('test_scoreColor_minimal', () => {
    expect(scoreColor(10)).toBe('var(--text-muted)')
  })

  it('test_faccaoColor_cv', () => {
    expect(faccaoColor('CV')).toBe('#ef4444')
  })

  it('test_faccaoColor_tcp', () => {
    expect(faccaoColor('TCP')).toBe('#a855f7')
  })

  it('test_faccaoColor_unknown', () => {
    expect(faccaoColor('Unknown')).toBe('#8a8a95')
  })

  it('test_shortName_splits_dash', () => {
    expect(shortName('Presidente Vargas - Campo de Santana')).toMatch(/^Presidente Vargas/)
  })

  it('test_shortName_no_dash', () => {
    expect(shortName('Rio Sul')).toBe('Rio Sul')
  })

  it('test_cap_capitalizes', () => {
    expect(cap('hello')).toBe('Hello')
  })

  it('test_cap_empty', () => {
    expect(cap('')).toBe('')
  })

  it('test_modus_labels_has_keys', () => {
    expect(MODUS_LABELS).toHaveProperty('a_pe')
    expect(MODUS_LABELS).toHaveProperty('motocicleta')
    expect(MODUS_LABELS).toHaveProperty('armado')
  })

  it('test_orgao_labels_match_emails', () => {
    for (const key of Object.keys(ORGAO_LABELS)) {
      expect(ORGAO_EMAIL).toHaveProperty(key)
    }
  })
})
