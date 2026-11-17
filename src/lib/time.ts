/** Format seconds as HH:MM:SS.mmm (rounded to the nearest millisecond). */
export function formatTime(seconds: number, withMs = true): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const totalMs = Math.round(seconds * 1000)
  const ms = totalMs % 1000
  const totalSec = Math.floor(totalMs / 1000)
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60) % 60
  const h = Math.floor(totalSec / 3600)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const base = `${p2(h)}:${p2(m)}:${p2(s)}`
  return withMs ? `${base}.${String(ms).padStart(3, '0')}` : base
}

/**
 * Parse "HH:MM:SS.mmm", "MM:SS.mmm", "SS.mmm" or plain seconds ("90.5").
 * Returns seconds, or null if the text is not a valid time.
 */
export function parseTime(text: string): number | null {
  const t = text.trim()
  if (!t) return null
  const parts = t.split(':')
  if (parts.length > 3) return null
  // Every part must be digits; only the last may have a fractional part.
  for (let i = 0; i < parts.length; i++) {
    const re = i === parts.length - 1 ? /^\d+(\.\d+)?$/ : /^\d+$/
    if (!re.test(parts[i])) return null
  }
  const nums = parts.map(Number)
  const sec = nums[nums.length - 1]
  const min = nums.length >= 2 ? nums[nums.length - 2] : 0
  const hr = nums.length === 3 ? nums[0] : 0
  if (parts.length > 1 && sec >= 60) return null
  if (parts.length === 3 && min >= 60) return null
  const total = hr * 3600 + min * 60 + sec
  return Math.round(total * 1000) / 1000
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

/** Validate a start/end pair edited by the user. Returns an error message or null. */
export function validateRange(start: number, end: number, duration: number): string | null {
  if (!(end > start)) return 'End must be after start'
  if (start < 0) return 'Start must be >= 0'
  if (duration > 0 && end > duration + 0.0005) return 'End is past the end of the file'
  return null
}

/** "just now", "5 minutes ago", "yesterday", "3 days ago"; falls back to a date after about a month. */
export function formatRelative(timestamp: number, now = Date.now()): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'unknown date'
  const diff = Math.round((timestamp - now) / 1000)
  const abs = Math.abs(diff)
  if (abs < 45) return 'just now'
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
  return new Date(timestamp).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
}
