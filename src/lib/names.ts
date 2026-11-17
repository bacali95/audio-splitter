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

/** Validate one name in isolation. Returns an error message or null. */
export function validateName(name: string): string | null {
  const n = name.trim()
  if (!n) return 'Name is required'
  if (FORBIDDEN_CHARS.test(n) || CONTROL_CHARS.test(n)) return 'Must not contain \\ / : * ? " < > |'
  if (n === '.' || n === '..') return 'Invalid name'
  if (n.length > 200) return 'Too long'
  return null
}

/**
 * Validate a list of names (case-insensitive duplicate detection).
 * Returns an array of the same length: error message or null per entry.
 */
export function validateNames(names: string[]): (string | null)[] {
  const counts = new Map<string, number>()
  for (const n of names) {
    const k = n.trim().toLowerCase()
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return names.map((n) => {
    const single = validateName(n)
    if (single) return single
    if ((counts.get(n.trim().toLowerCase()) ?? 0) > 1) return 'Duplicate name'
    return null
  })
}
