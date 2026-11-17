import { describe, expect, it } from 'vitest'
import { formatDecimal, formatFileSize, formatPercent } from './format'

describe('formatPercent', () => {
  it('formats and clamps', () => {
    expect(formatPercent(0.5)).toBe('50%')
    expect(formatPercent(2)).toBe('100%')
    expect(formatPercent(NaN)).toBe('0%')
  })
  it('follows the locale but keeps ASCII digits', () => {
    expect(formatPercent(0.5, 'fr')).toMatch(/^50\s?%$/)
    expect(formatPercent(0.5, 'ar')).toMatch(/^50/)
  })
})

describe('formatDecimal', () => {
  it('uses locale separators', () => {
    expect(formatDecimal(1.25, 'en')).toBe('1.25')
    expect(formatDecimal(1.25, 'de')).toBe('1,25')
  })
})

describe('formatFileSize', () => {
  it('scales units', () => {
    expect(formatFileSize(0)).toMatch(/^0\s?byte/)
    expect(formatFileSize(1500)).toMatch(/^1\.5\s?kB/)
    expect(formatFileSize(250_000_000)).toMatch(/^250\s?MB/)
  })
  it('localises', () => {
    expect(formatFileSize(1500, 'de')).toMatch(/^1,5/)
  })
})
