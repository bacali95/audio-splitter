import { Button } from '@ui-sdk/react/button'
import { Progress, ProgressIndicator, ProgressTrack, ProgressValue } from '@ui-sdk/react/progress'
import { Toast, ToastAction, ToastDescription, ToastRegion, ToastTitle, toast } from '@ui-sdk/react/toast'
import {
  CircleCheckIcon,
  DownloadIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  ScissorsIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ExportDialog } from './components/ExportDialog'
import { FileLoader } from './components/FileLoader'
import { RecentSessions } from './components/RecentSessions'
import { SegmentList } from './components/SegmentList'
import { Transport } from './components/Transport'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Tip } from './components/ui'
import { Waveform } from './components/Waveform'
import { useWaveform } from './hooks/useWaveform'
import { fingerprintFile } from './lib/fingerprint'
import { PEAKS_PER_SEC, generatePeaks, unmountFile } from './lib/ffmpeg'
import {
  type Segment,
  type SessionListItem,
  deletePeaks,
  deleteSession,
  getPeaks,
  listSessions,
  loadSession,
  putPeaks,
  saveSession,
} from './lib/storage'
import { segmentOrder } from './lib/colors'
import { splitExt } from './lib/names'
import { clamp, formatTime } from './lib/time'

interface Loaded {
  file: File
  fingerprint: string
  media: HTMLAudioElement
  url: string
  duration: number
  peaks: Float32Array
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string; label: string; progress: number | null }
  | { kind: 'ready' }

/** Targets that own Delete/Backspace/Escape themselves (text fields, open popups, dialogs). */
function ownsEditingKeys(t: EventTarget | null): boolean {
  if (isTypingTarget(t)) return true
  return t instanceof HTMLElement && t.closest('[role="dialog"], [role="listbox"], [role="combobox"], [data-slot="popover-content"], [data-slot="select-content"], [data-slot="dialog-content"]') != null
}

function ToastIcon({ type }: { type?: string }) {
  switch (type) {
    case 'success':
      return <CircleCheckIcon aria-hidden="true" />
    case 'error':
      return <OctagonXIcon aria-hidden="true" />
    case 'warning':
      return <TriangleAlertIcon aria-hidden="true" />
    case 'loading':
      return <Loader2Icon className="spin" aria-hidden="true" />
    case 'info':
      return <InfoIcon aria-hidden="true" />
    default:
      return null
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)
}

