/** Helpers around the File System Access API. Everything is feature-detected; nothing here assumes Chromium. */

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.webm']

export function canPickFile(): boolean {
  return typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function'
}

function errorName(e: unknown): string | undefined {
  return typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : undefined
}

export const isAbortError = (e: unknown) => errorName(e) === 'AbortError'
export const isNotFoundError = (e: unknown) => errorName(e) === 'NotFoundError'

export interface PickedFile {
  file: File
  handle: FileSystemFileHandle
}

/** Opens the native picker. Resolves null when the user cancels. Must be called from a user gesture. */
export async function pickAudioFile(): Promise<PickedFile | null> {
  if (!window.showOpenFilePicker) throw new Error('showOpenFilePicker is not available')
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'Audio', accept: { 'audio/*': AUDIO_EXTENSIONS } }],
      excludeAcceptAllOption: false,
      multiple: false,
    })
    if (!handle) return null
    return { file: await handle.getFile(), handle }
  } catch (e) {
    if (isAbortError(e)) return null
    throw e
  }
}

/** True when read access is (or just became) granted. Prompts at most once, so call it inside a user gesture. */
export async function ensureReadPermission(handle: FileSystemFileHandle): Promise<boolean> {
  const opts = { mode: 'read' } as const
  // Handles without the permission methods (or OPFS handles) are readable as-is.
  if (!handle.queryPermission) return true
  if ((await handle.queryPermission(opts)) === 'granted') return true
  if (!handle.requestPermission) return false
  return (await handle.requestPermission(opts)) === 'granted'
}

export type HandleOpenResult =
  | { ok: true; file: File }
  | { ok: false; reason: 'denied' | 'not-found' | 'error' }

/** Permission + getFile, classified so the caller can decide how to fall back. */
export async function openHandle(handle: FileSystemFileHandle): Promise<HandleOpenResult> {
  try {
    if (!(await ensureReadPermission(handle))) return { ok: false, reason: 'denied' }
    return { ok: true, file: await handle.getFile() }
  } catch (e) {
    return { ok: false, reason: isNotFoundError(e) ? 'not-found' : 'error' }
  }
}

/** Picks the FileSystemFileHandle for a dropped item. MUST be called synchronously inside the drop event. */
export function handleFromDropItem(item: DataTransferItem | undefined): Promise<FileSystemFileHandle | null> {
  if (!item || item.kind !== 'file' || typeof item.getAsFileSystemHandle !== 'function') return Promise.resolve(null)
  return item
    .getAsFileSystemHandle()
    .then((h) => (h && h.kind === 'file' ? (h as FileSystemFileHandle) : null))
    .catch(() => null)
}
