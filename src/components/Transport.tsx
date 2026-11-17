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
import { formatTime } from '../lib/time'
import { Card, Tip } from './ui'

export const RATES = [0.75, 1, 1.25, 1.5, 2]
const RATE_ITEMS = RATES.map((r) => ({ value: String(r), label: `${r}×` }))

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

/** [keys, description]. Each entry in `keys` is rendered as its own <kbd>; several mean "either". */
const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Play / pause'],
  [['←', '→'], 'Seek 5 s'],
  [['Shift + ←', 'Shift + →'], 'Seek 30 s'],
  [['['], 'Mark segment start'],
  [[']'], 'Mark end, create segment'],
  [['Delete', 'Backspace'], 'Delete selected segment'],
  [['Esc'], 'Clear selection and start'],
  [['Ctrl/⌘ + wheel'], 'Zoom waveform'],
  [['Drag on waveform'], 'Create a segment'],
  [['Click on waveform'], 'Seek'],
]

export function Transport(p: Props) {
  const VolumeIcon = p.muted || p.volume === 0 ? VolumeXIcon : p.volume < 0.5 ? Volume1Icon : Volume2Icon
  return (
    <Card size="sm" className="transport">
      <Toolbar aria-label="Transport" className="transport-bar">
        <ToolbarGroup aria-label="Playback">
          <Tip label="Back 5 s (←)">
            <ToolbarButton data-variant="ghost" data-size="icon" aria-label="Back 5 seconds" onClick={() => p.onSeekBy(-5)}>
              <RewindIcon aria-hidden="true" />
            </ToolbarButton>
          </Tip>
          <Tip label={p.playing ? 'Pause (Space)' : 'Play (Space)'}>
            <ToolbarButton data-size="icon" aria-label={p.playing ? 'Pause' : 'Play'} onClick={p.onTogglePlay}>
              {p.playing ? <PauseIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
            </ToolbarButton>
          </Tip>
          <Tip label="Forward 5 s (→)">
            <ToolbarButton data-variant="ghost" data-size="icon" aria-label="Forward 5 seconds" onClick={() => p.onSeekBy(5)}>
              <FastForwardIcon aria-hidden="true" />
            </ToolbarButton>
          </Tip>
        </ToolbarGroup>

        <ToolbarSeparator />
        <span className="clock mono" role="timer" aria-label="Current time and duration">
          {formatTime(p.currentTime)} <span className="muted">/ {formatTime(p.duration)}</span>
        </span>
        <ToolbarSeparator />

        <ToolbarGroup aria-label="Segment">
          <Tip label="Set segment start at the playhead ( [ )">
            <ToolbarButton data-variant="outline" onClick={p.onMarkStart}>
              <MapPinIcon aria-hidden="true" /> Mark start
            </ToolbarButton>
          </Tip>
          <Tip
            label={p.pendingStart === null ? 'Set a start first' : 'Set segment end at the playhead ( ] )'}
          >
            <ToolbarButton
              data-variant="outline"
              disabled={p.pendingStart === null}
              focusableWhenDisabled
              onClick={p.onMarkEnd}
            >
              <FlagIcon aria-hidden="true" /> Mark end
            </ToolbarButton>
          </Tip>
        </ToolbarGroup>

        <div className="transport-end">
          <Select
            items={RATE_ITEMS}
            value={String(p.rate)}
            onValueChange={(v) => v && p.onRate(Number(v))}
          >
            <SelectTrigger aria-label="Playback speed" className="speed-trigger">
              <SelectValue />
              <ChevronDownIcon aria-hidden="true" />
            </SelectTrigger>
            <SelectContent>
              {RATE_ITEMS.map((o) => (
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
          <div className="slider-ctl" role="group" aria-label="Zoom">
            <ZoomOutIcon aria-hidden="true" />
            <Slider value={p.zoom} min={0} max={100} step={0.5} onValueChange={(v) => p.onZoom(v as number)}>
              <SliderControl>
                <SliderTrack>
                  <SliderIndicator />
                  <SliderThumb aria-label="Zoom" />
                </SliderTrack>
              </SliderControl>
            </Slider>
            <ZoomInIcon aria-hidden="true" />
          </div>

          <ToolbarSeparator />
          <div className="slider-ctl slider-ctl-volume" role="group" aria-label="Volume">
            <Tip label={p.muted ? 'Unmute' : 'Mute'}>
              <ToolbarButton
                data-variant="ghost"
                data-size="icon-sm"
                aria-label={p.muted ? 'Unmute' : 'Mute'}
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
                  <SliderThumb aria-label="Volume" />
                </SliderTrack>
              </SliderControl>
            </Slider>
          </div>

          <ToolbarSeparator />
          <Popover>
            <PopoverTrigger data-variant="ghost">
              <KeyboardIcon aria-hidden="true" /> Shortcuts
            </PopoverTrigger>
            <PopoverContent sideOffset={8} align="end" className="shortcuts">
              <PopoverTitle>Keyboard shortcuts</PopoverTitle>
              <dl className="shortcut-grid">
                {SHORTCUTS.map(([keys, d]) => (
                  <div key={d} className="shortcut-row">
                    <dt>
                      {keys.map((key, i) => (
                        <span key={key} className="shortcut-keys">
                          {i > 0 && <span className="muted"> / </span>}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{d}</dd>
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
            Start set at <span className="mono pending-time">{formatTime(p.pendingStart)}</span> — press <kbd>]</kbd> or{' '}
            <strong>Mark end</strong>
          </span>
          <Tip label="Cancel (Esc)">
            <Button data-variant="ghost" data-size="icon-sm" aria-label="Cancel pending start" onClick={p.onCancelPending}>
              <XIcon aria-hidden="true" />
            </Button>
          </Tip>
        </div>
      )}
    </Card>
  )
}
