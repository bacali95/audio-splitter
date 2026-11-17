export type Direction = 'ltr' | 'rtl'

export interface LanguageInfo {
  code: string
  /** The language's own name, shown in the switcher. */
  nativeName: string
  dir: Direction
}

export const LANGUAGES = [
  { code: 'en', nativeName: 'English', dir: 'ltr' },
  { code: 'fr', nativeName: 'Français', dir: 'ltr' },
  { code: 'ar', nativeName: 'العربية', dir: 'rtl' },
  { code: 'es', nativeName: 'Español', dir: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', dir: 'ltr' },
  { code: 'it', nativeName: 'Italiano', dir: 'ltr' },
  { code: 'ru', nativeName: 'Русский', dir: 'ltr' },
  { code: 'zh-CN', nativeName: '中文（简体）', dir: 'ltr' },
  { code: 'ja', nativeName: '日本語', dir: 'ltr' },
] as const satisfies readonly LanguageInfo[]

export type LanguageCode = (typeof LANGUAGES)[number]['code']

export const FALLBACK_LANGUAGE: LanguageCode = 'en'
export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = LANGUAGES.map((l) => l.code)
/** localStorage key holding the user's explicit language choice. */
export const LANGUAGE_STORAGE_KEY = 'audio-splitter:lang'

export function isSupportedLanguage(code: unknown): code is LanguageCode {
  return typeof code === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(code)
}

export function getDirection(code: string): Direction {
  return LANGUAGES.find((l) => l.code === code)?.dir ?? 'ltr'
}

/**
 * Map any BCP 47 tag (navigator.language, a stored value) to a supported language code, or null.
 * Regional variants collapse onto the language we ship: fr-CA -> fr, pt / pt-PT -> pt-BR,
 * zh / zh-Hans / zh-SG / zh-TW ... -> zh-CN, en-GB -> en.
 */
export function resolveLanguage(tag: string | null | undefined): LanguageCode | null {
  if (!tag) return null
  const normalized = tag.trim().replace(/_/g, '-').toLowerCase()
  if (!normalized) return null
  const exact = SUPPORTED_LANGUAGES.find((c) => c.toLowerCase() === normalized)
  if (exact) return exact
  const base = normalized.split('-')[0]
  if (base === 'pt') return 'pt-BR'
  if (base === 'zh') return 'zh-CN'
  return SUPPORTED_LANGUAGES.find((c) => c.toLowerCase() === base) ?? null
}

/** First tag in `tags` that maps to a supported language, else the fallback. */
export function pickLanguage(tags: readonly (string | null | undefined)[]): LanguageCode {
  for (const tag of tags) {
    const code = resolveLanguage(tag)
    if (code) return code
  }
  return FALLBACK_LANGUAGE
}
