const MIB = 1024 * 1024

/**
 * Fast file fingerprint: SHA-256 over size + first/middle/last 1 MiB.
 * Independent of lastModified and file name, so renamed copies match.
 */
export async function fingerprintFile(file: File): Promise<string> {
  const size = file.size
  const mid = Math.max(0, Math.floor(size / 2 - MIB / 2))
  const [a, b, c] = await Promise.all([
    file.slice(0, MIB).arrayBuffer(),
    file.slice(mid, mid + MIB).arrayBuffer(),
    file.slice(Math.max(0, size - MIB), size).arrayBuffer(),
  ])
  const head = new TextEncoder().encode(String(size) + ':')
  const buf = new Uint8Array(head.length + a.byteLength + b.byteLength + c.byteLength)
  let o = 0
  for (const part of [head, new Uint8Array(a), new Uint8Array(b), new Uint8Array(c)]) {
    buf.set(part, o)
    o += part.length
  }
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), (x) => x.toString(16).padStart(2, '0')).join('')
}
