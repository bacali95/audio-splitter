import { FFmpeg } from '@ffmpeg/ffmpeg'
import { toBlobURL } from '@ffmpeg/util'
// Self-hosted single-thread core (bundled by Vite, no CDN at runtime).
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'
import { AppError } from './errors'
import { splitExt } from './names'

export const PEAKS_PER_SEC = 50
const PEAK_SAMPLE_RATE = 4000
const MOUNT = '/in'

let ffmpeg: FFmpeg | null = null
let loading: Promise<FFmpeg> | null = null
let mountedFile: File | null = null
let mountedName = ''
let busy: Promise<unknown> = Promise.resolve()
let lastLog: string[] = []

/** Serialize ffmpeg operations (single instance, single worker). */
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = busy.then(fn, fn)
  busy = run.catch(() => undefined)
  return run
}

/** Load the (single) FFmpeg instance lazily. */
export function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg) return Promise.resolve(ffmpeg)
  if (!loading) {
    loading = (async () => {
      const ff = new FFmpeg()
      ff.on('log', ({ message }) => {
        lastLog.push(message)
        if (lastLog.length > 60) lastLog.shift()
      })
      await ff.load({
        coreURL: await toBlobURL(coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(wasmURL, 'application/wasm'),
      })
      ffmpeg = ff
      return ff
    })().catch((e) => {
      loading = null
      throw e
    })
  }
  return loading
}

/** Mount `file` (WORKERFS, zero-copy) at /in. Unmounts any previous file. Returns the input path. */
async function ensureMounted(ff: FFmpeg, file: File): Promise<string> {
  if (mountedFile === file) return `${MOUNT}/${mountedName}`
  if (mountedFile) {
    try {
      await ff.unmount(MOUNT)
    } catch {
      /* ignore */
    }
    mountedFile = null
  }
  try {
    await ff.createDir(MOUNT)
  } catch {
    /* already exists */
  }
  // Sanitised alias keeps the same bytes (no copy) but avoids odd characters in argv.
  const { ext } = splitExt(file.name)
  const safeExt = /^\.[A-Za-z0-9]{1,8}$/.test(ext) ? ext : ''
  const name = `input${safeExt}`
  const aliased = new File([file], name, { type: file.type })
  await ff.mount('WORKERFS' as never, { files: [aliased] }, MOUNT)
  mountedFile = file
  mountedName = name
  return `${MOUNT}/${name}`
}

/** Release the mounted file (call when the user switches files). */
export async function unmountFile(): Promise<void> {
  if (!ffmpeg || !mountedFile) return
  await enqueue(async () => {
    try {
      await ffmpeg!.unmount(MOUNT)
    } catch {
      /* ignore */
    }
    mountedFile = null
  })
}

async function run(ff: FFmpeg, args: string[]): Promise<void> {
  lastLog = []
  const code = await ff.exec(args)
  if (code !== 0) {
    throw new AppError('ffmpegExit', { code, log: lastLog.slice(-4).join(' | ') })
  }
}

/** Reduce 16-bit mono PCM to one max-abs value (0..1) per bucket. */
export function computePeaks(pcm: Int16Array, samplesPerBucket: number): Float32Array {
  const n = Math.ceil(pcm.length / samplesPerBucket)
  const out = new Float32Array(n)
  let max = 0
  for (let b = 0; b < n; b++) {
    const s = b * samplesPerBucket
    const e = Math.min(pcm.length, s + samplesPerBucket)
    let lo = 0
    let hi = 0
    for (let i = s; i < e; i++) {
      const v = pcm[i]
      if (v < lo) lo = v
      else if (v > hi) hi = v
    }
    const m = Math.max(hi, -lo) / 32768
    out[b] = m
    if (m > max) max = m
  }
  // Normalise so quiet recordings still show a readable waveform.
  if (max > 0 && max < 1) for (let i = 0; i < n; i++) out[i] /= max
  return out
}

/** Decode to 4 kHz mono s16 inside ffmpeg.wasm and reduce to ~50 peaks/second. */
export function generatePeaks(
  file: File,
  durationHint: number,
  onProgress: (ratio: number) => void,
): Promise<Float32Array> {
  return enqueue(async () => {
    const ff = await getFFmpeg()
    const input = await ensureMounted(ff, file)
    const handler = ({ progress, time }: { progress: number; time: number }) => {
      // `time` is output position in microseconds; more reliable than `progress` for raw output.
      const r = durationHint > 0 && time > 0 ? time / 1e6 / durationHint : progress
      if (Number.isFinite(r)) onProgress(Math.min(1, Math.max(0, r)))
    }
    ff.on('progress', handler)
    try {
      await run(ff, ['-y', '-i', input, '-vn', '-ac', '1', '-ar', String(PEAK_SAMPLE_RATE), '-f', 's16le', '/peaks.raw'])
      const data = (await ff.readFile('/peaks.raw')) as Uint8Array
      const pcm = new Int16Array(data.buffer, data.byteOffset, Math.floor(data.byteLength / 2))
      const peaks = computePeaks(pcm, PEAK_SAMPLE_RATE / PEAKS_PER_SEC)
      onProgress(1)
      return peaks
    } finally {
      ff.off('progress', handler)
      try {
        await ff.deleteFile('/peaks.raw')
      } catch {
        /* ignore */
      }
    }
  })
}

