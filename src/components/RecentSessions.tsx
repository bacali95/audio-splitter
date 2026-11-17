import { Trash2Icon } from 'lucide-react'
import { Button } from '@ui-sdk/react/button'
import type { SessionListItem } from '../lib/storage'
import { formatRelative, formatTime } from '../lib/time'
import { Card, CardDescription, CardHeader, CardTitle, Tip } from './ui'

interface Props {
  sessions: SessionListItem[]
  onDelete: (fingerprint: string) => void
}

export function RecentSessions({ sessions, onDelete }: Props) {
  if (sessions.length === 0) return null
  return (
    <Card flush aria-labelledby="recent-h">
      <CardHeader bordered stacked>
        <CardTitle id="recent-h">Recent sessions</CardTitle>
        <CardDescription>
          Your segments are saved in this browser. To resume one, pick the same audio file again; files are never
          uploaded or stored.
        </CardDescription>
      </CardHeader>
      <ul className="recent-list">
        {sessions.map((s) => (
          <li key={s.fingerprint} className="recent-item">
            <div className="recent-main">
              <span className="recent-name truncate" title={s.fileName}>{s.fileName}</span>
              <span className="muted truncate">
                {s.segments.length} segment{s.segments.length === 1 ? '' : 's'}
                {s.duration > 0 && <> · {formatTime(s.duration, false)}</>}
                {' · '}
                {formatRelative(s.updatedAt)}
              </span>
            </div>
            <Tip label="Delete session">
              <Button
                data-variant="ghost-destructive"
                data-size="icon"
                aria-label={`Delete session for ${s.fileName}`}
                onClick={() => onDelete(s.fingerprint)}
              >
                <Trash2Icon aria-hidden="true" />
              </Button>
            </Tip>
          </li>
        ))}
      </ul>
    </Card>
  )
}
