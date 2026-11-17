export const FORBIDDEN_CHARS = /[\\/:*?"<>|]/
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f]/

/** Split "talk.final.mp3" into { base: "talk.final", ext: ".mp3" }. ext is "" if none. */
export function splitExt(fileName: string): { base: string; ext: string } {
  const i = fileName.lastIndexOf('.')
  if (i <= 0 || i === fileName.length - 1) return { base: fileName, ext: '' }
  return { base: fileName.slice(0, i), ext: fileName.slice(i) }
}

export function defaultSegmentName(originalBase: string, index: number): string {
  return `${originalBase}_${String(index + 1).padStart(2, '0')}`
}

/** Why a file name is not acceptable. The UI maps each code to `errors.name.<code>`. */
export type NameError = 'required' | 'forbiddenChars' | 'invalid' | 'tooLong' | 'duplicate'

/** Validate one name in isolation. Returns an error code or null. */
export function validateName(name: string): NameError | null {
  const n = name.trim()
  if (!n) return 'required'
  if (FORBIDDEN_CHARS.test(n) || CONTROL_CHARS.test(n)) return 'forbiddenChars'
  if (n === '.' || n === '..') return 'invalid'
  if (n.length > 200) return 'tooLong'
  return null
}

/**
 * Validate a list of names (case-insensitive duplicate detection).
 * Returns an array of the same length: error code or null per entry.
 */
export function validateNames(names: string[]): (NameError | null)[] {
  const counts = new Map<string, number>()
  for (const n of names) {
    const k = n.trim().toLowerCase()
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return names.map((n) => {
    const single = validateName(n)
    if (single) return single
    if ((counts.get(n.trim().toLowerCase()) ?? 0) > 1) return 'duplicate'
    return null
  })
}
