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
import { useTranslation } from 'react-i18next'
import { ExportDialog } from './components/ExportDialog'
import { ACCEPT, FileLoader } from './components/FileLoader'
import { RecentSessions } from './components/RecentSessions'
import { SegmentList } from './components/SegmentList'
import { Transport } from './components/Transport'
import { LanguageSwitcher } from './components/LanguageSwitcher'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Tip } from './components/ui'
import { Waveform } from './components/Waveform'
import i18n from './i18n'
import { describeError } from './i18n/describeError'
import { useWaveform } from './hooks/useWaveform'
import { AppError } from './lib/errors'
import { fingerprintFile } from './lib/fingerprint'
import { canPickFile, openHandle, pickAudioFile } from './lib/fsAccess'
import { PEAKS_PER_SEC, generatePeaks, unmountFile } from './lib/ffmpeg'
import {
  type Segment,
  type SessionListItem,
  deleteHandle,
  deletePeaks,
  deleteSession,
  getHandle,
  getPeaks,
  listSessions,
  loadSession,
  putHandle,
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

type LoadStage = 'fingerprint' | 'metadata' | 'ffmpeg' | 'analysing'

type Phase =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string; stage: LoadStage; progress: number | null }
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
    a.onerror = () => reject(new AppError('unplayable'))
    a.src = url
  })
}

