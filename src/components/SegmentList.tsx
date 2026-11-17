import { Button } from '@ui-sdk/react/button'
import { Input } from '@ui-sdk/react/input'
import { AlertTriangleIcon, CrosshairIcon, PlayIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { segmentColor, sortSegments } from '../lib/colors'
import { defaultSegmentName, validateName } from '../lib/names'
import type { Segment } from '../lib/storage'
import { clamp, formatTime, parseTime, validateRange } from '../lib/time'
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
  /** Returns an error message for a candidate value, or null if it is acceptable. */
  validate: (v: number) => string | null
  onCommit: (v: number) => void
}) {
  const [draft, setDraft] = useState(formatTime(value))
  useEffect(() => setDraft(formatTime(value)), [value])

  const parsed = parseTime(draft)
  const dirty = draft !== formatTime(value)
  const error = !dirty ? null : parsed === null ? 'Use HH:MM:SS.mmm' : validate(parsed)

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
        className="mono"
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
        <CardTitle>Segments</CardTitle>
        <Badge variant="secondary">{sorted.length}</Badge>
        {overlaps.size > 0 && (
          <Badge variant="warning" title="Some segments overlap; exports will contain the shared audio twice">
            <AlertTriangleIcon aria-hidden="true" /> {overlaps.size} overlapping
          </Badge>
        )}
      </CardHeader>

      {sorted.length === 0 ? (
        <div className="seg-empty">
          <p>No segments yet.</p>
          <p className="muted">
            Drag on the waveform, or press <kbd>[</kbd> to set a start and <kbd>]</kbd> to set an end at the playhead.
          </p>
        </div>
      ) : (
        <>
          <div className="seg-head" aria-hidden="true">
            <span style={{ gridArea: 'idx' }}>#</span>
            <span style={{ gridArea: 'name' }}>Name</span>
            <span style={{ gridArea: 'start' }}>Start</span>
            <span style={{ gridArea: 'end' }}>End</span>
            <span style={{ gridArea: 'len' }}>Length</span>
          </div>
          <ol className="seg-list">
            {sorted.map((s, i) => {
              const active = s.id === activeId
              const nameError = s.name ? validateName(s.name) : null
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
                      aria-label={`Name of segment ${i + 1}`}
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
                      label={`Segment ${i + 1} start`}
                      value={s.start}
                      validate={(v) => validateRange(clamp(v, 0, duration), s.end, duration)}
                      onCommit={(v) => onUpdate(s.id, clamp(v, 0, duration), s.end)}
                    />
                  </div>
                  <div style={{ gridArea: 'end' }} className="seg-cell">
                    <TimeField
                      label={`Segment ${i + 1} end`}
                      value={s.end}
                      validate={(v) => validateRange(s.start, clamp(v, 0, duration), duration)}
                      onCommit={(v) => onUpdate(s.id, s.start, clamp(v, 0, duration))}
                    />
                  </div>
                  <span style={{ gridArea: 'len' }} className="seg-len mono muted">
                    {formatTime(s.end - s.start)}
                    {overlaps.has(s.id) && (
                      <Tip label="Overlaps another segment">
                        <span className="seg-overlap" tabIndex={0} role="img" aria-label="Overlaps another segment">
                          <AlertTriangleIcon aria-hidden="true" />
                        </span>
                      </Tip>
                    )}
                  </span>
                  <span style={{ gridArea: 'act' }} className="seg-actions">
                    <Tip label="Play segment">
                      <Button data-variant="ghost" data-size="icon" aria-label={`Play segment ${i + 1}`} onClick={() => onPlay(s.id)}>
                        <PlayIcon aria-hidden="true" />
                      </Button>
                    </Tip>
                    <Tip label="Jump to start">
                      <Button data-variant="ghost" data-size="icon" aria-label={`Jump to start of segment ${i + 1}`} onClick={() => onJump(s.start)}>
                        <CrosshairIcon aria-hidden="true" />
                      </Button>
                    </Tip>
                    <Tip label="Delete segment (Del)">
                      <Button data-variant="ghost-destructive" data-size="icon" aria-label={`Delete segment ${i + 1}`} onClick={() => onDelete(s.id)}>
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