// ---------- Extraction ----------

export type ReencodeKind = 'mp3' | 'aac' | 'opus' | 'flac' | 'pcm'

/** Map a file extension to the re-encode family (null = unsupported). */
export function reencodeKind(ext: string): ReencodeKind | null {
  switch (ext.toLowerCase().replace('.', '')) {
    case 'mp3':
      return 'mp3'
    case 'm4a':
    case 'aac':
    case 'mp4':
      return 'aac'
    case 'ogg':
    case 'oga':
    case 'opus':
    case 'webm':
      return 'opus'
    case 'flac':
      return 'flac'
    case 'wav':
      return 'pcm'
    default:
      return null
  }
}

const ENCODER_FOR: Record<ReencodeKind, string> = {
  mp3: 'libmp3lame',
  aac: 'aac',
  opus: 'libopus',
  flac: 'flac',
  pcm: 'pcm_s16le',
}

const CODEC_ARGS: Record<ReencodeKind, string[]> = {
  mp3: ['-c:a', 'libmp3lame', '-q:a', '2'],
  aac: ['-c:a', 'aac', '-b:a', '192k'],
  opus: ['-c:a', 'libopus', '-b:a', '128k'],
  flac: ['-c:a', 'flac'],
  pcm: ['-c:a', 'pcm_s16le'],
}

let encoderCache: Set<string> | null = null

/** Which of our re-encode encoders exist in the loaded core (parsed from `ffmpeg -encoders`). */
export function getAvailableEncoders(): Promise<Set<string>> {
  return enqueue(async () => {
    if (encoderCache) return encoderCache
    const ff = await getFFmpeg()
    const lines: string[] = []
    const h = ({ message }: { message: string }) => lines.push(message)
    ff.on('log', h)
    try {
      await ff.exec(['-hide_banner', '-encoders'])
    } finally {
      ff.off('log', h)
    }
    const found = new Set<string>()
    for (const enc of Object.values(ENCODER_FOR)) {
      if (lines.some((l) => new RegExp(`\\sA[A-Z.]{5}\\s+${enc}\\s`).test(l))) found.add(enc)
    }
    encoderCache = found
    return found
  })
}

export function canReencode(ext: string, encoders: Set<string>): boolean {
  const k = reencodeKind(ext)
  return !!k && k !== 'pcm' && encoders.has(ENCODER_FOR[k])
}

/**
 * Build ffmpeg args for one segment.
 * -ss/-to are INPUT options (before -i): fast seek. For stream copy, audio packets are all
 * keyframes so the cut lands on a packet boundary (~26 ms for mp3, ~21 ms for aac); with
 * re-encoding, input-side -ss is sample-accurate (ffmpeg decodes from the seek point and trims).
 */
export function buildExtractArgs(
  input: string,
  output: string,
  start: number,
  end: number,
  ext: string,
  reencode: boolean,
): string[] {
  const kind = reencodeKind(ext)
  const codec = reencode && kind && kind !== 'pcm' ? CODEC_ARGS[kind] : ['-c', 'copy']
  return [
    '-y',
    '-ss', start.toFixed(3),
    '-to', end.toFixed(3),
    '-i', input,
    ...codec,
    '-map', '0:a',
    '-map_metadata', '0',
    output,
  ]
}

export function extractSegment(
  file: File,
  start: number,
  end: number,
  ext: string,
  reencode: boolean,
  onProgress: (ratio: number) => void,
): Promise<Uint8Array> {
  return enqueue(async () => {
    const ff = await getFFmpeg()
    const input = await ensureMounted(ff, file)
    const out = `/out${ext || '.bin'}`
    const handler = ({ progress, time }: { progress: number; time: number }) => {
      const r = time > 0 ? time / 1e6 / (end - start) : progress
      if (Number.isFinite(r)) onProgress(Math.min(1, Math.max(0, r)))
    }
    ff.on('progress', handler)
    try {
      await run(ff, buildExtractArgs(input, out, start, end, ext, reencode))
      const data = (await ff.readFile(out)) as Uint8Array
      onProgress(1)
      return data
    } finally {
      ff.off('progress', handler)
      try {
        await ff.deleteFile(out)
      } catch {
        /* ignore */
      }
    }
  })
}