export default function App() {
  const { t, i18n: i18nInstance } = useTranslation()
  const locale = i18nInstance.language
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
  const [openingFp, setOpeningFp] = useState<string | null>(null)
  const [expectedFp, setExpectedFp] = useState<string | null>(null)
  const pickInputRef = useRef<HTMLInputElement>(null)
  const expectedRef = useRef<SessionListItem | null>(null)

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
  const loadFile = useCallback(async (file: File, handle?: FileSystemFileHandle, expected?: { fingerprint: string; fileName: string }) => {
    setOpeningFp(null)
    setExpectedFp(null)
    pendingSave.current?.()
    pendingSave.current = null
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
      setPhase({ kind: 'loading', fileName: file.name, stage: 'fingerprint', progress: null })
      const fingerprint = await fingerprintFile(file)
      if (stale()) return
      if (handle) void putHandle(fingerprint, handle)

      setPhase({ kind: 'loading', fileName: file.name, stage: 'metadata', progress: null })
      url = URL.createObjectURL(file)
      const media = await readMetadata(url)
      if (stale()) return URL.revokeObjectURL(url)
      const mediaDuration = Number.isFinite(media.duration) ? media.duration : 0

      let peaks = await getPeaks(fingerprint)
      if (stale()) return URL.revokeObjectURL(url)
      if (!peaks) {
        setPhase({ kind: 'loading', fileName: file.name, stage: 'ffmpeg', progress: null })
        peaks = await generatePeaks(file, mediaDuration, (r) => {
          if (!stale()) setPhase({ kind: 'loading', fileName: file.name, stage: 'analysing', progress: r })
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
      if (restored.length > 0) toast.success(i18n.t('toast.restored', { count: restored.length }))
      if (expected && expected.fingerprint !== fingerprint) {
        toast.warning(i18n.t('toast.differentFile', { expected: expected.fileName }), {
          description: i18n.t('toast.differentFileDescription', { name: file.name }),
        })
      }
    } catch (e) {
      if (url) URL.revokeObjectURL(url)
      if (stale()) return
      setPhase({ kind: 'idle' })
      toast.error(i18n.t('toast.loadFailed'), { description: describeError(e) })
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

  // ---- autosave (debounced, flushed on close / file switch / page hide) ----
  const pendingSave = useRef<(() => void) | null>(null)
  const flushSave = useCallback(() => {
    const save = pendingSave.current
    pendingSave.current = null
    save?.()
  }, [])
  useEffect(() => {
    if (!loaded || !restoredRef.current) return
    const save = () => {
      if (segments.length === 0 && !loadSession(loaded.fingerprint)) return
      saveSession(loaded.fingerprint, {
        fileName: loaded.file.name,
        size: loaded.file.size,
        duration: loaded.duration,
        updatedAt: Date.now(),
        segments,
      })
    }
    pendingSave.current = save
    const t = setTimeout(flushSave, 300)
    return () => clearTimeout(t)
  }, [segments, loaded, flushSave])
  useEffect(() => {
    const onHide = () => flushSave()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flushSave])

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
      toast.warning(i18n.t('toast.startFirst'), { description: i18n.t('toast.startFirstDescription') })
      return
    }
    const end = wf.getTime()
    if (end - pendingStart < 0.05) {
      toast.error(i18n.t('toast.endAfterStart'), {
        description: i18n.t('toast.endAfterStartDescription', { time: formatTime(pendingStart) }),
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
    toast(i18n.t('toast.segmentDeleted', { n: index + 1 }), {
      description: `${formatTime(seg.start)} – ${formatTime(seg.end)}`,
      duration: 10000,
      action: {
        label: i18n.t('toast.undo'),
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
    flushSave()
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
    void deleteHandle(fp)
    setSessions(listSessions())
  }

  // ---- reopening a recent session ----
  useEffect(() => {
    const el = pickInputRef.current
    if (!el) return
    const onCancel = () => {
      expectedRef.current = null
      setExpectedFp(null)
    }
    el.addEventListener('cancel', onCancel)
    return () => el.removeEventListener('cancel', onCancel)
  }, [])

  const pickForSession = useCallback(
    async (s: SessionListItem) => {
      toast.info(i18n.t('toast.pickToResume', { name: s.fileName }))
      if (canPickFile()) {
        setExpectedFp(s.fingerprint)
        try {
          const picked = await pickAudioFile(i18n.t('filePicker.description'))
          if (picked) void loadFile(picked.file, picked.handle, s)
          else {
            setExpectedFp(null)
            toast.dismiss()
          }
        } catch (e) {
          // The picker needs a fresh user gesture; if the earlier permission prompt used it up, ask for a click.
          setExpectedFp(null)
          toast.dismiss()
          toast.info(i18n.t('toast.pickToResume', { name: s.fileName }), {
            description: e instanceof Error ? describeError(e) : undefined,
            duration: 10000,
            action: { label: i18n.t('toast.pickFile'), onAction: () => void pickForSession(s) },
          })
        }
        return
      }
      expectedRef.current = s
      setExpectedFp(s.fingerprint)
      pickInputRef.current?.click()
    },
    [loadFile],
  )

  const openSession = async (s: SessionListItem) => {
    if (openingFp) return
    setOpeningFp(s.fingerprint)
    try {
      // Keep this chain tight: requestPermission needs the click's transient user activation.
      const handle = await getHandle(s.fingerprint)
      if (handle) {
        const res = await openHandle(handle)
        if (res.ok) return void loadFile(res.file, handle, s)
        if (res.reason === 'not-found') void deleteHandle(s.fingerprint)
        toast.info(i18n.t('toast.cantAccess', { name: s.fileName }))
      }
      setOpeningFp(null)
      await pickForSession(s)
    } finally {
      setOpeningFp(null)
    }
  }

  const ready = phase.kind === 'ready' && loaded
  const baseName = useMemo(() => (loaded ? splitExt(loaded.file.name).base : ''), [loaded])
  const rejectFile = () => toast.error(i18n.t('toast.unsupportedType'))
  return (
    <div className="app">
      <header className="app-header">
        <div className="container app-header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <ScissorsIcon />
            </span>
            <span className="brand-name">{t('app.title')}</span>
          </div>
          {ready && (
            <div className="file-info">
              <span className="file-name truncate" title={loaded.file.name}>{loaded.file.name}</span>
              <Badge variant="secondary" className="mono" dir="ltr">{formatTime(duration, false)}</Badge>
            </div>
          )}
          <div className="header-actions">
            <LanguageSwitcher />
            {(ready || phase.kind === 'loading') && <FileLoader compact onFile={loadFile} onReject={rejectFile} />}
            {ready && (
              <Button data-variant="ghost" onClick={closeFile}>
                {t('header.close')}
              </Button>
            )}
            {ready && (
              <Tip label={t('header.exportHint')} disabled={segments.length > 0}>
                <Button
                  disabled={segments.length === 0}
                  focusableWhenDisabled
                  onClick={() => setExportOpen(true)}
                >
                  <DownloadIcon aria-hidden="true" /> {t('header.export')} <Badge>{segments.length}</Badge>
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
            <RecentSessions
              sessions={sessions}
              onOpen={(s) => void openSession(s)}
              onDelete={deleteRecent}
              openingFingerprint={openingFp}
              expectedFingerprint={expectedFp}
            />
          </div>
        )}

        {phase.kind === 'loading' && (
          <div className="start">
            <Card role="status" aria-live="polite">
              <CardHeader stacked>
                <CardTitle className="truncate" title={phase.fileName}>{phase.fileName}</CardTitle>
                <CardDescription>{t('loading.description')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="loading-body">
                  <Progress
                    aria-label={t('loading.analysing')}
                    locale={locale}
                    value={phase.progress === null ? null : Math.round(phase.progress * 100)}
                  >
                    <ProgressValue />
                    <ProgressTrack>
                      <ProgressIndicator />
                    </ProgressTrack>
                  </Progress>
                  <p className="muted">{t(`loading.stage.${phase.stage}`)}</p>
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

      <input
        ref={pickInputRef}
        type="file"
        hidden
        accept={ACCEPT.join(',')}
        onChange={(e) => {
          const file = e.target.files?.[0]
          const expected = expectedRef.current
          expectedRef.current = null
          e.target.value = ''
          if (file) void loadFile(file, undefined, expected ?? undefined)
          else setExpectedFp(null)
        }}
      />

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
