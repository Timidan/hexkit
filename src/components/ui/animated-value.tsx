import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

/**
 * AnimatedValue — digit-roll display for pre-formatted numeric strings.
 *
 * Mechanic adapted from SmoothUI's NumberFlow (per-digit translateY roll,
 * same 300ms cubic-bezier(0.22,1,0.36,1) feel), generalized so it accepts any
 * formatted string ("$1,234.56", "3m 12s", "68.78%"): digits that changed
 * roll in from the direction of change, punctuation and letters swap
 * instantly. Layout-stable when paired with tabular-nums.
 */
export function AnimatedValue({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const reduce = useReducedMotion()
  const previousRef = React.useRef(value)
  const previous = previousRef.current

  React.useEffect(() => {
    previousRef.current = value
  }, [value])

  if (reduce || previous === value) {
    // No change (or reduced motion): render plain to avoid remount churn.
    return (
      <span className={cn("tabular-nums", className)}>
        {value}
      </span>
    )
  }

  const numeric = Number.parseFloat(value.replace(/[^0-9.-]/g, ""))
  const previousNumeric = Number.parseFloat(previous.replace(/[^0-9.-]/g, ""))
  const increasing =
    Number.isFinite(numeric) && Number.isFinite(previousNumeric)
      ? numeric >= previousNumeric
      : true

  return (
    <span className={cn("inline-flex overflow-hidden tabular-nums", className)} aria-label={value}>
      {value.split("").map((ch, i) => {
        const changed = previous[i] !== ch
        if (!/\d/.test(ch) || !changed) {
          return (
            <span key={`${i}-${ch}`} aria-hidden="true" className="inline-block">
              {ch === " " ? " " : ch}
            </span>
          )
        }
        return (
          <motion.span
            key={`${i}-${ch}`}
            aria-hidden="true"
            className="inline-block"
            initial={{ y: increasing ? "0.7em" : "-0.7em", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {ch}
          </motion.span>
        )
      })}
    </span>
  )
}

export default AnimatedValue
