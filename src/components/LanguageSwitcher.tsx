import { Select, SelectContent, SelectItem, SelectItemIndicator, SelectTrigger, SelectValue } from '@ui-sdk/react/select'
import { CheckIcon, ChevronDownIcon, LanguagesIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { changeLanguage } from '../i18n'
import { LANGUAGES, isSupportedLanguage } from '../i18n/languages'

const ITEMS = LANGUAGES.map((l) => ({ value: l.code, label: l.nativeName }))

/** Compact language picker. Wide screens show the native name; narrow screens show only the icon and the code. */
export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = isSupportedLanguage(i18n.language) ? i18n.language : 'en'
  return (
    <Select items={ITEMS} value={current} onValueChange={(v) => isSupportedLanguage(v) && void changeLanguage(v)}>
      <SelectTrigger aria-label={t('language.label')} className="lang-trigger">
        <LanguagesIcon aria-hidden="true" />
        <span className="lang-name">
          <SelectValue />
        </span>
        <span className="lang-code" aria-hidden="true">{current}</span>
        <ChevronDownIcon aria-hidden="true" />
      </SelectTrigger>
      <SelectContent align="end">
        {LANGUAGES.map((l) => (
          <SelectItem key={l.code} value={l.code} lang={l.code}>
            {l.nativeName}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
