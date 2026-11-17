import { describe, expect, it } from 'vitest'
import { LANGUAGES, getDirection, pickLanguage, resolveLanguage } from './languages'

describe('resolveLanguage', () => {
  it('keeps supported codes', () => {
    for (const l of LANGUAGES) expect(resolveLanguage(l.code)).toBe(l.code)
  })
  it('maps regional variants', () => {
    expect(resolveLanguage('fr-CA')).toBe('fr')
    expect(resolveLanguage('en-GB')).toBe('en')
    expect(resolveLanguage('pt')).toBe('pt-BR')
    expect(resolveLanguage('pt-PT')).toBe('pt-BR')
    expect(resolveLanguage('pt-br')).toBe('pt-BR')
    expect(resolveLanguage('zh')).toBe('zh-CN')
    expect(resolveLanguage('zh-Hans')).toBe('zh-CN')
    expect(resolveLanguage('zh-SG')).toBe('zh-CN')
    expect(resolveLanguage('zh_TW')).toBe('zh-CN')
    expect(resolveLanguage('ar-EG')).toBe('ar')
    expect(resolveLanguage('es-419')).toBe('es')
  })
  it('rejects unknown input', () => {
    expect(resolveLanguage('xx')).toBeNull()
    expect(resolveLanguage('')).toBeNull()
    expect(resolveLanguage(null)).toBeNull()
  })
})

describe('pickLanguage', () => {
  it('takes the first supported tag, else en', () => {
    expect(pickLanguage(['xx', 'de-AT', 'fr'])).toBe('de')
    expect(pickLanguage(['xx'])).toBe('en')
    expect(pickLanguage([])).toBe('en')
  })
})

describe('getDirection', () => {
  it('is rtl only for Arabic', () => {
    expect(LANGUAGES.filter((l) => getDirection(l.code) === 'rtl').map((l) => l.code)).toEqual(['ar'])
  })
})
