import { useEffect, useMemo, useState } from "react";
import { CircleNotch, CheckCircle, XCircle, Warning } from "@phosphor-icons/react";
import type { Hex } from "viem";
import { useIntentOrderStatus } from "./useIntentOrderStatus";
import {
  readDestinationTxHash,
  readSolverAddress,
  type CanonicalOrderState,
} from "./intentsApi";

type StepKey = "open" | "signed" | "delivered" | "settled";
type StepStatus = "waiting" | "active" | "done" | "failed";

interface Step {
  key: StepKey;
  label: string;
  hint: string;
}

const STEPS: Step[] = [
  { key: "open", label: "Opened", hint: "Tokens escrowed on origin" },
  { key: "signed", label: "Signed", hint: "Solver picked up the order" },
  { key: "delivered", label: "Delivered", hint: "Output delivered on destination" },
  { key: "settled", label: "Settled", hint: "Proof verified, escrow released" },
];

function reduceSteps(
  state: CanonicalOrderState,
  nowSec: number,
  fillDeadlineSec: number,
): Record<StepKey, StepStatus> {
  switch (state) {
    case "Settled":
      return { open: "done", signed: "done", delivered: "done", settled: "done" };
    case "Delivered":
      return { open: "done", signed: "done", delivered: "done", settled: "active" };
    case "Signed":
      return { open: "done", signed: "done", delivered: "active", settled: "waiting" };
    case "Refunded":
    case "Failed":
    case "Expired":
      return { open: "done", signed: "failed", delivered: "waiting", settled: "waiting" };
    case "Submitted":
    case "Open":
    case "Unknown":
    default:
      // Past fill deadline without a Signed pickup → flag as missed.
      if (nowSec > fillDeadlineSec) {
        return { open: "done", signed: "failed", delivered: "waiting", settled: "waiting" };
      }
      return { open: "done", signed: "active", delivered: "waiting", settled: "waiting" };
  }
}

interface IntentStatusTimelineProps {
  onChainOrderId?: Hex;
  catalystOrderId?: string;
  /** Unix seconds. Fill must happen before this. */
  fillDeadline: number;
  /** Unix seconds. Refund unlocks after this. */
  expires: number;
  openTxHash?: Hex;
  originExplorerUrl?: string;
  destinationExplorerUrl?: string;
  onRefund?: () => Promise<void> | void;
  refundDisabled?: boolean;
  refundPending?: boolean;
}

export function IntentStatusTimeline({
  onChainOrderId,
  catalystOrderId,
  fillDeadline,
  expires,
  openTxHash,
  originExplorerUrl,
  destinationExplorerUrl,
  onRefund,
  refundDisabled = false,
  refundPending = false,
}: IntentStatusTimelineProps) {
  const { status, state, rawLabel } = useIntentOrderStatus({
    onChainOrderId,
    catalystOrderId,
  });

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const steps = useMemo(
    () => reduceSteps(state, nowSec, fillDeadline),
    [state, nowSec, fillDeadline],
  );

  const fillSecondsLeft = Math.max(0, fillDeadline - nowSec);
  const expireSecondsLeft = Math.max(0, expires - nowSec);
  const canRefund = nowSec >= expires;

  return (
    <div className="space-y-3 rounded-md border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{rawLabel}</span>
        <span className="font-mono tabular-nums text-muted-foreground">
          {canRefund
            ? "Refund window open"
            : fillSecondsLeft > 0
              ? `${formatSeconds(fillSecondsLeft)} to fill`
              : `${formatSeconds(expireSecondsLeft)} until refund`}
        </span>
      </div>

      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((s) => (
          <StepPill key={s.key} step={s} status={steps[s.key]} />
        ))}
      </ol>

      {(() => {
        const destTx = readDestinationTxHash(status);
        const solver = readSolverAddress(status);
        if (!openTxHash && !destTx && !solver) return null;
        return (
          <div className="flex flex-wrap gap-3 border-t border-border/30 pt-2 text-[11px] text-muted-foreground">
            {openTxHash && originExplorerUrl && (
              <a
                href={`${originExplorerUrl}/tx/${openTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Origin tx ↗
              </a>
            )}
            {destTx && destinationExplorerUrl && (
              <a
                href={`${destinationExplorerUrl}/tx/${destTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Destination tx ↗
              </a>
            )}
            {solver && (
              <span>solver: <span className="font-mono">{solver}</span></span>
            )}
          </div>
        );
      })()}

      {onRefund && (
        <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Warning className="h-3 w-3 text-yellow-500" />
            Refund becomes callable after expiry; anyone can trigger it.
          </span>
          <button
            type="button"
            onClick={() => void onRefund()}
            disabled={!canRefund || refundDisabled || refundPending}
            className="rounded border border-border/40 bg-muted/30 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {refundPending ? "Refunding…" : "Refund"}
          </button>
        </div>
      )}
    </div>
  );
}

function StepPill({ step, status }: { step: Step; status: StepStatus }) {
  const icon =
    status === "done" ? (
      <CheckCircle className="h-3 w-3 text-emerald-500" />
    ) : status === "failed" ? (
      <XCircle className="h-3 w-3 text-destructive" />
    ) : status === "active" ? (
      <CircleNotch className="h-3 w-3 animate-spin text-primary" />
    ) : (
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
    );

  const tone =
    status === "done"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : status === "failed"
        ? "border-destructive/40 bg-destructive/5"
        : status === "active"
          ? "border-primary/30 bg-primary/5"
          : "border-border/30 bg-muted/10";

  return (
    <li
      className={`flex flex-col gap-0.5 rounded-md border px-2 py-1.5 text-[11px] ${tone}`}
    >
      <span className="flex items-center gap-1 font-medium text-foreground">
        {icon}
        {step.label}
      </span>
      <span className="text-[10px] text-muted-foreground/80">{step.hint}</span>
    </li>
  );
}

function formatSeconds(s: number): string {
  if (s <= 0) return "0s";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}s`;
  if (m < 60) return `${m}m ${sec.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m`;
}
