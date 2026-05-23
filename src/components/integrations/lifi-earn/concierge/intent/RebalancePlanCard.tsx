import { type ReactElement, useEffect, useMemo } from "react";
import {
  CircleNotch,
  CheckCircle,
  XCircle,
  Warning,
  Play,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { readContract as wagmiReadContract } from "@wagmi/core";
import { parseAbi, type Address } from "viem";
import { useConfig } from "wagmi";
import { Button } from "../../../../ui/button";
import ChainIcon from "../../../../icons/ChainIcon";
import { IntentStatusTimeline } from "../../IntentStatusTimeline";
import { useIntentOrderStatus } from "../../useIntentOrderStatus";
import { isDeliveredOrSettled } from "../../intentsApi";
import { SUPPORTED_CHAINS } from "../../../../../utils/chains";
import { describeDegradeReason } from "./intentLegs";
import type { IntentLegRun } from "./useIntentLegPipeline";
import type { IntentLegSpec } from "./intentLegs";
import type { EarnVault } from "../../types";

const erc20BalanceAbi = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
]);

function formatRaw(raw: bigint, decimals: number): string {
  const whole = raw / 10n ** BigInt(decimals);
  const frac = raw % 10n ** BigInt(decimals);
  const fracStr = frac
    .toString()
    .padStart(decimals, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
}

interface RebalancePlanCardProps {
  plannedSpecs: IntentLegSpec[];
  runs: IntentLegRun[];
  routingMode: "per-asset" | "consolidate";
  isConnected: boolean;
  onQuoteAll: () => void;
  onOpenAll: () => void;
  onRetry: (legId: string) => void;
  onRefund: (legId: string) => void;
  onDeposit: (legId: string) => void;
  /**
   * Fires when the leg's status poll first reports Delivered/Settled. Lets
   * the pipeline hook stash the on-chain delivered amount on the run before
   * the user clicks "Deposit".
   */
  onMarkDelivered: (legId: string, deliveredAmount: bigint) => void;
  onPickVault?: (vault: EarnVault) => void;
}

export function RebalancePlanCard({
  plannedSpecs,
  runs,
  routingMode,
  isConnected,
  onQuoteAll,
  onOpenAll,
  onRetry,
  onRefund,
  onDeposit,
  onMarkDelivered,
  onPickVault,
}: RebalancePlanCardProps) {
  // Show planned specs until the pipeline starts, then switch to live runs.
  const rows = useMemo(() => {
    if (runs.length > 0) return runs;
    return plannedSpecs.map<IntentLegRun>((spec) => ({
      spec,
      status: spec.status === "degraded" ? "degraded" : "planned",
    }));
  }, [plannedSpecs, runs]);

  const executable = rows.filter((r) => r.status !== "degraded");
  const allQuoted =
    executable.length > 0 && executable.every((r) => r.status === "quoted");
  const anyOpen = runs.some(
    (r) =>
      r.status === "open" ||
      r.status === "deposit-quoting" ||
      r.status === "deposit-approving" ||
      r.status === "deposit-signing" ||
      r.status === "deposit-failed" ||
      r.status === "deposit-done",
  );
  const anyQuoted = runs.some((r) => r.status === "quoted");
  // Sequential per-leg deposit prompts — disable deposit buttons on other
  // legs while one is mid-flight (wallet UX).
  const depositBusyLegId = runs.find(
    (r) =>
      r.status === "deposit-quoting" ||
      r.status === "deposit-approving" ||
      r.status === "deposit-signing",
  )?.spec.id;

  return (
    <div className="space-y-3 rounded-lg border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            Rebalance plan ({routingMode === "consolidate" ? "consolidate" : "per-asset"})
          </p>
          <p className="text-xs text-muted-foreground">
            {executable.length} executable leg{executable.length === 1 ? "" : "s"}
            {rows.length > executable.length && (
              <> · {rows.length - executable.length} skipped</>
            )}
          </p>
        </div>
        <PipelineControls
          isConnected={isConnected}
          hasPlanned={executable.some((r) => r.status === "planned")}
          allQuoted={allQuoted}
          anyQuoted={anyQuoted}
          anyOpen={anyOpen}
          onQuoteAll={onQuoteAll}
          onOpenAll={onOpenAll}
        />
      </div>

      <div className="divide-y divide-border/30">
        {rows.map((run) => (
          <LegRow
            key={run.spec.id}
            run={run}
            depositBusy={
              depositBusyLegId !== undefined && depositBusyLegId !== run.spec.id
            }
            onRetry={() => onRetry(run.spec.id)}
            onRefund={() => onRefund(run.spec.id)}
            onDeposit={() => onDeposit(run.spec.id)}
            onMarkDelivered={onMarkDelivered}
            onPickVault={onPickVault}
          />
        ))}
      </div>
    </div>
  );
}

function PipelineControls({
  isConnected,
  hasPlanned,
  allQuoted,
  anyQuoted,
  anyOpen,
  onQuoteAll,
  onOpenAll,
}: {
  isConnected: boolean;
  hasPlanned: boolean;
  allQuoted: boolean;
  anyQuoted: boolean;
  anyOpen: boolean;
  onQuoteAll: () => void;
  onOpenAll: () => void;
}) {
  if (!isConnected) {
    return (
      <span className="text-xs text-muted-foreground">
        Connect wallet to execute
      </span>
    );
  }
  if (anyOpen) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <CheckCircle className="h-3 w-3" />
        Orders open — tracking
      </span>
    );
  }
  if (anyQuoted) {
    return (
      <Button
        size="sm"
        onClick={onOpenAll}
        disabled={!allQuoted}
        className="h-7 gap-1 text-xs"
      >
        <Play size={12} weight="fill" /> Open {allQuoted ? "all" : "ready"} on-chain
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      onClick={onQuoteAll}
      disabled={!hasPlanned}
      className="h-7 gap-1 text-xs"
    >
      <ArrowsClockwise size={12} weight="bold" /> Quote all legs
    </Button>
  );
}

