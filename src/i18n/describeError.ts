import i18n from './index'
import { AppError } from '../lib/errors'

/** Human-readable, localised text for any thrown value. */
export function describeError(e: unknown): string {
  if (e instanceof AppError) {
    switch (e.code) {
      case 'unplayable':
        return i18n.t('errors.unplayable')
      case 'ffmpegExit':
        return i18n.t('errors.ffmpegExit', { code: e.params.code ?? '?', log: e.params.log ?? '' })
      case 'pickerUnavailable':
        return i18n.t('errors.pickerUnavailable')
    }
  }
  return e instanceof Error ? e.message : String(e)
}
