import { describe, expect, it } from 'vitest'
import { SEGMENT_HUES, assignSegmentColors, segmentColor, segmentHue, segmentOrder, sortSegments } from './colors'

const seg = (id: string, start: number, end: number) => ({ id, start, end })

describe('segmentColor', () => {
  it('uses the fixed palette in order', () => {
    expect(SEGMENT_HUES).toHaveLength(8)
    expect(segmentColor(0)).toBe('oklch(0.7 0.15 250)')
    expect(segmentColor(1)).toBe('oklch(0.7 0.15 160)')
    expect(segmentColor(7)).toBe('oklch(0.7 0.15 120)')
  })
  it('wraps after eight segments and tolerates negatives', () => {
    expect(segmentHue(8)).toBe(SEGMENT_HUES[0])
    expect(segmentHue(9)).toBe(SEGMENT_HUES[1])
    expect(segmentHue(-1)).toBe(SEGMENT_HUES[7])
  })
  it('adds alpha only below 1', () => {
    expect(segmentColor(2, 0.22)).toBe('oklch(0.7 0.15 30 / 0.22)')
    expect(segmentColor(2, 1)).toBe('oklch(0.7 0.15 30)')
  })
})

describe('assignSegmentColors', () => {
  const a = seg('a', 10, 20)
  const b = seg('b', 0, 5)
  const c = seg('c', 30, 40)

  it('colours by order of start, not by input order', () => {
    const m = assignSegmentColors([a, b, c])
    expect(m.get('b')).toBe(segmentColor(0))
    expect(m.get('a')).toBe(segmentColor(1))
    expect(m.get('c')).toBe(segmentColor(2))
  })
  it('is deterministic for any input order', () => {
    const x = assignSegmentColors([a, b, c])
    const y = assignSegmentColors([c, a, b])
    expect([...x.entries()].sort()).toEqual([...y.entries()].sort())
  })
  it('recolours when the order changes', () => {
    const before = assignSegmentColors([a, b, c]).get('a')
    const after = assignSegmentColors([a, b, c, seg('d', 1, 2)]).get('a')
    expect(before).toBe(segmentColor(1))
    expect(after).toBe(segmentColor(2))
  })
  it('breaks start ties by end, then id', () => {
    const order = segmentOrder([seg('z', 5, 9), seg('y', 5, 7), seg('x', 5, 7)])
    expect(order.get('x')).toBe(0)
    expect(order.get('y')).toBe(1)
    expect(order.get('z')).toBe(2)
  })
  it('does not mutate its input', () => {
    const input = [a, b, c]
    sortSegments(input)
    expect(input.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})
