/**
 * Deterministic segment colours. A segment's colour depends only on its position when the
 * segments are sorted by start time, so it is stable across reloads and changes only when
 * the order changes.
 */

/** Eight well separated hues; lightness and chroma are fixed so they read on light and dark. */
export const SEGMENT_HUES = [250, 160, 30, 300, 85, 200, 350, 120] as const
const LIGHTNESS = 0.7
const CHROMA = 0.15

export interface Ordered {
  id: string
  start: number
  end: number
}

/** The one ordering used everywhere: start, then end, then id (so ties are stable). */
export function sortSegments<T extends Ordered>(segments: readonly T[]): T[] {
  return [...segments].sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export function segmentHue(index: number): number {
  const n = SEGMENT_HUES.length
  return SEGMENT_HUES[((Math.trunc(index) % n) + n) % n]
}

/** oklch() colour for the segment at `index` in sorted order, with optional alpha (0..1). */
export function segmentColor(index: number, alpha = 1): string {
  const a = alpha >= 1 ? '' : ` / ${Number(alpha.toFixed(3))}`
  return `oklch(${LIGHTNESS} ${CHROMA} ${segmentHue(index)}${a})`
}

/** Map of segment id to its sorted index (0-based). */
export function segmentOrder(segments: readonly Ordered[]): Map<string, number> {
  return new Map(sortSegments(segments).map((s, i) => [s.id, i]))
}

/** Map of segment id to its solid colour. */
export function assignSegmentColors(segments: readonly Ordered[]): Map<string, string> {
  return new Map(sortSegments(segments).map((s, i) => [s.id, segmentColor(i)]))
}
