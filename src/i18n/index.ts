import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import {
  FALLBACK_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  getDirection,
  pickLanguage,
  resolveLanguage,
  type LanguageCode,
} from './languages'

/** Every locale except English (which is bundled) is its own lazily loaded chunk. */
const loaders = import.meta.glob<{ default: Record<string, unknown> }>(['./locales/*.json', '!./locales/en.json'])

function applyDocumentLanguage(lng: string) {
  const root = document.documentElement
  root.lang = lng
  root.dir = getDirection(lng)
  document.title = i18n.t('app.title')
}

function stored(): string | null {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    return null
  }
}

/** Switch language (loads its chunk first; the UI keeps the current language until then) and remember the choice. */
export async function changeLanguage(code: LanguageCode): Promise<void> {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
  } catch {
    /* storage unavailable: the choice just won't persist */
  }
  await i18n.changeLanguage(code)
}

i18n.on('languageChanged', applyDocumentLanguage)

void i18n
  .use(LanguageDetector)
  .use(
    resourcesToBackend((lng: string) => {
      const load = loaders[`./locales/${lng}.json`]
      return load ? load().then((m) => m.default) : Promise.reject(new Error(`No locale file for ${lng}`))
    }),
  )
  .use(initReactI18next)
  .init({
    // English is bundled and used for the first render; the detected language replaces it once its chunk has loaded.
    resources: { en: { translation: en } },
    partialBundledLanguages: true,
    initAsync: false,
    lng: FALLBACK_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    nonExplicitSupportedLngs: false,
    load: 'currentOnly',
    defaultNS: 'translation',
    ns: ['translation'],
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: [],
      // Map regional variants (fr-CA, pt-PT, zh-Hans...) before i18next matches against supportedLngs.
      convertDetectedLanguage: (l: string) => resolveLanguage(l) ?? l,
    },
  })

applyDocumentLanguage(i18n.language)

{
  // localStorage first, then navigator (see `detection` above); the manual fallback covers a detector that found nothing.
  const detected = i18n.services.languageDetector?.detect?.()
  const found = (Array.isArray(detected) ? detected : detected ? [detected] : []).filter(Boolean)
  const tags = found.length > 0 ? found : [stored(), ...(typeof navigator === 'undefined' ? [] : navigator.languages ?? [])]
  const target = pickLanguage(tags)
  if (target !== i18n.language) void i18n.changeLanguage(target)
}

export default i18n
