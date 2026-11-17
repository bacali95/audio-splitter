import { describe, expect, it } from 'vitest'
import { ensureReadPermission, handleFromDropItem, isAbortError, isNotFoundError, openHandle } from './fsAccess'

const err = (name: string) => Object.assign(new Error(name), { name })
type PermState = 'granted' | 'denied' | 'prompt'
const fakeHandle = (query: PermState, request: PermState, getFile: () => Promise<File>) =>
  ({
    kind: 'file',
    queryPermission: async () => query,
    requestPermission: async () => request,
    getFile,
  }) as unknown as FileSystemFileHandle

describe('error classifiers', () => {
  it('matches by name', () => {
    expect(isAbortError(err('AbortError'))).toBe(true)
    expect(isAbortError(err('NotFoundError'))).toBe(false)
    expect(isNotFoundError(err('NotFoundError'))).toBe(true)
    expect(isNotFoundError(null)).toBe(false)
  })
})

describe('ensureReadPermission', () => {
  const file = new File(['x'], 'a.mp3')
  it('granted without prompting', async () => {
    expect(await ensureReadPermission(fakeHandle('granted', 'denied', async () => file))).toBe(true)
  })
  it('requests when prompt', async () => {
    expect(await ensureReadPermission(fakeHandle('prompt', 'granted', async () => file))).toBe(true)
    expect(await ensureReadPermission(fakeHandle('prompt', 'denied', async () => file))).toBe(false)
  })
})

describe('openHandle', () => {
  const file = new File(['x'], 'a.mp3')
  it('returns the file', async () => {
    expect(await openHandle(fakeHandle('granted', 'granted', async () => file))).toEqual({ ok: true, file })
  })
  it('classifies denied / not-found / error', async () => {
    expect(await openHandle(fakeHandle('prompt', 'denied', async () => file))).toEqual({ ok: false, reason: 'denied' })
    const nf = async () => {
      throw err('NotFoundError')
    }
    expect(await openHandle(fakeHandle('granted', 'granted', nf))).toEqual({ ok: false, reason: 'not-found' })
    const other = async () => {
      throw err('NotReadableError')
    }
    expect(await openHandle(fakeHandle('granted', 'granted', other))).toEqual({ ok: false, reason: 'error' })
  })
})

describe('handleFromDropItem', () => {
  it('null without support', async () => {
    expect(await handleFromDropItem(undefined)).toBeNull()
    expect(await handleFromDropItem({ kind: 'file' } as DataTransferItem)).toBeNull()
  })
  it('returns file handles only', async () => {
    const h = { kind: 'file' }
    const item = (v: unknown) => ({ kind: 'file', getAsFileSystemHandle: async () => v }) as unknown as DataTransferItem
    expect(await handleFromDropItem(item(h))).toBe(h)
    expect(await handleFromDropItem(item({ kind: 'directory' }))).toBeNull()
  })
})
