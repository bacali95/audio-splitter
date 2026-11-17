/** Errors raised by non-UI modules carry a code (and params); the UI layer turns them into text (see i18n/describeError). */
export type AppErrorCode = 'unplayable' | 'ffmpegExit' | 'pickerUnavailable'

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly params: Record<string, string | number>
  constructor(code: AppErrorCode, params: Record<string, string | number> = {}) {
    super(`${code}${Object.keys(params).length ? ` ${JSON.stringify(params)}` : ''}`)
    this.name = 'AppError'
    this.code = code
    this.params = params
  }
}
