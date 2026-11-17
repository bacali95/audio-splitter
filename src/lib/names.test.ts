import { describe, expect, it } from 'vitest'
import { defaultSegmentName, splitExt, validateName, validateNames } from './names'

describe('splitExt', () => {
  it('splits', () => {
    expect(splitExt('talk.final.mp3')).toEqual({ base: 'talk.final', ext: '.mp3' })
    expect(splitExt('noext')).toEqual({ base: 'noext', ext: '' })
    expect(splitExt('.hidden')).toEqual({ base: '.hidden', ext: '' })
  })
})

describe('defaultSegmentName', () => {
  it('pads', () => expect(defaultSegmentName('show', 0)).toBe('show_01'))
  it('does not truncate', () => expect(defaultSegmentName('show', 120)).toBe('show_121'))
})

describe('validateName', () => {
  it('rejects empty', () => {
    expect(validateName('')).not.toBeNull()
    expect(validateName('   ')).not.toBeNull()
  })
  it('rejects forbidden characters', () => {
    for (const c of ['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
      expect(validateName(`a${c}b`), c).not.toBeNull()
    }
  })
  it('accepts normal names', () => {
    expect(validateName('Chapter 1 - Intro (v2)')).toBeNull()
    expect(validateName('éàü_01')).toBeNull()
  })
  it('returns codes', () => {
    expect(validateName('')).toBe('required')
    expect(validateName('a/b')).toBe('forbiddenChars')
    expect(validateName('..')).toBe('invalid')
    expect(validateName('x'.repeat(201))).toBe('tooLong')
  })
  it('rejects dot names', () => {
    expect(validateName('..')).not.toBeNull()
  })
})

describe('validateNames', () => {
  it('flags duplicates case-insensitively', () => {
    expect(validateNames(['a', 'B', 'b', 'c'])).toEqual([null, 'duplicate', 'duplicate', null])
  })
  it('flags individual errors first', () => {
    expect(validateNames(['', 'ok'])).toEqual(['required', null])
  })
})
