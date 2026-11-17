import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin, { type Region } from 'wavesurfer.js/plugins/regions'
import TimelinePlugin from 'wavesurfer.js/plugins/timeline'
import HoverPlugin from 'wavesurfer.js/plugins/hover'
import { segmentColor, sortSegments } from '../lib/colors'
import type { Segment } from '../lib/storage'
import { onThemeChange, readWaveColors } from '../lib/theme'
import { formatTime } from '../lib/time'

const PENDING_ID = '__pending__'
const MIN_SEGMENT = 0.05

const FILL_ALPHA = 0.22
const FILL_ALPHA_ACTIVE = 0.35

/** Region labels live in WaveSurfer's shadow DOM, so they are styled inline (CSS variables still inherit). */
function makeLabel(text: string, color: string, solidText: boolean): HTMLSpanElement {
  const el = document.createElement('span')
  el.textContent = text
  Object.assign(el.style, {
    display: 'inline-block',
    margin: '4px',
    padding: '1px 6px',
    borderRadius: '999px',
    background: color,
    color: solidText ? 'oklch(0.2 0 0)' : 'var(--primary-foreground)',
    fontFamily: 'var(--font-sans)',
    fontSize: '10px',
    fontWeight: '600',
    lineHeight: '14px',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  })
  return el
}

/** Solid handles and (for the active region) an outline, applied straight to the region's element. */
function styleRegion(r: Region, color: string, active: boolean) {
  const el = r.element
  if (!el) return
  el.style.boxShadow = active ? `inset 0 0 0 2px ${color}` : 'none'
  el.style.zIndex = active ? '3' : ''
  for (const h of el.querySelectorAll<HTMLElement>('[part~="region-handle"]')) {
    h.style.setProperty('border-color', color, 'important')
    h.style.setProperty('border-width', '2px', 'important')
    h.style.opacity = '1'
  }
}

export interface UseWaveformOptions {
  waveformEl: HTMLDivElement | null
  timelineEl: HTMLDivElement | null
  media: HTMLAudioElement | null
  peaks: Float32Array | null
  duration: number
  segments: Segment[]
  pendingStart: number | null
  activeId: string | null
  /** A region was clicked or created (id). */
  onSelect: (id: string) => void
  /** User created a region by dragging on the waveform. */
  onCreate: (seg: Segment) => void
  /** User dragged/resized a region. */
  onChange: (id: string, start: number, end: number) => void
}

export interface WaveformApi {
  currentTime: number
  playing: boolean
  togglePlay: () => void
  play: () => void
  pause: () => void
  seek: (t: number) => void
  seekBy: (delta: number) => void
  playSegment: (id: string) => void
  setZoom: (z: number) => void
  zoom: number
  getTime: () => number
}

/** Slider position 0..100 -> pixels per second (0 = fit to width). */
export function zoomToPps(z: number): number {
  return z <= 0 ? 0 : Math.pow(400, z / 100)
}

