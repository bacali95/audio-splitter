export interface Segment {
  id: string
  start: number
  end: number
  name: string
}

export interface SavedSession {
  fileName: string
  size: number
  duration: number
  updatedAt: number
  segments: Segment[]
}

const PREFIX = 'audio-splitter:v1:'

export function loadSession(fingerprint: string): SavedSession | null {
  try {
    const raw = localStorage.getItem(PREFIX + fingerprint)
    if (!raw) return null
    return parseSession(JSON.parse(raw))
  } catch {
    return null
  }
}

function parseSession(v: unknown): SavedSession | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  if (!Array.isArray(o.segments)) return null
  const segments: Segment[] = []
  for (const s of o.segments) {
    const r = s as Record<string, unknown>
    if (typeof r?.start === 'number' && typeof r?.end === 'number' && r.end > r.start) {
      segments.push({
        id: typeof r.id === 'string' ? r.id : crypto.randomUUID(),
        start: r.start,
        end: r.end,
        name: typeof r.name === 'string' ? r.name : '',
      })
    }
  }
  return {
    fileName: typeof o.fileName === 'string' ? o.fileName : 'unknown',
    size: typeof o.size === 'number' ? o.size : 0,
    duration: typeof o.duration === 'number' ? o.duration : 0,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
    segments,
  }
}

export function saveSession(fingerprint: string, session: SavedSession): void {
  try {
    localStorage.setItem(PREFIX + fingerprint, JSON.stringify(session))
  } catch (e) {
    console.warn('Could not save session', e)
  }
}

export function deleteSession(fingerprint: string): void {
  try {
    localStorage.removeItem(PREFIX + fingerprint)
  } catch {
    /* ignore */
  }
}

export interface SessionListItem extends SavedSession {
  fingerprint: string
}

export function listSessions(): SessionListItem[] {
  const out: SessionListItem[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(PREFIX)) continue
      const s = loadSession(key.slice(PREFIX.length))
      if (s) out.push({ ...s, fingerprint: key.slice(PREFIX.length) })
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

// ---------- IndexedDB: peaks cache + file handles ----------

const DB_NAME = 'audio-splitter'
const DB_VERSION = 2
const STORE = 'peaks'
const HANDLES = 'handles'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    // v1 -> v2 adds `handles`; existing `peaks` data is untouched. Creation is guarded so fresh installs and upgrades share one path.
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      if (!db.objectStoreNames.contains(HANDLES)) db.createObjectStore(HANDLES)
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  })
}

export async function getPeaks(fingerprint: string): Promise<Float32Array | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(fingerprint)
      req.onsuccess = () => resolve(req.result instanceof Float32Array ? req.result : null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function putPeaks(fingerprint: string, peaks: Float32Array): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(peaks, fingerprint)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('Could not cache peaks', e)
  }
}

export async function deletePeaks(fingerprint: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(fingerprint)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* ignore */
  }
}

// ---------- File handles (Chromium File System Access API) ----------

export async function putHandle(fingerprint: string, handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLES, 'readwrite')
      tx.objectStore(HANDLES).put(handle, fingerprint)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (e) {
    console.warn('Could not store file handle', e)
  }
}

export async function getHandle(fingerprint: string): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLES).objectStore(HANDLES).get(fingerprint)
      req.onsuccess = () => {
        const v: unknown = req.result
        resolve(typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'file' ? (v as FileSystemFileHandle) : null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function deleteHandle(fingerprint: string): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(HANDLES, 'readwrite')
      tx.objectStore(HANDLES).delete(fingerprint)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* ignore */
  }
}

/** Fingerprints that have a stored handle. */
export async function listHandleKeys(): Promise<Set<string>> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDLES).objectStore(HANDLES).getAllKeys()
      req.onsuccess = () => resolve(new Set(req.result.filter((k): k is string => typeof k === 'string')))
      req.onerror = () => reject(req.error)
    })
  } catch {
    return new Set()
  }
}
