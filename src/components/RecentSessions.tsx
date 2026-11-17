import { ChevronRightIcon, FolderOpenIcon, Loader2Icon, Trash2Icon } from 'lucide-react'
import { Button } from '@ui-sdk/react/button'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t, i18n } = useTranslation()
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
        <CardTitle id="recent-h">{t('recent.title')}</CardTitle>
        <CardDescription>{t('recent.description')}</CardDescription>
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
                aria-label={direct ? t('aria.openSession', { name: s.fileName }) : t('aria.pickSession', { name: s.fileName })}
                onClick={() => onOpen(s)}
              >
                <span className="recent-main">
                  <span className="recent-name truncate" title={s.fileName}>{s.fileName}</span>
                  <span className="muted truncate">
                    {t('recent.segments', { count: s.segments.length })}
                    {s.duration > 0 && (
                      <>
                        {' · '}
                        <bdi dir="ltr">{formatTime(s.duration, false)}</bdi>
                      </>
                    )}
                    {' · '}
                    {formatRelative(s.updatedAt, i18n.language) ?? t('recent.unknownDate')}
                  </span>
                </span>
                <span className="recent-hint" aria-hidden="true">
                  {opening ? (
                    <Loader2Icon className="spin" />
                  ) : direct ? (
                    <>
                      {t('recent.open')} <ChevronRightIcon className="flip-rtl" />
                    </>
                  ) : (
                    <>
                      {t('recent.pickFile')} <FolderOpenIcon />
                    </>
                  )}
                </span>
              </button>
              <Tip label={t('recent.delete')}>
                <Button
                  data-variant="ghost-destructive"
                  data-size="icon"
                  aria-label={t('aria.deleteSession', { name: s.fileName })}
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
