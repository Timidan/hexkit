import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { CheckCircle, XCircle, CircleNotch } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"

export type StepVisualStatus = "waiting" | "active" | "done" | "failed"

/**
 * StepStatusIcon — a step indicator whose icon pops on state change.
 *
 * Animation grammar from SmoothUI's AnimatedStepper: the completed check
 * scales in with a small bounce, other states crossfade; reduced motion
 * renders instant swaps. Used by the intent/bridge status timelines.
 */
export function StepStatusIcon({
  status,
  className,
}: {
  status: StepVisualStatus
  className?: string
}) {
  const reduce = useReducedMotion()

  const icon =
    status === "done" ? (
      <CheckCircle className="h-3 w-3 text-emerald-500" />
    ) : status === "failed" ? (
      <XCircle className="h-3 w-3 text-destructive" />
    ) : status === "active" ? (
      <CircleNotch className="h-3 w-3 animate-spin motion-reduce:animate-none text-primary" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    )

  return (
    <span className={cn("relative inline-flex h-3 w-3 shrink-0 items-center justify-center", className)}>
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={status}
          className="inline-flex items-center justify-center"
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.6 }}
          transition={reduce ? { duration: 0 } : { type: "spring", bounce: 0.2, duration: 0.3 }}
        >
          {icon}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export default StepStatusIcon
