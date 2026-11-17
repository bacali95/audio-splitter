import { Button } from '@ui-sdk/react/button'
import { Checkbox, CheckboxIndicator } from '@ui-sdk/react/checkbox'
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@ui-sdk/react/dialog'
import { Input, InputGroup } from '@ui-sdk/react/input'
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from '@ui-sdk/react/progress'
import { toast } from '@ui-sdk/react/toast'
import { CheckIcon, CircleAlertIcon, CircleCheckIcon, Loader2Icon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { segmentColor, sortSegments } from '../lib/colors'
import { canReencode, extractSegment, getAvailableEncoders, reencodeKind } from '../lib/ffmpeg'
import { defaultSegmentName, splitExt, validateNames } from '../lib/names'
import { ZipBuilder, downloadBlob, pickDirectory, supportsDirectoryPicker, writeToDirectory } from '../lib/output'
import type { Segment } from '../lib/storage'
import { formatTime } from '../lib/time'
import { Swatch, Tip } from './ui'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  file: File
  segments: Segment[]
  onRename: (id: string, name: string) => void
}

export function ExportDialog({ open, onOpenChange, file, segments, onRename }: Props) {
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} dismissible={!busy} onOpenChange={(o) => onOpenChange(o)}>
      <DialogBackdrop />
      <DialogContent className="export-dialog">
        <ExportForm file={file} segments={segments} onRename={onRename} onBusy={setBusy} />
      </DialogContent>
    </Dialog>
  )
}

type Result = { kind: 'dir'; folder: string; count: number } | { kind: 'zip'; count: number }

