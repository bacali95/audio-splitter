import { Button } from '@ui-sdk/react/button'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ui-sdk/react/popover'
import { Select, SelectContent, SelectItem, SelectItemIndicator, SelectTrigger, SelectValue } from '@ui-sdk/react/select'
import { Slider, SliderControl, SliderIndicator, SliderThumb, SliderTrack } from '@ui-sdk/react/slider'
import { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator } from '@ui-sdk/react/toolbar'
import {
  CheckIcon,
  ChevronDownIcon,
  FastForwardIcon,
  FlagIcon,
  KeyboardIcon,
  MapPinIcon,
  PauseIcon,
  PlayIcon,
  RewindIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { formatDecimal } from '../lib/format'
import { formatTime } from '../lib/time'
import { Card, Tip } from './ui'

export const RATES = [0.75, 1, 1.25, 1.5, 2]

interface Props {
  currentTime: number
  duration: number
  playing: boolean
  zoom: number
  rate: number
  volume: number
  muted: boolean
  pendingStart: number | null
  onTogglePlay: () => void
  onSeekBy: (delta: number) => void
  onZoom: (z: number) => void
  onRate: (r: number) => void
  onVolume: (v: number) => void
  onToggleMute: () => void
  onMarkStart: () => void
  onMarkEnd: () => void
  onCancelPending: () => void
}

/** A shortcut row: each entry in `keys` is rendered as its own <kbd> (several mean "either"); `literal` ones are glyphs, not words. */
type ShortcutKey = { literal: string } | { key: 'space' | 'shiftLeft' | 'shiftRight' | 'delete' | 'backspace' | 'esc' | 'ctrlWheel' | 'dragWaveform' | 'clickWaveform' }
const lit = (literal: string): ShortcutKey => ({ literal })
const SHORTCUTS: { id: 'playPause' | 'seek5' | 'seek30' | 'markStart' | 'markEnd' | 'deleteSegment' | 'clearSelection' | 'zoom' | 'createByDrag' | 'seekByClick'; keys: ShortcutKey[] }[] = [
  { id: 'playPause', keys: [{ key: 'space' }] },
  { id: 'seek5', keys: [lit('←'), lit('→')] },
  { id: 'seek30', keys: [{ key: 'shiftLeft' }, { key: 'shiftRight' }] },
  { id: 'markStart', keys: [lit('[')] },
  { id: 'markEnd', keys: [lit(']')] },
  { id: 'deleteSegment', keys: [{ key: 'delete' }, { key: 'backspace' }] },
  { id: 'clearSelection', keys: [{ key: 'esc' }] },
  { id: 'zoom', keys: [{ key: 'ctrlWheel' }] },
  { id: 'createByDrag', keys: [{ key: 'dragWaveform' }] },
  { id: 'seekByClick', keys: [{ key: 'clickWaveform' }] },
]

export function Transport(p: Props) {
  const { t, i18n } = useTranslation()
  const rateItems = useMemo(
    () => RATES.map((r) => ({ value: String(r), label: t('transport.speedValue', { value: formatDecimal(r, i18n.language) }) })),
    [t, i18n.language],
  )
  const VolumeIcon = p.muted || p.volume === 0 ? VolumeXIcon : p.volume < 0.5 ? Volume1Icon : Volume2Icon
  return (
    <Card size="sm" className="transport">
      <Toolbar aria-label={t('aria.transport')} className="transport-bar">
        {/* Media controls keep their left-to-right order in RTL, like the time axis they act on. */}
        <ToolbarGroup aria-label={t('aria.playback')} dir="ltr">
          <Tip label={t('transport.backTip')}>
            <ToolbarButton data-variant="ghost" data-size="icon" aria-label={t('aria.back5')} onClick={() => p.onSeekBy(-5)}>
              <RewindIcon aria-hidden="true" />
            </ToolbarButton>
          </Tip>
          <Tip label={p.playing ? t('transport.pauseTip', { key: t('shortcuts.keys.space') }) : t('transport.playTip', { key: t('shortcuts.keys.space') })}>
            <ToolbarButton data-size="icon" aria-label={p.playing ? t('transport.pause') : t('transport.play')} onClick={p.onTogglePlay}>
              {p.playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
            </ToolbarButton>
          </Tip>
          <Tip label={t('transport.forwardTip')}>
            <ToolbarButton data-variant="ghost" data-size="icon" aria-label={t('aria.forward5')} onClick={() => p.onSeekBy(5)}>
              <FastForwardIcon aria-hidden="true" />
            </ToolbarButton>
          </Tip>
        </ToolbarGroup>

        <ToolbarSeparator />
        <span className="clock mono" role="timer" dir="ltr" aria-label={t('aria.clock')}>
          {formatTime(p.currentTime)} <span className="muted">/ {formatTime(p.duration)}</span>
        </span>
        <ToolbarSeparator />

        <ToolbarGroup aria-label={t('aria.segment')}>
          <Tip label={t('transport.markStartTip')}>
            <ToolbarButton data-variant="outline" onClick={p.onMarkStart}>
              <MapPinIcon aria-hidden="true" /> {t('transport.markStart')}
            </ToolbarButton>
          </Tip>
          <Tip
            label={p.pendingStart === null ? t('transport.markEndNeedsStart') : t('transport.markEndTip')}
          >
            <ToolbarButton
              data-variant="outline"
              disabled={p.pendingStart === null}
              focusableWhenDisabled
              onClick={p.onMarkEnd}
            >
              <FlagIcon aria-hidden="true" /> {t('transport.markEnd')}
            </ToolbarButton>
          </Tip>
        </ToolbarGroup>

        <div className="transport-end">
          <Select
            items={rateItems}
            value={String(p.rate)}
            onValueChange={(v) => v && p.onRate(Number(v))}
          >
            <SelectTrigger aria-label={t('aria.playbackSpeed')} className="speed-trigger">
              <SelectValue />
              <ChevronDownIcon aria-hidden="true" />
            </SelectTrigger>
            <SelectContent className="speed-content">
              {rateItems.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                  <SelectItemIndicator>
                    <CheckIcon aria-hidden="true" />
                  </SelectItemIndicator>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <ToolbarSeparator />
          <div className="slider-ctl" role="group" aria-label={t('aria.zoom')} dir="ltr">
            <ZoomOutIcon aria-hidden="true" />
            <Slider value={p.zoom} min={0} max={100} step={0.5} onValueChange={(v) => p.onZoom(v as number)}>
              <SliderControl>
                <SliderTrack>
                  <SliderIndicator />
                  <SliderThumb aria-label={t('aria.zoom')} />
                </SliderTrack>
              </SliderControl>
            </Slider>
            <ZoomInIcon aria-hidden="true" />
          </div>

          <ToolbarSeparator />
          <div className="slider-ctl slider-ctl-volume" role="group" aria-label={t('aria.volume')} dir="ltr">
            <Tip label={p.muted ? t('transport.unmute') : t('transport.mute')}>
              <ToolbarButton
                data-variant="ghost"
                data-size="icon-sm"
                aria-label={p.muted ? t('transport.unmute') : t('transport.mute')}
                aria-pressed={p.muted}
                onClick={p.onToggleMute}
              >
                <VolumeIcon aria-hidden="true" />
              </ToolbarButton>
            </Tip>
            <Slider
              value={p.muted ? 0 : p.volume}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(v) => p.onVolume(v as number)}
            >
              <SliderControl>
                <SliderTrack>
                  <SliderIndicator />
                  <SliderThumb aria-label={t('aria.volume')} />
                </SliderTrack>
              </SliderControl>
            </Slider>
          </div>

          <ToolbarSeparator />
          <Popover>
            <PopoverTrigger data-variant="ghost">
              <KeyboardIcon aria-hidden="true" /> {t('shortcuts.button')}
            </PopoverTrigger>
            <PopoverContent sideOffset={8} align="end" className="shortcuts">
              <PopoverTitle>{t('shortcuts.title')}</PopoverTitle>
              <dl className="shortcut-grid">
                {SHORTCUTS.map(({ id, keys }) => (
                  <div key={id} className="shortcut-row">
                    <dt>
                      {keys.map((k, i) => {
                        const text = 'literal' in k ? k.literal : t(`shortcuts.keys.${k.key}`)
                        return (
                          <span key={text} className="shortcut-keys">
                            {i > 0 && <span className="muted"> / </span>}
                            <kbd {...('literal' in k ? { dir: 'ltr' as const } : {})}>{text}</kbd>
                          </span>
                        )
                      })}
                    </dt>
                    <dd>{t(`shortcuts.${id}`)}</dd>
                  </div>
                ))}
              </dl>
            </PopoverContent>
          </Popover>
        </div>
      </Toolbar>

      {p.pendingStart !== null && (
        <div className="pending-chip" role="status">
          <span className="pending-dot" aria-hidden="true" />
          <span>
            <Trans
              i18nKey="transport.pending"
              values={{ time: formatTime(p.pendingStart) }}
              components={{
                time: <span className="mono pending-time" dir="ltr" />,
                endKey: <kbd dir="ltr">]</kbd>,
                strong: <strong />,
              }}
            />
          </span>
          <Tip label={t('transport.cancelPendingTip', { key: t('shortcuts.keys.esc') })}>
            <Button data-variant="ghost" data-size="icon-sm" aria-label={t('aria.cancelPending')} onClick={p.onCancelPending}>
              <XIcon aria-hidden="true" />
            </Button>
          </Tip>
        </div>
      )}
    </Card>
  )
}
