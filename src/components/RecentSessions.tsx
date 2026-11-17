import { ChevronRightIcon, FolderOpenIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { Button } from '@ui-sdk/react/button'
import { useEffect, useState } from 'react'
import { type SessionListItem, listHandleKeys } from '../lib/storage'
import { formatRelative, formatTime } from '../lib/time'
import { Card, CardDescription, CardHeader, CardTitle, Tip } from './ui'

interface Props {
  sessions: SessionListItem[]
  onOpen: (session: SessionListItem) => void
  onDelete: (fingerprint: string) => void
  /** Fingerprint of the row currently being opened (spinner); the whole list is disabled while set. */
  openingFingerprint: string | null
  /** Session the user was asked to pick a file for. */
  expectedFingerprint: string | null
}

export function RecentSessions({ sessions, onOpen, onDelete, openingFingerprint, expectedFingerprint }: Props) {
  const [withHandle, setWithHandle] = useState<Set<string>>(new Set())
  useEffect(() => {
    let live = true
    void listHandleKeys().then((keys) => live && setWithHandle(keys))
    return () => {
      live = false
    }
  }, [])

  if (sessions.length === 0) return null
  const busy = openingFingerprint !== null
  return (
    <Card flush aria-labelledby="recent-h">
      <CardHeader bordered stacked>
        <CardTitle id="recent-h">Recent sessions</CardTitle>
        <CardDescription>
          Your segments are saved in this browser. Click a session to resume it: in Chromium browsers it reopens
          the file directly, in other browsers you will be asked to pick the same audio file again. Files are never
          uploaded or stored.
        </CardDescription>
      </CardHeader>
      <ul className="recent-list">
        {sessions.map((s) => {
          const opening = openingFingerprint === s.fingerprint
          const direct = withHandle.has(s.fingerprint)
          return (
            <li key={s.fingerprint} className="recent-item" data-expected={expectedFingerprint === s.fingerprint ? '' : undefined}>
              <button
                type="button"
                className="recent-open"
                disabled={busy}
                aria-busy={opening || undefined}
                aria-label={`${direct ? 'Open' : 'Pick file to resume'} ${s.fileName}`}
                onClick={() => onOpen(s)}
              >
                <span className="recent-main">
                  <span className="recent-name truncate" title={s.fileName}>{s.fileName}</span>
                  <span className="muted truncate">
                    {s.segments.length} segment{s.segments.length === 1 ? '' : 's'}
                    {s.duration > 0 && <> · {formatTime(s.duration, false)}</>}
                    {' · '}
                    {formatRelative(s.updatedAt)}
                  </span>
                </span>
                <span className="recent-hint" aria-hidden="true">
                  {opening ? (
                    <Loader2Icon className="spin" />
                  ) : direct ? (
                    <>
                      Open <ChevronRightIcon />
                    </>
                  ) : (
                    <>
                      Pick file… <FolderOpenIcon />
                    </>
                  )}
                </span>
              </button>
              <Tip label="Delete session">
                <Button
                  data-variant="ghost-destructive"
                  data-size="icon"
                  aria-label={`Delete session for ${s.fileName}`}
                  disabled={busy}
                  focusableWhenDisabled
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(s.fingerprint)
                  }}
                >
                  <Trash2Icon aria-hidden="true" />
                </Button>
              </Tip>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
