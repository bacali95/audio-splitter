import { Zip, ZipPassThrough } from 'fflate'

export interface DirectoryHandleLike {
  /** Folder name, shown in the export success message. */
  name?: string
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(data: BufferSource | Blob): Promise<void>; close(): Promise<void> }>
  }>
}

export function supportsDirectoryPicker(): boolean {
  return typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
}

/** Must be called from a user gesture. Returns null if the user cancels. */
export async function pickDirectory(): Promise<DirectoryHandleLike | null> {
  try {
    const w = window as unknown as {
      showDirectoryPicker: (o?: { mode?: 'readwrite' }) => Promise<DirectoryHandleLike>
    }
    return await w.showDirectoryPicker({ mode: 'readwrite' })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }
}

export async function writeToDirectory(dir: DirectoryHandleLike, fileName: string, data: Uint8Array): Promise<void> {
  const fh = await dir.getFileHandle(fileName, { create: true })
  const w = await fh.createWritable()
  await w.write(data as unknown as BufferSource)
  await w.close()
}

/** Incremental "store" (no compression) ZIP builder; holds only the compressed chunks in memory. */
export class ZipBuilder {
  private chunks: BlobPart[] = []
  private zip: Zip
  private done: Promise<Blob>

  constructor() {
    let resolve!: (b: Blob) => void
    let reject!: (e: unknown) => void
    this.done = new Promise<Blob>((res, rej) => {
      resolve = res
      reject = rej
    })
    this.zip = new Zip((err, chunk, final) => {
      if (err) return reject(err)
      this.chunks.push(chunk as unknown as BlobPart)
      if (final) resolve(new Blob(this.chunks, { type: 'application/zip' }))
    })
  }

  add(fileName: string, data: Uint8Array): void {
    const f = new ZipPassThrough(fileName)
    this.zip.add(f)
    f.push(data, true)
  }

  finish(): Promise<Blob> {
    this.zip.end()
    return this.done
  }
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
