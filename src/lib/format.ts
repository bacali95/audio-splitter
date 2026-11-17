/** Locale-aware number formatting. Digits stay ASCII (`-u-nu-latn`) so they match timecodes and i18next counts. */
const latn = (locale: string) => `${locale}-u-nu-latn`

/** 0.5 -> "50%". */
export function formatPercent(ratio: number, locale = 'en'): string {
  const r = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
  return new Intl.NumberFormat(latn(locale), { style: 'percent', maximumFractionDigits: 0 }).format(r)
}

/** Plain decimal, e.g. 1.25 -> "1.25" (en) or "1,25" (fr). */
export function formatDecimal(value: number, locale = 'en'): string {
  return new Intl.NumberFormat(latn(locale), { maximumFractionDigits: 2 }).format(value)
}

const SIZE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const

/** 1536 -> "1.5 kB" (units localised by Intl; 1000-based like Intl's unit style). */
export function formatFileSize(bytes: number, locale = 'en'): string {
  let value = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  let unit = 0
  while (value >= 1000 && unit < SIZE_UNITS.length - 1) {
    value /= 1000
    unit++
  }
  return new Intl.NumberFormat(latn(locale), {
    style: 'unit',
    unit: SIZE_UNITS[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1,
  }).format(value)
}
