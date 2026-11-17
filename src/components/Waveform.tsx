import { Card, CardContent } from './ui'

interface Props {
  setWaveformEl: (el: HTMLDivElement | null) => void
  setTimelineEl: (el: HTMLDivElement | null) => void
}

/** Plain containers for WaveSurfer (see hooks/useWaveform.ts). */
export function Waveform({ setWaveformEl, setTimelineEl }: Props) {
  return (
    <Card size="sm" className="waveform-card">
      <CardContent>
        <div ref={setWaveformEl} className="waveform" />
        <div ref={setTimelineEl} className="timeline" />
      </CardContent>
    </Card>
  )
}
