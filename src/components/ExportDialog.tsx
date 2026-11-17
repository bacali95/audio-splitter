import { Button } from '@ui-sdk/react/button'
import { Checkbox, CheckboxIndicator } from '@ui-sdk/react/checkbox'
import { Dialog, DialogBackdrop, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@ui-sdk/react/dialog'
import { Input, InputGroup } from '@ui-sdk/react/input'
import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from '@ui-sdk/react/progress'
import { toast } from '@ui-sdk/react/toast'
import { CheckIcon, CircleAlertIcon, CircleCheckIcon, Loader2Icon, XIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { describeError } from '../i18n/describeError'
import { formatPercent } from '../lib/format'
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

type Result = { kind: 'dir'; folder: string | null; count: number } | { kind: 'zip'; count: number }

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
  const { t, i18n } = useTranslation()
  const locale = i18n.language
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
      ? t('export.reencode.wav')
      : !kind
        ? t('export.reencode.unsupportedFormat', { ext })
        : encoderErr
          ? t('export.reencode.checkFailed')
          : !encoders
            ? t('export.reencode.checking')
            : !reencodeSupported
              ? t('export.reencode.missingEncoder')
              : null

  const orderedNames = sorted.map((s) => names[s.id] ?? '')
  const nameErrors = validateNames(orderedNames)
  const errors = nameErrors.map((c) => (c ? t(`errors.name.${c}`) : null))
  const hasErrors = nameErrors.some(Boolean)
  const canPickDir = supportsDirectoryPicker()

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
      setError(t('toast.folderFailed', { message: describeError(e) }))
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
      setResult(dir ? { kind: 'dir', folder: dir.name || null, count: sorted.length } : { kind: 'zip', count: sorted.length })
    } catch (e) {
      const msg = describeError(e)
      setError(msg)
      if (at >= 0) setFailedIndex(at)
      toast.error(t('toast.exportFailed'), { description: msg })
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
      <DialogClose data-variant="ghost" data-size="icon" aria-label={t('aria.close')} disabled={busy}>
        <XIcon aria-hidden="true" />
      </DialogClose>
    </div>
  )

  if (result) {
    return (
      <>
        {header(t('export.success.title'), t('export.success.description'))}
        <div className="export-success" role="status">
          <CircleCheckIcon aria-hidden="true" />
          <div>
            <p className="export-success-title">
              {result.kind === 'dir'
                ? t('export.success.folderTitle', { count: result.count, folder: result.folder ?? t('export.success.folderFallback') })
                : t('export.success.zipTitle')}
            </p>
            <p className="muted">
              {result.kind === 'dir'
                ? t('export.success.folderBody')
                : t('export.success.zipBody', { count: result.count, zip: `${splitExt(file.name).base}_segments.zip` })}
            </p>
          </div>
        </div>
        <div className="dialog-footer">
          <DialogClose>{t('export.done')}</DialogClose>
        </div>
      </>
    )
  }

  return (
    <>
      {header(
        t('export.dialog.title', { count: sorted.length }),
        <Trans
          i18nKey={canPickDir ? 'export.dialog.descriptionFolder' : 'export.dialog.descriptionZip'}
          values={{ ext: ext || t('export.dialog.noExtension') }}
          components={{ ext: <code dir="ltr" /> }}
        />,
      )}

      <ul className="export-list">
        {sorted.map((s, i) => (
          <li key={s.id} className="export-row">
            <span className="seg-idx">
              <Swatch color={segmentColor(i)} />
              <span className="mono">{i + 1}</span>
            </span>
            <span className="export-range mono muted" dir="ltr">
              {formatTime(s.start)} – {formatTime(s.end)}
            </span>
            <div className="export-name">
              <InputGroup data-disabled={busy ? '' : undefined}>
                <Input
                  dir="auto"
                  aria-label={t('aria.exportFileName', { n: i + 1 })}
                  aria-invalid={errors[i] ? true : undefined}
                  value={names[s.id] ?? ''}
                  disabled={busy}
                  spellCheck={false}
                  onValueChange={(v) => {
                    setNames((n) => ({ ...n, [s.id]: v }))
                    onRename(s.id, v)
                  }}
                />
                {ext && <span className="input-addon" dir="ltr">{ext}</span>}
              </InputGroup>
              {errors[i] && <span className="field-error" role="alert">{errors[i]}</span>}
            </div>
            <span className="export-status mono">
              {busy && current?.index === i ? (
                <>
                  <Loader2Icon className="spin" aria-hidden="true" />
                  <span dir="ltr">{formatPercent(current.ratio, locale)}</span>
                </>
              ) : i < doneCount ? (
                <CheckIcon className="status-ok" aria-label={t('export.done')} />
              ) : failedIndex === i ? (
                <Tip label={error ?? t('export.failed')}>
                  <span className="status-error" tabIndex={0} role="img" aria-label={t('export.failedWith', { error: error ?? t('export.unknownError') })}>
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
          {t('export.reencode.label')}
          <span className="muted block">
            {reencodeNote ?? t('export.reencode.default')}
          </span>
        </span>
      </label>

      {busy && (
        <Progress value={Math.round(overall * 100)} locale={locale}>
          <ProgressLabel>{t('export.progress', { current: Math.min(doneCount + 1, sorted.length), total: sorted.length })}</ProgressLabel>
          <ProgressValue />
          <ProgressTrack>
            <ProgressIndicator />
          </ProgressTrack>
        </Progress>
      )}
      {error && <p className="field-error" role="alert">{error}</p>}

      <div className="dialog-footer">
        <DialogClose data-variant="outline" disabled={busy}>{t('export.cancel')}</DialogClose>
        <Button disabled={hasErrors || busy || sorted.length === 0} onClick={start}>
          {busy ? t('export.exporting') : canPickDir ? t('export.chooseFolder') : t('export.downloadZip')}
        </Button>
      </div>
    </>
  )
}
