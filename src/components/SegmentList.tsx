import { Button } from '@ui-sdk/react/button'
import { Input } from '@ui-sdk/react/input'
import { AlertTriangleIcon, CrosshairIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { segmentColor, sortSegments } from '../lib/colors'
import { defaultSegmentName, validateName } from '../lib/names'
import type { Segment } from '../lib/storage'
import { clamp, formatTime, parseTime, validateRange, type RangeError } from '../lib/time'
import { Badge, Card, CardHeader, CardTitle, Swatch, Tip } from './ui'

interface Props {
  segments: Segment[]
  duration: number
  /** File name without extension, for the default-name placeholder. */
  baseName: string
  activeId: string | null
  onSelect: (id: string) => void
  onUpdate: (id: string, start: number, end: number) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onPlay: (id: string) => void
  onJump: (t: number) => void
}

function TimeField({
  value,
  label,
  validate,
  onCommit,
}: {
  value: number
  label: string
  /** Returns an error code for a candidate value, or null if it is acceptable. */
  validate: (v: number) => RangeError | null
  onCommit: (v: number) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(formatTime(value))
  useEffect(() => setDraft(formatTime(value)), [value])

  const parsed = parseTime(draft)
  const dirty = draft !== formatTime(value)
  const errorCode = !dirty ? null : parsed === null ? 'format' : validate(parsed)
  const error = errorCode === null ? null : errorCode === 'format' ? t('errors.timeFormat') : t(`errors.range.${errorCode}`)

  const revert = () => setDraft(formatTime(value))
  const commit = (): boolean => {
    if (!dirty) return true
    if (parsed === null || error) return false
    onCommit(parsed)
    return true
  }

  return (
    <>
      <Input
        className="mono ltr-field"
        dir="ltr"
        aria-label={label}
        aria-invalid={error ? true : undefined}
        title={error ?? undefined}
        value={draft}
        spellCheck={false}
        onValueChange={(v) => setDraft(v)}
        onBlur={() => {
          if (!commit()) revert()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (commit()) e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.stopPropagation()
            revert()
            e.currentTarget.blur()
          }
        }}
      />
      {error && <span className="sr-only" role="alert">{label}: {error}</span>}
    </>
  )
}

export function SegmentList({
  segments,
  duration,
  baseName,
  activeId,
  onSelect,
  onUpdate,
  onRename,
  onDelete,
  onPlay,
  onJump,
}: Props) {
  const { t } = useTranslation()
  const sorted = useMemo(() => sortSegments(segments), [segments])
  const overlaps = useMemo(() => {
    const set = new Set<string>()
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end; j++) {
        set.add(sorted[i].id)
        set.add(sorted[j].id)
      }
    }
    return set
  }, [sorted])

  const rows = useRef(new Map<string, HTMLLIElement>())
  useEffect(() => {
    if (activeId) rows.current.get(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  return (
    <Card flush>
      <CardHeader bordered>
        <CardTitle>{t('segments.title')}</CardTitle>
        <Badge variant="secondary">{sorted.length}</Badge>
        {overlaps.size > 0 && (
          <Badge variant="warning" title={t('segments.overlapWarning')}>
            <AlertTriangleIcon aria-hidden="true" /> {t('segments.overlapping', { count: overlaps.size })}
          </Badge>
        )}
      </CardHeader>

      {sorted.length === 0 ? (
        <div className="seg-empty">
          <p>{t('segments.empty.title')}</p>
          <p className="muted">
            <Trans
              i18nKey="segments.empty.hint"
              components={{ startKey: <kbd dir="ltr">[</kbd>, endKey: <kbd dir="ltr">]</kbd> }}
            />
          </p>
        </div>
      ) : (
        <>
          <div className="seg-head" aria-hidden="true">
            <span style={{ gridArea: 'idx' }}>{t('segments.columns.index')}</span>
            <span style={{ gridArea: 'name' }}>{t('segments.columns.name')}</span>
            <span style={{ gridArea: 'start' }}>{t('segments.columns.start')}</span>
            <span style={{ gridArea: 'end' }}>{t('segments.columns.end')}</span>
            <span style={{ gridArea: 'len' }}>{t('segments.columns.length')}</span>
          </div>
          <ol className="seg-list">
            {sorted.map((s, i) => {
              const active = s.id === activeId
              const nameCode = s.name ? validateName(s.name) : null
              const nameError = nameCode ? t(`errors.name.${nameCode}`) : null
              return (
                <li
                  key={s.id}
                  ref={(el) => {
                    if (el) rows.current.set(s.id, el)
                    else rows.current.delete(s.id)
                  }}
                  className="seg"
                  data-active={active ? '' : undefined}
                  style={{ '--seg-color': segmentColor(i) } as CSSProperties}
                  onClick={() => onSelect(s.id)}
                  onFocus={() => !active && onSelect(s.id)}
                >
                  <span className="seg-idx" style={{ gridArea: 'idx' }}>
                    <Swatch color={segmentColor(i)} />
                    <span className="mono">{i + 1}</span>
                  </span>
                  <div style={{ gridArea: 'name' }} className="seg-cell">
                    <Input
                      aria-label={t('aria.segmentName', { n: i + 1 })}
                      aria-invalid={nameError ? true : undefined}
                      title={nameError ?? undefined}
                      placeholder={defaultSegmentName(baseName, i)}
                      value={s.name}
                      spellCheck={false}
                      onValueChange={(v) => onRename(s.id, v)}
                    />
                  </div>
                  <div style={{ gridArea: 'start' }} className="seg-cell">
                    <TimeField
                      label={t('aria.segmentStart', { n: i + 1 })}
                      value={s.start}
                      validate={(v) => validateRange(clamp(v, 0, duration), s.end, duration)}
                      onCommit={(v) => onUpdate(s.id, clamp(v, 0, duration), s.end)}
                    />
                  </div>
                  <div style={{ gridArea: 'end' }} className="seg-cell">
                    <TimeField
                      label={t('aria.segmentEnd', { n: i + 1 })}
                      value={s.end}
                      validate={(v) => validateRange(s.start, clamp(v, 0, duration), duration)}
                      onCommit={(v) => onUpdate(s.id, s.start, clamp(v, 0, duration))}
                    />
                  </div>
                  <span style={{ gridArea: 'len' }} className="seg-len mono muted" dir="ltr">
                    {formatTime(s.end - s.start)}
                    {overlaps.has(s.id) && (
                      <Tip label={t('segments.overlapTip')}>
                        <span className="seg-overlap" tabIndex={0} role="img" aria-label={t('segments.overlapTip')}>
                          <AlertTriangleIcon aria-hidden="true" />
                        </span>
                      </Tip>
                    )}
                  </span>
                  <span style={{ gridArea: 'act' }} className="seg-actions">
                    <Tip label={t('segments.play')}>
                      <Button data-variant="ghost" data-size="icon" aria-label={t('aria.playSegment', { n: i + 1 })} onClick={() => onPlay(s.id)}>
                        <PlayIcon aria-hidden="true" />
                      </Button>
                    </Tip>
                    <Tip label={t('segments.jump')}>
                      <Button data-variant="ghost" data-size="icon" aria-label={t('aria.jumpToSegmentStart', { n: i + 1 })} onClick={() => onJump(s.start)}>
                        <CrosshairIcon aria-hidden="true" />
                      </Button>
                    </Tip>
                    <Tip label={t('segments.deleteTip', { key: t('shortcuts.keys.del') })}>
                      <Button data-variant="ghost-destructive" data-size="icon" aria-label={t('aria.deleteSegment', { n: i + 1 })} onClick={() => onDelete(s.id)}>
                        <Trash2Icon aria-hidden="true" />
                      </Button>
                    </Tip>
                  </span>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </Card>
  )
}
