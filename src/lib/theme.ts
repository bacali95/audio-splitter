/** Resolve a CSS colour expression (which may use var() and color-mix()) to a computed colour string. */
export function resolveColor(expression: string): string {
  const probe = document.createElement('span')
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;'
  probe.style.color = expression
  document.documentElement.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  return value
}

export interface WaveColors {
  wave: string
  progress: string
  cursor: string
  /** Solid primary, for the pending-start marker. */
  primary: string
}

/** Waveform colours read from the design tokens at call time. */
export function readWaveColors(): WaveColors {
  return {
    wave: resolveColor('color-mix(in oklch, var(--muted-foreground) 45%, transparent)'),
    progress: resolveColor('color-mix(in oklch, var(--foreground) 70%, transparent)'),
    cursor: resolveColor('var(--primary)'),
    primary: resolveColor('var(--primary)'),
  }
}

/** Calls `cb` when the OS colour scheme or the `data-theme` override changes. Returns a disposer. */
export function onThemeChange(cb: () => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  mq.addEventListener('change', cb)
  return () => {
    mq.removeEventListener('change', cb)
    mo.disconnect()
  }
}