function LegRow({
  run,
  depositBusy,
  onRetry,
  onRefund,
  onDeposit,
  onMarkDelivered,
  onPickVault,
}: {
  run: IntentLegRun;
  depositBusy: boolean;
  onRetry: () => void;
  onRefund: () => void;
  onDeposit: () => void;
  onMarkDelivered: (legId: string, deliveredAmount: bigint) => void;
  onPickVault?: (vault: EarnVault) => void;
}) {
  const { spec } = run;
  const sourceLabel = `${spec.source.amountDecimal} ${spec.source.symbol ?? "?"}`;
  const destinationLabel = spec.destination.vault?.name
    ? spec.destination.vault.name
    : spec.destination.outputSymbol ?? "?";
  const config = useConfig();

  const explorerByChain = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of SUPPORTED_CHAINS) {
      if (c.explorerUrl) map.set(c.id, c.explorerUrl);
    }
    return map;
  }, []);

  // Share the React Query key with IntentStatusTimeline — duplicate hook
  // calls with the same orderId hit the same cache entry, no duplicate poll.
  const timelineActive = isTimelineActive(run.status);
  const { state: orderState } = useIntentOrderStatus({
    onChainOrderId: timelineActive ? run.orderId : undefined,
    enabled: timelineActive,
  });
  const delivered = isDeliveredOrSettled(orderState);

  // Once delivered, snap the on-chain balance delta into the run so the
  // deposit step can use the actual amount the solver delivered.
  useEffect(() => {
    if (!delivered || run.status !== "open") return;
    if (run.deliveredAmount !== undefined && run.deliveredAmount > 0n) return;
    let cancelled = false;
    void (async () => {
      try {
        const post = (await wagmiReadContract(config, {
          address: spec.destination.outputToken,
          abi: erc20BalanceAbi,
          functionName: "balanceOf",
          args: [spec.destination.recipient],
          chainId: spec.destination.chainId,
        })) as bigint;
        if (cancelled) return;
        const pre = run.predeliveryBalance ?? 0n;
        const delta = post > pre ? post - pre : post;
        if (delta > 0n) onMarkDelivered(spec.id, delta);
      } catch {
        // Best-effort. The deposit handler will re-read balance on click.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    delivered,
    run.status,
    run.deliveredAmount,
    run.predeliveryBalance,
    spec.destination.outputToken,
    spec.destination.recipient,
    spec.destination.chainId,
    spec.id,
    config,
    onMarkDelivered,
  ]);

  return (
    <div className="space-y-2 py-2.5">
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-1.5 text-sm">
          <ChainIcon chainId={spec.source.chainId} size={14} rounded={999} />
          <span className="font-mono tabular-nums">{sourceLabel}</span>
        </div>
        <span className="text-muted-foreground/60">→</span>
        <div className="flex items-center gap-1.5 text-sm">
          <ChainIcon chainId={spec.destination.chainId} size={14} rounded={999} />
          <span className="font-medium">{destinationLabel}</span>
        </div>
        <div className="ml-auto">
          <LegStatusPill status={run.status} />
        </div>
      </div>

      {run.error && (
        <p className="flex items-start gap-1 rounded-md border border-destructive/40 bg-destructive/5 p-1.5 text-xs text-destructive">
          <XCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
          <span className="break-words">{run.error}</span>
        </p>
      )}

      {run.status === "degraded" && spec.degradedReason && (
        <p className="flex items-start gap-1 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-1.5 text-xs text-yellow-600">
          <Warning className="h-3 w-3 shrink-0 translate-y-[1px]" />
          {describeDegradeReason(spec.degradedReason)}
        </p>
      )}

      {timelineActive && run.order && (
        <IntentStatusTimeline
          onChainOrderId={run.orderId}
          fillDeadline={run.order.fillDeadline}
          expires={run.order.expires}
          openTxHash={run.openTxHash}
          originExplorerUrl={explorerByChain.get(spec.source.chainId)}
          destinationExplorerUrl={explorerByChain.get(spec.destination.chainId)}
          onRefund={onRefund}
          refundPending={run.status === "refunding"}
        />
      )}

      {delivered && run.status !== "deposit-done" && (
        <div className="space-y-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-400">
          <p className="font-medium">
            Delivered on {explorerLabel(spec.destination.chainId)}.
            {run.deliveredAmount && spec.destination.outputSymbol && (
              <span className="ml-1 font-mono text-[10px] opacity-80">
                ({formatRaw(run.deliveredAmount, decimalsFor(run, spec))}{" "}
                {spec.destination.outputSymbol})
              </span>
            )}
          </p>
          {run.depositError && (
            <p className="flex items-start gap-1 rounded border border-destructive/40 bg-destructive/5 p-1.5 text-destructive">
              <XCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
              <span className="break-words">{run.depositError}</span>
            </p>
          )}
          <DepositButton
            status={run.status}
            disabled={depositBusy}
            onClick={onDeposit}
          />
        </div>
      )}

      {run.status === "deposit-done" && (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-1.5 text-center text-xs text-emerald-400">
          Deposit confirmed.
          {run.depositTxHash &&
            explorerByChain.get(spec.destination.chainId) && (
              <>
                {" "}
                <a
                  href={`${explorerByChain.get(spec.destination.chainId)}/tx/${run.depositTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  View tx
                </a>
              </>
            )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        {run.status === "failed" && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded border border-border/40 bg-muted/30 px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted/60"
          >
            Retry quote
          </button>
        )}
        {/*
          Open vault drawer was previously shown at status === "open" — that
          fired *before* the funds actually landed. Gate it on delivery so
          the user can only navigate to the vault drawer once it would be
          actionable (and only as an escape hatch from the auto-deposit).
         */}
        {onPickVault &&
          spec.destination.vault &&
          delivered &&
          run.status !== "deposit-done" && (
            <button
              type="button"
              onClick={() => onPickVault(spec.destination.vault)}
              className="rounded border border-border/40 bg-muted/30 px-2 py-0.5 font-medium text-foreground transition-colors hover:bg-muted/60"
            >
              Open vault drawer
            </button>
          )}
        {run.quote?.solver && (
          <span>solver: <span className="font-mono">{run.quote.solver}</span></span>
        )}
      </div>
    </div>
  );
}

function DepositButton({
  status,
  disabled,
  onClick,
}: {
  status: IntentLegRun["status"];
  disabled: boolean;
  onClick: () => void;
}) {
  if (status === "deposit-quoting") {
    return (
      <Button size="sm" disabled className="h-7 w-full text-[11px]">
        <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
        Fetching deposit route…
      </Button>
    );
  }
  if (status === "deposit-approving") {
    return (
      <Button size="sm" disabled className="h-7 w-full text-[11px]">
        <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
        Approving…
      </Button>
    );
  }
  if (status === "deposit-signing") {
    return (
      <Button size="sm" disabled className="h-7 w-full text-[11px]">
        <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
        Depositing…
      </Button>
    );
  }
  return (
    <Button
      size="sm"
      className="h-7 w-full text-[11px]"
      onClick={onClick}
      disabled={disabled}
    >
      {status === "deposit-failed" ? "Retry deposit" : "Deposit into vault"}
    </Button>
  );
}

// The status pill renders during all of these — keep timeline visible the
// whole time so the user sees the order lifecycle through to settlement.
function isTimelineActive(status: IntentLegRun["status"]): boolean {
  return (
    status === "open" ||
    status === "refunding" ||
    status === "deposit-quoting" ||
    status === "deposit-approving" ||
    status === "deposit-signing" ||
    status === "deposit-failed" ||
    status === "deposit-done"
  );
}

function explorerLabel(chainId: number): string {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`;
}

function decimalsFor(run: IntentLegRun, spec: IntentLegSpec): number {
  // The spec doesn't carry destination decimals — try to find them off the
  // vault's underlyingTokens (matched by address), otherwise default to 18.
  const addr = spec.destination.outputToken.toLowerCase();
  const tok = spec.destination.vault?.underlyingTokens?.find(
    (t) => t.address.toLowerCase() === addr,
  );
  void run; // run unused here; signature kept symmetric for future use.
  return tok?.decimals ?? 18;
}

function LegStatusPill({ status }: { status: IntentLegRun["status"] }) {
  const config: Record<IntentLegRun["status"], { label: string; cls: string; icon?: ReactElement }> = {
    planned: {
      label: "Planned",
      cls: "border-border/40 bg-muted/20 text-muted-foreground",
    },
    degraded: {
      label: "Skipped",
      cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-500",
    },
    quoting: {
      label: "Quoting",
      cls: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    },
    quoted: {
      label: "Quoted",
      cls: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    },
    approving: {
      label: "Approving",
      cls: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    },
    signing: {
      label: "Signing",
      cls: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    },
    open: {
      label: "Opened",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
      icon: <CheckCircle className="h-3 w-3" />,
    },
    "deposit-quoting": {
      label: "Quoting deposit",
      cls: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    },
    "deposit-approving": {
      label: "Approving",
      cls: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    },
    "deposit-signing": {
      label: "Depositing",
      cls: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    },
    "deposit-done": {
      label: "Deposited",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
      icon: <CheckCircle className="h-3 w-3" />,
    },
    "deposit-failed": {
      label: "Deposit failed",
      cls: "border-destructive/40 bg-destructive/5 text-destructive",
      icon: <XCircle className="h-3 w-3" />,
    },
    refunding: {
      label: "Refunding",
      cls: "border-primary/40 bg-primary/10 text-primary",
      icon: <CircleNotch className="h-3 w-3 animate-spin" />,
    },
    refunded: {
      label: "Refunded",
      cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-500",
    },
    failed: {
      label: "Failed",
      cls: "border-destructive/40 bg-destructive/5 text-destructive",
      icon: <XCircle className="h-3 w-3" />,
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${c.cls}`}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