function readMetadata(url: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    const a = new Audio()
    a.preload = 'metadata'
    a.onloadedmetadata = () => resolve(a)
    a.onerror = () => reject(new Error("This browser can't play that file (unsupported codec or corrupt file)."))
    a.src = url
  })
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [segments, setSegments] = useState<Segment[]>([])
  const [pendingStart, setPendingStart] = useState<number | null>(null)
  const [rate, setRate] = useState(1)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionListItem[]>(() => listSessions())
  const [waveformEl, setWaveformEl] = useState<HTMLDivElement | null>(null)
  const [timelineEl, setTimelineEl] = useState<HTMLDivElement | null>(null)
  const segmentsRef = useRef<Segment[]>([])
  segmentsRef.current = segments
  const loadToken = useRef(0)
  const restoredRef = useRef(false)

  const duration = loaded?.duration ?? 0
  const media = loaded?.media ?? null

  const wf = useWaveform({
    waveformEl,
    timelineEl,
    media,
    peaks: loaded?.peaks ?? null,
    duration,
    segments,
    pendingStart,
    activeId,
    onSelect: setActiveId,
    onCreate: useCallback((seg: Segment) => setSegments((p) => [...p, seg]), []),
    onChange: useCallback(
      (id: string, start: number, end: number) =>
        setSegments((p) => p.map((s) => (s.id === id ? { ...s, start, end } : s))),
      [],
    ),
  })

  // ---- loading a file ----
  const loadFile = useCallback(async (file: File) => {
    const token = ++loadToken.current
    const stale = () => token !== loadToken.current
    // Tear down the previous file.
    setLoaded((prev) => {
      if (prev) {
        prev.media.pause()
        prev.media.removeAttribute('src')
        URL.revokeObjectURL(prev.url)
      }
      return null
    })
    setSegments([])
    setPendingStart(null)
    setActiveId(null)
    setExportOpen(false)
    toast.dismiss()
    restoredRef.current = false
    void unmountFile()

    let url = ''
    try {
      setPhase({ kind: 'loading', fileName: file.name, label: 'Fingerprinting file…', progress: null })
      const fingerprint = await fingerprintFile(file)
      if (stale()) return

      setPhase({ kind: 'loading', fileName: file.name, label: 'Reading audio metadata…', progress: null })
      url = URL.createObjectURL(file)
      const media = await readMetadata(url)
      if (stale()) return URL.revokeObjectURL(url)
      const mediaDuration = Number.isFinite(media.duration) ? media.duration : 0

      let peaks = await getPeaks(fingerprint)
      if (stale()) return URL.revokeObjectURL(url)
      if (!peaks) {
        setPhase({ kind: 'loading', fileName: file.name, label: 'Loading ffmpeg…', progress: null })
        peaks = await generatePeaks(file, mediaDuration, (r) => {
          if (!stale()) setPhase({ kind: 'loading', fileName: file.name, label: 'Analysing audio…', progress: r })
        })
        if (stale()) return URL.revokeObjectURL(url)
        void putPeaks(fingerprint, peaks)
      }
      const duration = mediaDuration > 0 ? mediaDuration : peaks.length / PEAKS_PER_SEC

      const saved = loadSession(fingerprint)
      const restored = saved ? saved.segments.filter((s) => s.start < duration).map((s) => ({ ...s, end: Math.min(s.end, duration) })) : []
      restoredRef.current = true
      setSegments(restored)
      setLoaded({ file, fingerprint, media, url, duration, peaks })
      setPhase({ kind: 'ready' })
      if (restored.length > 0) toast.success(`Restored ${restored.length} segment${restored.length === 1 ? '' : 's'}`)
    } catch (e) {
      if (url) URL.revokeObjectURL(url)
      if (stale()) return
      setPhase({ kind: 'idle' })
      toast.error('Could not load file', { description: e instanceof Error ? e.message : String(e) })
    }
  }, [])

  // ---- apply rate / volume ----
  useEffect(() => {
    if (media) media.playbackRate = rate
  }, [media, rate])
  useEffect(() => {
    if (media) media.volume = volume
  }, [media, volume])
  useEffect(() => {
    if (media) media.muted = muted
  }, [media, muted])

  // ---- autosave (debounced) ----
  useEffect(() => {
    if (!loaded || !restoredRef.current) return
    const t = setTimeout(() => {
      if (segments.length === 0 && !loadSession(loaded.fingerprint)) return
      saveSession(loaded.fingerprint, {
        fileName: loaded.file.name,
        size: loaded.file.size,
        duration: loaded.duration,
        updatedAt: Date.now(),
        segments,
      })
    }, 300)
    return () => clearTimeout(t)
  }, [segments, loaded])

  // Refresh the recent list when returning to the start screen.
  useEffect(() => {
    if (phase.kind === 'idle') setSessions(listSessions())
  }, [phase.kind])

  // ---- segment actions ----
  const markStart = useCallback(() => {
    if (!loaded) return
    setPendingStart(wf.getTime())
  }, [loaded, wf])
  const markEnd = useCallback(() => {
    if (!loaded) return
    if (pendingStart === null) {
      toast.warning('Set a start first', { description: 'Press [ or "Mark start".' })
      return
    }
    const end = wf.getTime()
    if (end - pendingStart < 0.05) {
      toast.error('End must be after the start', {
        description: `Start is at ${formatTime(pendingStart)}. Move the playhead later and try again.`,
      })
      return
    }
    const seg: Segment = { id: crypto.randomUUID(), start: pendingStart, end: clamp(end, 0, duration), name: '' }
    setSegments((p) => [...p, seg])
    setActiveId(seg.id)
    setPendingStart(null)
  }, [loaded, pendingStart, wf, duration])

  const deleteSegment = useCallback((id: string) => {
    const seg = segmentsRef.current.find((s) => s.id === id)
    if (!seg) return
    const index = segmentOrder(segmentsRef.current).get(id) ?? 0
    setSegments((p) => p.filter((s) => s.id !== id))
    setActiveId((a) => (a === id ? null : a))
    toast(`Segment ${index + 1} deleted`, {
      description: `${formatTime(seg.start)} – ${formatTime(seg.end)}`,
      duration: 10000,
      action: {
        label: 'Undo',
        onAction: () => {
          setSegments((p) => (p.some((s) => s.id === seg.id) ? p : [...p, seg]))
          setActiveId(seg.id)
        },
      },
    })
  }, [])

  // ---- keyboard shortcuts ----
  useEffect(() => {
    if (!loaded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
      if (isTypingTarget(e.target) || exportOpen) return
      // Space on a focused button would double-trigger; leave native button/slider behaviour alone.
      const el = e.target as HTMLElement | null
      const interactive = el?.closest('button, [role="slider"], a, summary') != null
      switch (e.key) {
        case ' ':
          if (interactive) return
          e.preventDefault()
          wf.togglePlay()
          break
        case 'ArrowLeft':
        case 'ArrowRight': {
          if (el?.closest('[role="slider"]')) return
          e.preventDefault()
          wf.seekBy((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 30 : 5))
          break
        }
        case '[':
          e.preventDefault()
          markStart()
          break
        case ']':
          e.preventDefault()
          markEnd()
          break
        case 'Delete':
        case 'Backspace':
          if (!activeId || ownsEditingKeys(e.target)) return
          e.preventDefault()
          deleteSegment(activeId)
          break
        case 'Escape':
          if (ownsEditingKeys(e.target) || (!activeId && pendingStart === null)) return
          e.preventDefault()
          setActiveId(null)
          setPendingStart(null)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [loaded, exportOpen, wf, markStart, markEnd, deleteSegment, activeId, pendingStart])

  const updateSegment = useCallback(
    (id: string, start: number, end: number) => setSegments((p) => p.map((s) => (s.id === id ? { ...s, start, end } : s))),
    [],
  )
  const renameSegment = useCallback(
    (id: string, name: string) => setSegments((p) => p.map((s) => (s.id === id ? { ...s, name } : s))),
    [],
  )

  const closeFile = () => {
    ++loadToken.current
    setLoaded((prev) => {
      if (prev) {
        prev.media.pause()
        prev.media.removeAttribute('src')
        URL.revokeObjectURL(prev.url)
      }
      return null
    })
    setSegments([])
    setPendingStart(null)
    setActiveId(null)
    setExportOpen(false)
    toast.dismiss()
    setPhase({ kind: 'idle' })
    void unmountFile()
  }

  const deleteRecent = (fp: string) => {
    deleteSession(fp)
    void deletePeaks(fp)
    setSessions(listSessions())
  }

  const ready = phase.kind === 'ready' && loaded
  const baseName = useMemo(() => (loaded ? splitExt(loaded.file.name).base : ''), [loaded])
  const rejectFile = () => toast.error('That file type is not supported')
  return (
    <div className="app">
      <header className="app-header">
        <div className="container app-header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <ScissorsIcon />
            </span>
            <span className="brand-name">Audio Splitter</span>
          </div>
          {ready && (
            <div className="file-info">
              <span className="file-name truncate" title={loaded.file.name}>{loaded.file.name}</span>
              <Badge variant="secondary" className="mono">{formatTime(duration, false)}</Badge>
            </div>
          )}
          <div className="header-actions">
            {(ready || phase.kind === 'loading') && <FileLoader compact onFile={loadFile} onReject={rejectFile} />}
            {ready && (
              <Button data-variant="ghost" onClick={closeFile}>
                Close
              </Button>
            )}
            {ready && (
              <Tip label="Add at least one segment" disabled={segments.length > 0}>
                <Button
                  disabled={segments.length === 0}
                  focusableWhenDisabled
                  onClick={() => setExportOpen(true)}
                >
                  <DownloadIcon aria-hidden="true" /> Finish &amp; export <Badge>{segments.length}</Badge>
                </Button>
              </Tip>
            )}
          </div>
        </div>
      </header>

      <main className="container app-main">
        {phase.kind === 'idle' && (
          <div className="start">
            <FileLoader onFile={loadFile} onReject={rejectFile} />
            <RecentSessions sessions={sessions} onDelete={deleteRecent} />
          </div>
        )}

        {phase.kind === 'loading' && (
          <div className="start">
            <Card role="status" aria-live="polite">
              <CardHeader stacked>
                <CardTitle className="truncate" title={phase.fileName}>{phase.fileName}</CardTitle>
                <CardDescription>
                  The first time a file is opened its waveform is computed locally (a 2 hour file takes a minute or
                  two). It is cached for next time.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="loading-body">
                  <Progress
                    aria-label="Analysing audio"
                    value={phase.progress === null ? null : Math.round(phase.progress * 100)}
                  >
                    <ProgressValue />
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                  <p className="muted">{phase.label}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Waveform stays mounted while a file is loaded so its container elements are stable. */}
        <div className="editor" hidden={!ready}>
          <Waveform setWaveformEl={setWaveformEl} setTimelineEl={setTimelineEl} />
          {ready && (
            <>
              <Transport
                currentTime={wf.currentTime}
                duration={duration}
                playing={wf.playing}
                zoom={wf.zoom}
                rate={rate}
                volume={volume}
                muted={muted}
                pendingStart={pendingStart}
                onTogglePlay={wf.togglePlay}
                onSeekBy={wf.seekBy}
                onZoom={wf.setZoom}
                onRate={setRate}
                onVolume={(v) => {
                  setVolume(v)
                  if (v > 0) setMuted(false)
                }}
                onToggleMute={() => {
                  if (muted && volume === 0) setVolume(0.5)
                  setMuted((m) => !m)
                }}
                onMarkStart={markStart}
                onMarkEnd={markEnd}
                onCancelPending={() => setPendingStart(null)}
              />
              <SegmentList
                segments={segments}
                duration={duration}
                baseName={baseName}
                activeId={activeId}
                onSelect={setActiveId}
                onUpdate={updateSegment}
                onRename={renameSegment}
                onDelete={deleteSegment}
                onPlay={(id) => {
                  setActiveId(id)
                  wf.playSegment(id)
                }}
                onJump={wf.seek}
              />
            </>
          )}
        </div>
      </main>

      {ready && (
        <ExportDialog
          open={exportOpen}
          onOpenChange={setExportOpen}
          file={loaded.file}
          segments={segments}
          onRename={renameSegment}
        />
      )}

      <ToastRegion side="bottom" align="end">
        {(t) => (
          <Toast>
            <ToastIcon type={t.type} />
            <div className="toast-body">
              <ToastTitle />
              <ToastDescription />
            </div>
            <ToastAction data-variant="outline" data-size="sm" />
          </Toast>
        )}
      </ToastRegion>
    </div>
  )
}
