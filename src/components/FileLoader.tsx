import { FileInput, FileInputDropzone, FileInputTrigger } from '@ui-sdk/react/file-input'
import { FolderOpenIcon, UploadIcon } from 'lucide-react'
import { Card, CardContent } from './ui'

export const ACCEPT = ['audio/*', '.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.webm']

interface Props {
  onFile: (file: File) => void
  onReject?: () => void
  /** Render a compact button instead of the big dropzone. */
  compact?: boolean
  disabled?: boolean
}

export function FileLoader({ onFile, onReject, compact, disabled }: Props) {
  const handle = (files: File[]) => {
    if (files[0]) onFile(files[0])
  }
  if (compact) {
    return (
      <FileInput accept={ACCEPT} value={[]} onValueChange={handle} onReject={onReject} disabled={disabled}>
        <FileInputTrigger data-variant="outline">
          <FolderOpenIcon aria-hidden="true" /> Load another file
        </FileInputTrigger>
      </FileInput>
    )
  }
  return (
    <Card>
      <CardContent>
        <FileInput accept={ACCEPT} value={[]} onValueChange={handle} onReject={onReject} disabled={disabled}>
          <FileInputDropzone className="dropzone" target="document">
            <span className="dropzone-icon">
              <UploadIcon aria-hidden="true" />
            </span>
            <p className="dropzone-title">Drop an audio file here</p>
            <p className="muted">mp3, wav, m4a, aac, flac, ogg, opus, webm. Files stay on your computer.</p>
            <FileInputTrigger data-size="lg">Browse files</FileInputTrigger>
          </FileInputDropzone>
        </FileInput>
      </CardContent>
    </Card>
  )
}
