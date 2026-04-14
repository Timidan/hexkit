import * as React from "react"
import { Check, Copy, WarningCircle as AlertCircle } from "@phosphor-icons/react"
import { Button, type ButtonProps } from "./button"
import { cn } from "@/lib/utils"
import { copyTextToClipboard } from "@/utils/clipboard"

export type CopyState = 'idle' | 'copied' | 'error'

export interface CopyButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Static value to copy */
  value?: string
  /** Function that returns the value to copy (supports async) */
  getValue?: () => string | Promise<string | undefined | null> | undefined
  /** Callback when copy succeeds */
  onCopySuccess?: (value: string) => void
  /** Callback when copy fails */
  onCopyError?: (error: unknown) => void
  /** Icon size in pixels */
  iconSize?: number
  /** Time in ms before resetting to idle state */
  resetDelay?: number
  /** Accessibility label */
  ariaLabel?: string
}

const STATE_RESET_MS = 1600

export function CopyButton({
  value,
  getValue,
  onCopySuccess,
  onCopyError,
  iconSize = 16,
  resetDelay = STATE_RESET_MS,
  ariaLabel = "Copy to clipboard",
  className,
  variant = "icon-borderless",
  size = "icon-inline",
  disabled,
  ...props
}: CopyButtonProps) {
  const [state, setState] = React.useState<CopyState>('idle')
  const timerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()

    if (disabled) return

    try {
      const resolved = value ?? (typeof getValue === 'function' ? await getValue() : '')
      if (!resolved) return

      await copyTextToClipboard(resolved)
      setState('copied')
      onCopySuccess?.(resolved)

      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setState('idle'), resetDelay)
    } catch (error) {
      console.warn('Copy failed', error)
      setState('error')
      onCopyError?.(error)

      if (timerRef.current) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setState('idle'), resetDelay)
    }
  }

  const Icon = state === 'copied' ? Check : state === 'error' ? AlertCircle : Copy
  const iconColor = state === 'copied'
    ? 'text-emerald-500'
    : state === 'error'
    ? 'text-red-400'
    : ''

  const title = state === 'copied'
    ? 'Copied!'
    : state === 'error'
    ? 'Copy failed'
    : ariaLabel

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleCopy}
      disabled={disabled}
      aria-label={title}
      title={title}
      className={cn(iconColor, className)}
      {...props}
    >
      <Icon style={{ width: iconSize, height: iconSize }} />
    </Button>
  )
}

export default CopyButton