function ExportForm({
  file,
  segments,
  onRename,
  onBusy,
}: {
  file: File
  segments: Segment[]
  onRename: (id: string, name: string) => void
  onBusy: (b: boolean) => void
}) {
  const { base, ext } = useMemo(() => splitExt(file.name), [file.name])
  const sorted = useMemo(() => sortSegments(segments), [segments])
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(sorted.map((s, i) => [s.id, s.name || defaultSegmentName(base, i)])),
  )
  const [reencode, setReencode] = useState(false)
  const [encoders, setEncoders] = useState<Set<string> | null>(null)
  const [encoderErr, setEncoderErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const [overall, setOverall] = useState(0)
  const [current, setCurrent] = useState<{ index: number; ratio: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [failedIndex, setFailedIndex] = useState<number | null>(null)
  const [doneCount, setDoneCount] = useState(0)
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    onBusy(busy)
    return () => onBusy(false)
  }, [busy, onBusy])

  // Persist the default names right away so they survive a reload "as shown".
  useEffect(() => {
    for (const s of sorted) if (!s.name) onRename(s.id, names[s.id])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Which re-encoders does this ffmpeg core actually have? (loads ffmpeg lazily)
  useEffect(() => {
    let cancelled = false
    getAvailableEncoders()
      .then((e) => !cancelled && setEncoders(e))
      .catch(() => !cancelled && setEncoderErr(true))
    return () => {
      cancelled = true
    }
  }, [])

  const kind = reencodeKind(ext)
  const reencodeSupported = !!encoders && canReencode(ext, encoders)
  const reencodeNote =
    kind === 'pcm'
      ? 'WAV is PCM: stream copy is already sample-accurate.'
      : !kind
        ? `Re-encoding is not available for "${ext}" files.`
        : encoderErr
          ? 'Could not check encoder availability.'
          : !encoders
            ? 'Checking encoders…'
            : !reencodeSupported
              ? 'The encoder for this format is missing in this ffmpeg build.'
              : null

  const orderedNames = sorted.map((s) => names[s.id] ?? '')
  const errors = validateNames(orderedNames)
  const hasErrors = errors.some(Boolean)
  const canPickDir = supportsDirectoryPicker()
  const plural = sorted.length === 1 ? '' : 's'

  const start = async () => {
    if (hasErrors || busy) return
    setError(null)
    setFailedIndex(null)
    setDoneCount(0)
    setOverall(0)
    // Folder picker needs the click's user activation, so ask before any async work.
    let dir = null
    try {
      if (canPickDir) {
        dir = await pickDirectory()
        if (!dir) return // cancelled
      }
    } catch (e) {
      setError(`Could not open folder: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    setBusy(true)
    const zip = dir ? null : new ZipBuilder()
    let at = -1
    try {
      for (let i = 0; i < sorted.length; i++) {
        at = i
        const s = sorted[i]
        const fileName = orderedNames[i].trim() + ext
        setCurrent({ index: i, ratio: 0 })
        const data = await extractSegment(file, s.start, s.end, ext, reencode && reencodeSupported, (r) => {
          setCurrent({ index: i, ratio: r })
          setOverall((i + r) / sorted.length)
        })
        if (dir) await writeToDirectory(dir, fileName, data)
        else zip!.add(fileName, data)
        setDoneCount(i + 1)
        setOverall((i + 1) / sorted.length)
      }
      at = -1
      if (zip) downloadBlob(await zip.finish(), `${splitExt(file.name).base}_segments.zip`)
      setResult(dir ? { kind: 'dir', folder: dir.name || 'the chosen folder', count: sorted.length } : { kind: 'zip', count: sorted.length })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      if (at >= 0) setFailedIndex(at)
      toast.error('Export failed', { description: msg })
    } finally {
      setBusy(false)
      setCurrent(null)
    }
  }

  const header = (title: string, description: ReactNode) => (
    <div className="dialog-header">
      <div data-slot="stack" className="dialog-heading">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </div>
      <DialogClose data-variant="ghost" data-size="icon" aria-label="Close" disabled={busy}>
        <XIcon aria-hidden="true" />
      </DialogClose>
    </div>
  )

  if (result) {
    return (
      <>
        {header('Export complete', 'Your segments are ready.')}
        <div className="export-success" role="status">
          <CircleCheckIcon aria-hidden="true" />
          <div>
            <p className="export-success-title">
              {result.kind === 'dir'
                ? `Exported ${result.count} file${result.count === 1 ? '' : 's'} to ${result.folder}`
                : 'ZIP downloaded'}
            </p>
            <p className="muted">
              {result.kind === 'dir'
                ? 'The files were written straight into the folder you chose.'
                : `${result.count} file${result.count === 1 ? '' : 's'} bundled into ${splitExt(file.name).base}_segments.zip.`}
            </p>
          </div>
        </div>
        <div className="dialog-footer">
          <DialogClose>Done</DialogClose>
        </div>
      </>
    )
  }

  return (
    <>
      {header(
        `Export ${sorted.length} segment${plural}`,
        <>
          Name each file. The extension <code>{ext || '(none)'}</code> is kept from the original.
          {canPickDir ? ' You will be asked for a destination folder.' : ' Files are bundled into a ZIP download.'}
        </>,
      )}

      <ul className="export-list">
        {sorted.map((s, i) => (
          <li key={s.id} className="export-row">
            <span className="seg-idx">
              <Swatch color={segmentColor(i)} />
              <span className="mono">{i + 1}</span>
            </span>
            <span className="export-range mono muted">
              {formatTime(s.start)} – {formatTime(s.end)}
            </span>
            <div className="export-name">
              <InputGroup data-disabled={busy ? '' : undefined}>
                <Input
                  aria-label={`File name for segment ${i + 1}`}
                  aria-invalid={errors[i] ? true : undefined}
                  value={names[s.id] ?? ''}
                  disabled={busy}
                  spellCheck={false}
                  onValueChange={(v) => {
                    setNames((n) => ({ ...n, [s.id]: v }))
                    onRename(s.id, v)
                  }}
                />
                {ext && <span className="input-addon">{ext}</span>}
              </InputGroup>
              {errors[i] && <span className="field-error" role="alert">{errors[i]}</span>}
            </div>
            <span className="export-status mono">
              {busy && current?.index === i ? (
                <>
                  <Loader2Icon className="spin" aria-hidden="true" />
                  <span>{Math.round(current.ratio * 100)}%</span>
                </>
              ) : i < doneCount ? (
                <CheckIcon className="status-ok" aria-label="Done" />
              ) : failedIndex === i ? (
                <Tip label={error ?? 'Failed'}>
                  <span className="status-error" tabIndex={0} role="img" aria-label={`Failed: ${error ?? 'unknown error'}`}>
                    <CircleAlertIcon aria-hidden="true" />
                  </span>
                </Tip>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <label data-slot="label" className="reencode">
        <Checkbox
          checked={reencode && reencodeSupported}
          disabled={!reencodeSupported || busy}
          onCheckedChange={(c) => setReencode(c === true)}
        >
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        <span>
          Re-encode for sample-accurate cuts
          <span className="muted block">
            {reencodeNote ?? 'Slower and lossy. Stream copy (default) is lossless and cuts on audio-frame boundaries (~20–30 ms).'}
          </span>
        </span>
      </label>

      {busy && (
        <Progress value={Math.round(overall * 100)}>
          <ProgressLabel>Exporting {Math.min(doneCount + 1, sorted.length)} of {sorted.length}</ProgressLabel>
          <ProgressValue />
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="dialog-footer">
        <DialogClose data-variant="outline" disabled={busy}>Cancel</DialogClose>
        <Button disabled={hasErrors || busy || sorted.length === 0} onClick={start}>
          {busy ? 'Exporting…' : canPickDir ? 'Choose folder & export' : 'Download ZIP'}
        </Button>
      </div>
    </>
  )
}
