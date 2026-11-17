import { FileInput, FileInputDropzone, FileInputTrigger } from '@ui-sdk/react/file-input'
import { FolderOpenIcon, UploadIcon } from 'lucide-react'
import { useEffect, useRef, type MouseEvent } from 'react'
import { AUDIO_EXTENSIONS, canPickFile, handleFromDropItem, pickAudioFile } from '../lib/fsAccess'
import { toast } from '@ui-sdk/react/toast'
import { Card, CardContent } from './ui'

export const ACCEPT = ['audio/*', ...AUDIO_EXTENSIONS]

interface Props {
  /** `handle` is set when the browser gave us one (picker or drop), so the file can be reopened later. */
  onFile: (file: File, handle?: FileSystemFileHandle) => void
  onReject?: () => void
  /** Render a compact button instead of the big dropzone. */
  compact?: boolean
  disabled?: boolean
}

export function FileLoader({ onFile, onReject, compact, disabled }: Props) {
  // Handle promise for the latest drop. getAsFileSystemHandle() only works synchronously inside the drop event,
  // so a capture-phase listener starts it before the SDK's own (bubble) drop handler reads the files.
  const dropHandle = useRef<Promise<FileSystemFileHandle | null> | null>(null)
  useEffect(() => {
    if (compact) return
    const onDrop = (e: DragEvent) => {
      const item = e.dataTransfer?.items?.[0]
      dropHandle.current = item ? handleFromDropItem(item) : null
    }
    document.addEventListener('drop', onDrop, true)
    return () => document.removeEventListener('drop', onDrop, true)
  }, [compact])

  const handle = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    const pending = dropHandle.current
    dropHandle.current = null
    const h = pending ? await pending : null
    // Only trust the handle if it is the file that was actually accepted.
    onFile(file, h && h.name === file.name ? h : undefined)
  }

  // Chromium: use the native picker so we get a persistent handle. Other browsers keep the plain file input.
  const browse = async (e: MouseEvent) => {
    if (!canPickFile()) return
    e.preventDefault()
    try {
      const picked = await pickAudioFile()
      if (picked) onFile(picked.file, picked.handle)
    } catch (err) {
      toast.error('Could not open file picker', { description: err instanceof Error ? err.message : String(err) })
    }
  }

  if (compact) {
    return (
      <FileInput accept={ACCEPT} value={[]} onValueChange={handle} onReject={onReject} disabled={disabled}>
        <FileInputTrigger data-variant="outline" onClick={browse}>
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
            <FileInputTrigger data-size="lg" onClick={browse}>Browse files</FileInputTrigger>
          </FileInputDropzone>
        </FileInput>
      </CardContent>
    </Card>
  )
}
