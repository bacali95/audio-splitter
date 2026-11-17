import { describe, expect, it } from 'vitest'
import { formatRelative, formatTime, parseTime, validateRange } from './time'

describe('formatTime', () => {
  it('formats basic values', () => {
    expect(formatTime(0)).toBe('00:00:00.000')
    expect(formatTime(61.5)).toBe('00:01:01.500')
    expect(formatTime(3723.045)).toBe('01:02:03.045')
  })
  it('rounds ms without producing 60 seconds', () => {
    expect(formatTime(59.9996)).toBe('00:01:00.000')
  })
  it('handles bad input and no-ms', () => {
    expect(formatTime(-5)).toBe('00:00:00.000')
    expect(formatTime(NaN)).toBe('00:00:00.000')
    expect(formatTime(3661.9, false)).toBe('01:01:01')
  })
  it('supports > 99 hours', () => {
    expect(formatTime(360000)).toBe('100:00:00.000')
  })
})

describe('parseTime', () => {
  it('parses full and short forms', () => {
    expect(parseTime('01:02:03.045')).toBe(3723.045)
    expect(parseTime('02:03.5')).toBe(123.5)
    expect(parseTime('45')).toBe(45)
    expect(parseTime('90.25')).toBe(90.25)
    expect(parseTime(' 00:00:01 ')).toBe(1)
  })
  it('rejects invalid input', () => {
    for (const bad of ['', 'abc', '1:2:3:4', '00:61:00', '00:00:75', '-1', '1..2', '12:', ':30', '1e3']) {
      expect(parseTime(bad), bad).toBeNull()
    }
  })
  it('round trips', () => {
    for (const v of [0, 0.001, 12.345, 3599.999, 7384.5]) {
      expect(parseTime(formatTime(v))).toBeCloseTo(v, 3)
    }
  })
})

describe('validateRange', () => {
  it('accepts valid ranges', () => expect(validateRange(1, 2, 10)).toBeNull())
  it('rejects end <= start', () => {
    expect(validateRange(2, 2, 10)).not.toBeNull()
    expect(validateRange(3, 2, 10)).not.toBeNull()
  })
  it('rejects past duration', () => expect(validateRange(1, 11, 10)).not.toBeNull())
})

describe('formatRelative', () => {
  const now = Date.UTC(2026, 0, 15, 12, 0, 0)
  it('handles recent, minutes, hours and days', () => {
    expect(formatRelative(now - 10_000, now)).toBe('just now')
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 minutes ago')
    expect(formatRelative(now - 3 * 3600_000, now)).toBe('3 hours ago')
    expect(formatRelative(now - 86400_000, now)).toBe('yesterday')
    expect(formatRelative(now - 3 * 86400_000, now)).toBe('3 days ago')
  })
  it('falls back for missing or old timestamps', () => {
    expect(formatRelative(0, now)).toBe('unknown date')
    expect(formatRelative(now - 90 * 86400_000, now)).toMatch(/2025/)
  })
})
