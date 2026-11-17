import { Tooltip, TooltipContent, TooltipTrigger } from '@ui-sdk/react/tooltip'
import type { CSSProperties, ComponentProps, ReactElement, ReactNode } from 'react'

/** Small presentational primitives styled in styles/ui.css (the SDK has no Card or Badge). */

type DivProps = ComponentProps<'div'>

export function Card({ size, flush, ...p }: DivProps & { size?: 'sm'; flush?: boolean }) {
  return <div data-slot="card" data-size={size} data-flush={flush ? '' : undefined} {...p} />
}
export function CardHeader({ bordered, stacked, ...p }: DivProps & { bordered?: boolean; stacked?: boolean }) {
  return <div data-slot="card-header" data-bordered={bordered ? '' : undefined} data-stacked={stacked ? '' : undefined} {...p} />
}
export function CardTitle(p: ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" {...p} />
}
export function CardDescription(p: ComponentProps<'p'>) {
  return <p data-slot="card-description" {...p} />
}
export function CardContent(p: DivProps) {
  return <div data-slot="card-content" {...p} />
}

export function Badge({
  variant,
  ...p
}: ComponentProps<'span'> & { variant?: 'secondary' | 'outline' | 'warning' }) {
  return <span data-slot="badge" data-variant={variant} {...p} />
}

/** A segment's colour chip. `color` is any CSS colour. */
export function Swatch({ color }: { color: string }) {
  return <span className="swatch" style={{ '--swatch': color } as CSSProperties} aria-hidden="true" />
}

/** Wraps a single trigger element in a Tooltip. The element is rendered as the trigger (no extra DOM). */
export function Tip({
  label,
  children,
  side,
  disabled,
}: {
  label: ReactNode
  children: ReactElement<Record<string, unknown>>
  side?: 'top' | 'bottom' | 'left' | 'right'
  disabled?: boolean
}) {
  return (
    <Tooltip disabled={disabled}>
      <TooltipTrigger render={children} />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
