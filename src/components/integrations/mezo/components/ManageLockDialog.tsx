import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import type { MezoLegSpec } from "../pipeline/mezoLegs";
import { useMezoBundleSimulation } from "../sim/useMezoBundleSimulation";
import type { SimulationBalances, SimulationRequest } from "../sim/types";
import { useMezoLegPipeline } from "../pipeline/useMezoLegPipeline";
import { MezoLegTimeline } from "../pipeline/MezoLegTimeline";
import { AssetInput } from "./AssetInput";
import { AssetIcon } from "./AssetIcon";
import { BalanceDeltaPreview } from "./BalanceDeltaPreview";

interface ManageLockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenId: bigint | undefined;
  lockedAmount: bigint | undefined;
  lockEnd: bigint | undefined;
}

type Mode = "topup" | "extend";

const SECONDS_PER_DAY = 86_400n;
const SEVEN_DAYS = 7n * SECONDS_PER_DAY;

export function ManageLockDialog({
  open,
  onOpenChange,
  tokenId,
  lockedAmount,
  lockEnd,
}: ManageLockDialogProps) {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>("topup");

  const mezoBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MEZO,
    abi: MEZO_ABIS.MEZO,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && open },
  });

  const [topupAmount, setTopupAmount] = useState("0");
  const [extendDays, setExtendDays] = useState("7");

  useEffect(() => {
    if (!open) {
      setTopupAmount("0");
      setExtendDays("7");
      setMode("topup");
    }
  }, [open]);

  const topupWei = useMemo(() => {
    try {
      return parseUnits(topupAmount || "0", 18);
    } catch {
      return 0n;
    }
  }, [topupAmount]);

  const extendSeconds = useMemo(() => {
    const days = Number(extendDays || "0");
    if (!Number.isFinite(days) || days <= 0) return 0n;
    return BigInt(Math.floor(days)) * SECONDS_PER_DAY;
  }, [extendDays]);

  // Build legs based on mode
  const legs: MezoLegSpec[] = useMemo(() => {
    if (!tokenId || tokenId === 0n) return [];
    if (mode === "topup") {
      if (topupWei <= 0n) return [];
      return [
        {
          type: "approveErc20",
          token: MEZO_CONTRACTS.MEZO,
          spender: MEZO_CONTRACTS.veMEZO,
          amount: topupWei,
          tokenLabel: "MEZO",
        },
        { type: "veMezoIncreaseAmount", tokenId, amount: topupWei },
      ];
    }
    // extend — Aerodrome-style VotingEscrow expects a relative lock duration
    // from `block.timestamp`. To extend the current end by `extendSeconds`,
    // we send `(currentLockEnd + extendSeconds) - nowSeconds`.
    if (extendSeconds < SEVEN_DAYS) return [];
    const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
    const targetEnd = (lockEnd ?? nowSeconds) + extendSeconds;
    if (targetEnd <= nowSeconds) return [];
    const relativeDuration = targetEnd - nowSeconds;
    return [
      {
        type: "veMezoIncreaseUnlockTime",
        tokenId,
        lockDuration: relativeDuration,
      },
    ];
  }, [mode, tokenId, topupWei, extendSeconds, lockEnd]);

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: 0n, after: 0n },
      musd: { before: 0n, after: 0n },
      sMusd: { before: 0n, after: 0n },
      mezo: {
        before: (mezoBalance.data as bigint | undefined) ?? 0n,
        after: (mezoBalance.data as bigint | undefined) ?? 0n,
      },
    }),
    [mezoBalance.data],
  );

  const request: SimulationRequest | null = useMemo(() => {
    if (legs.length === 0 || !address) return null;
    const views: SimulationRequest["views"] = [
      { kind: "mezoBalanceOf", account: address as Address },
    ];
    if (tokenId && tokenId > 0n) {
      views.push({ kind: "veMezoLockedLiteral", tokenId });
      views.push({ kind: "veMezoBalanceOfNFTLiteral", tokenId });
    }
    return { legs, views, beforeBalances };
  }, [legs, address, beforeBalances, tokenId]);

  const [debouncedRequest, setDebouncedRequest] = useState<SimulationRequest | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRequest(request), 350);
    return () => clearTimeout(t);
  }, [request]);

  const sim = useMezoBundleSimulation(debouncedRequest, { enabled: open });

  const pipeline = useMezoLegPipeline();
  const isExecuting = pipeline.runs.some(
    (r) => r.status === "signing" || r.status === "confirming",
  );

  useEffect(() => {
    if (open) pipeline.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const legsFingerprint = useMemo(
    () => JSON.stringify(legs, bigintReplacer),
    [legs],
  );

  const onExecute = async () => {
    if (!sim.data || legs.length === 0) return;
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    const existingFp = pipeline.runs.length
      ? JSON.stringify(pipeline.runs.map((r) => r.spec), bigintReplacer)
      : "";
    const fpMatches = existingFp === legsFingerprint;
    const hasConfirmedLeg = pipeline.runs.some((r) => r.status === "confirmed");
    if (!fpMatches || pipeline.runs.length === 0 || !hasConfirmedLeg) {
      pipeline.start(legs, summaries);
    }
    await pipeline.executeAll();
  };

  const mezoBalanceValue = (mezoBalance.data as bigint | undefined) ?? 0n;
  const topupExceeds = mode === "topup" && topupWei > mezoBalanceValue;

  const lockedText = lockedAmount !== undefined
    ? Number(formatUnits(lockedAmount, 18)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      })
    : "—";
  const unlockText = lockEnd && lockEnd > 0n
    ? new Date(Number(lockEnd) * 1000).toLocaleDateString()
    : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-zinc-950/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Manage veMEZO lock</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Locked MEZO</div>
            <div className="mt-0.5 font-mono text-zinc-200">{lockedText}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Unlocks</div>
            <div className="mt-0.5 font-mono text-zinc-200">{unlockText}</div>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-1">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="topup">Top up</TabsTrigger>
            <TabsTrigger value="extend">Extend lock</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "topup" && (
          <div className="grid grid-cols-1 gap-2.5">
            <AssetInput
              label="Add MEZO to existing lock"
              symbol="MEZO"
              value={topupAmount}
              onChange={setTopupAmount}
              step="10"
              balance={mezoBalanceValue}
              helper="Voting power increases proportionally; unlock time stays the same."
            />
            {topupExceeds && (
              <div className="text-[11px] text-rose-300/90">
                Top-up exceeds wallet MEZO balance.
              </div>
            )}
          </div>
        )}

        {mode === "extend" && (
          <div className="grid grid-cols-1 gap-2.5">
            <AssetInput
              label="Extend by (days)"
              symbol="MEZO"
              value={extendDays}
              onChange={setExtendDays}
              step="7"
              helper="Voting power = locked × (newDuration / maxDuration). Resets the decay curve."
            />
          </div>
        )}

        {sim.isFetching && (
          <div className="text-[11px] text-zinc-500">Simulating…</div>
        )}
        {sim.error && (
          <div className="text-[11px] text-rose-300/90">
            Simulation error: {sim.error.message}
          </div>
        )}
        {sim.data && (
          <BalanceDeltaPreview
            balances={sim.data.outcome.balances}
            veMezoAfter={sim.data.outcome.veMezo}
            legsCount={sim.data.legs.length}
          />
        )}

        {pipeline.runs.length > 0 && (
          <MezoLegTimeline runs={pipeline.runs} onRetry={pipeline.retry} />
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <AssetIcon symbol="MEZO" size="sm" noTooltip />
            <span>→</span>
            <AssetIcon symbol="veMEZO" size="sm" noTooltip />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExecuting}>
              Cancel
            </Button>
            <Button
              onClick={onExecute}
              disabled={!sim.data || isExecuting || topupExceeds || legs.length === 0}
            >
              {mode === "topup" ? "Top up lock" : "Extend lock"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