export function useWaveform(opts: UseWaveformOptions): WaveformApi {
  const { waveformEl, timelineEl, media, peaks, duration, segments, pendingStart, activeId } = opts
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const segmentsRef = useRef(segments)
  segmentsRef.current = segments
  const cbRef = useRef({ onCreate: opts.onCreate, onChange: opts.onChange, onSelect: opts.onSelect })
  cbRef.current = { onCreate: opts.onCreate, onChange: opts.onChange, onSelect: opts.onSelect }
  const stopAtRef = useRef<number | null>(null)
  const zoomRef = useRef(0)
  const zoomFnRef = useRef<((z: number, x?: number) => void) | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [zoom, setZoomState] = useState(0)
  const [ready, setReady] = useState(false)
  const [themeTick, setThemeTick] = useState(0)

  // ---- create / destroy WaveSurfer ----
  useEffect(() => {
    if (!waveformEl || !timelineEl || !media || !peaks || !(duration > 0)) return
    const colors = readWaveColors()
    const regions = RegionsPlugin.create()
    const ws = WaveSurfer.create({
      container: waveformEl,
      media,
      peaks: [peaks],
      duration,
      height: 140,
      waveColor: colors.wave,
      progressColor: colors.progress,
      cursorColor: colors.cursor,
      cursorWidth: 2,
      minPxPerSec: 0,
      autoScroll: true,
      autoCenter: false,
      dragToSeek: false,
      normalize: false,
      plugins: [
        regions,
        TimelinePlugin.create({
          container: timelineEl,
          height: 22,
          formatTimeCallback: (s) => {
            const t = Math.round(s)
            const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60
            const ss = String(sec).padStart(2, '0')
            return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
          },
        }),
        HoverPlugin.create({
          lineColor: 'var(--muted-foreground)',
          lineWidth: 1,
          labelBackground: 'var(--foreground)',
          labelColor: 'var(--background)',
          labelSize: 11,
          formatTimeCallback: (s) => formatTime(s),
        }),
      ],
    })
    wsRef.current = ws
    regionsRef.current = regions
    zoomRef.current = 0
    setZoomState(0)
    setCurrentTime(0)

    const disableDrag = regions.enableDragSelection({ color: segmentColor(segmentsRef.current.length, FILL_ALPHA) }, 4)

    regions.on('region-created', (r: Region) => {
      if (r.id === PENDING_ID) return
      if (segmentsRef.current.some((s) => s.id === r.id)) return // programmatic
      const start = Math.max(0, r.start)
      const end = Math.min(duration, r.end)
      if (end - start < MIN_SEGMENT) {
        r.remove()
        return
      }
      cbRef.current.onCreate({ id: r.id, start, end, name: '' })
      cbRef.current.onSelect(r.id)
    })
    regions.on('region-clicked', (r: Region) => {
      if (r.id !== PENDING_ID) cbRef.current.onSelect(r.id)
    })
    regions.on('region-updated', (r: Region) => {
      if (r.id === PENDING_ID) return
      const seg = segmentsRef.current.find((s) => s.id === r.id)
      if (!seg) return
      const start = Math.max(0, r.start)
      const end = Math.min(duration, r.end)
      if (Math.abs(seg.start - start) > 1e-3 || Math.abs(seg.end - end) > 1e-3) {
        cbRef.current.onChange(r.id, start, end)
      }
    })

    // Keep the canvas colours in step with the light/dark theme.
    const offTheme = onThemeChange(() => {
      const c = readWaveColors()
      ws.setOptions({ waveColor: c.wave, progressColor: c.progress, cursorColor: c.cursor })
      setThemeTick((n) => n + 1)
    })

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    media.addEventListener('play', onPlay)
    media.addEventListener('pause', onPause)
    setPlaying(!media.paused)

    // rAF loop: smooth clock + stop-at-segment-end.
    let raf = 0
    let lastEmit = 0
    const tick = (ts: number) => {
      const t = media.currentTime
      const stop = stopAtRef.current
      if (stop !== null && !media.paused && t >= stop) {
        media.pause()
        media.currentTime = stop
        stopAtRef.current = null
      }
      if (ts - lastEmit > 66) {
        lastEmit = ts
        setCurrentTime(media.currentTime)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const onSeeked = () => setCurrentTime(media.currentTime)
    media.addEventListener('seeked', onSeeked)

    // Ctrl/Cmd + wheel zoom, anchored on the pointer.
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      const old = zoomRef.current
      const next = Math.min(100, Math.max(0, old - e.deltaY * 0.15))
      if (next === old) return
      applyZoom(next, e.clientX)
    }
    waveformEl.addEventListener('wheel', onWheel, { passive: false })

    function ppsOf(z: number) {
      const p = zoomToPps(z)
      return p > 0 ? p : Math.max(1e-6, waveformEl!.clientWidth / duration)
    }
    function applyZoom(z: number, anchorClientX?: number) {
      const oldPps = ppsOf(zoomRef.current)
      const rect = waveformEl!.getBoundingClientRect()
      const x = anchorClientX !== undefined ? anchorClientX - rect.left : rect.width / 2
      const tAnchor = (ws.getScroll() + x) / oldPps
      zoomRef.current = z
      setZoomState(z)
      ws.zoom(zoomToPps(z))
      if (z > 0) ws.setScroll(Math.max(0, tAnchor * ppsOf(z) - x))
    }
    zoomFnRef.current = applyZoom

    setReady(true)
    return () => {
      setReady(false)
      cancelAnimationFrame(raf)
      waveformEl.removeEventListener('wheel', onWheel)
      offTheme()
      media.removeEventListener('play', onPlay)
      media.removeEventListener('pause', onPause)
      media.removeEventListener('seeked', onSeeked)
      disableDrag()
      ws.destroy()
      wsRef.current = null
      regionsRef.current = null
      zoomFnRef.current = null
    }
  }, [waveformEl, timelineEl, media, peaks, duration])

  // ---- sync segments -> regions ----
  const sorted = useMemo(() => sortSegments(segments), [segments])
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions || !ready) return
    const existing = new Map(regions.getRegions().map((r) => [r.id, r]))
    const wanted = new Set(sorted.map((s) => s.id))
    for (const [id, r] of existing) if (id !== PENDING_ID && !wanted.has(id)) r.remove()
    sorted.forEach((s, i) => {
      const active = s.id === activeId
      const solid = segmentColor(i)
      const fill = segmentColor(i, active ? FILL_ALPHA_ACTIVE : FILL_ALPHA)
      const label = makeLabel(String(i + 1), solid, true)
      let r = existing.get(s.id)
      if (!r) {
        r = regions.addRegion({
          id: s.id,
          start: s.start,
          end: s.end,
          color: fill,
          content: label,
          drag: true,
          resize: true,
          minLength: MIN_SEGMENT,
        })
      } else {
        const changed = Math.abs(r.start - s.start) > 1e-3 || Math.abs(r.end - s.end) > 1e-3
        r.setOptions({ color: fill, content: label, ...(changed ? { start: s.start, end: s.end } : {}) })
      }
      styleRegion(r, solid, active)
    })
  }, [sorted, ready, activeId])

  // ---- pending-start marker ----
  useEffect(() => {
    const regions = regionsRef.current
    if (!regions || !ready) return
    regions.getRegions().find((r) => r.id === PENDING_ID)?.remove()
    if (pendingStart !== null) {
      // start === end makes a marker: a thin line in `color`, with the label as its content.
      regions.addRegion({
        id: PENDING_ID,
        start: pendingStart,
        color: readWaveColors().primary,
        content: makeLabel('Start', 'var(--primary)', false),
        drag: false,
        resize: false,
        avoidOverlapping: false,
      })
    }
  }, [pendingStart, ready, duration, themeTick])

  const play = useCallback(() => {
    stopAtRef.current = null
    void media?.play()
  }, [media])
  const pause = useCallback(() => {
    stopAtRef.current = null
    media?.pause()
  }, [media])
  const togglePlay = useCallback(() => {
    if (!media) return
    if (media.paused) play()
    else pause()
  }, [media, play, pause])
  const seek = useCallback(
    (t: number) => {
      if (!media) return
      media.currentTime = Math.min(Math.max(0, t), duration || media.duration || 0)
      setCurrentTime(media.currentTime)
    },
    [media, duration],
  )
  const seekBy = useCallback((d: number) => media && seek(media.currentTime + d), [media, seek])
  const playSegment = useCallback(
    (id: string) => {
      const s = segmentsRef.current.find((x) => x.id === id)
      if (!s || !media) return
      media.currentTime = s.start
      stopAtRef.current = s.end
      void media.play()
    },
    [media],
  )
  const setZoom = useCallback((z: number) => zoomFnRef.current?.(z), [])
  const getTime = useCallback(() => media?.currentTime ?? 0, [media])

  return { currentTime, playing, togglePlay, play, pause, seek, seekBy, playSegment, setZoom, zoom, getTime }
}
