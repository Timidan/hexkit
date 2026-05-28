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

import {
  MEZO_CONTRACTS,
  MUSD_GAS_COMPENSATION,
} from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import {
  buildBorrowAdjustBundle,
  buildBorrowCloseBundle,
} from "../sim/bundles/borrow";
import { useMezoBundleSimulation } from "../sim/useMezoBundleSimulation";
import type { SimulationBalances, SimulationRequest } from "../sim/types";
import { useMezoLegPipeline } from "../pipeline/useMezoLegPipeline";
import { MezoLegTimeline } from "../pipeline/MezoLegTimeline";
import { AssetInput } from "./AssetInput";
import { AssetIcon } from "./AssetIcon";
import { BalanceDeltaPreview } from "./BalanceDeltaPreview";

interface ManageTroveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collateralBtc: bigint | undefined;
  debtMusd: bigint | undefined;
}

type Mode = "adjust" | "close";

export function ManageTroveDialog({
  open,
  onOpenChange,
  collateralBtc,
  debtMusd,
}: ManageTroveDialogProps) {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>("adjust");

  const musdBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MUSD,
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && open },
  });

  const sortedTrovesHead = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.SortedTroves,
    abi: MEZO_ABIS.SortedTroves,
    functionName: "getFirst",
    query: { enabled: open },
  });
  const troveInsertHint = sortedTrovesHead.data as Address | undefined;

  // Adjust mode inputs. Positive collDelta = add coll; negative = withdraw.
  // Positive debtDelta = borrow more; negative = repay.
  const [collDelta, setCollDelta] = useState("0");
  const [debtDelta, setDebtDelta] = useState("0");

  useEffect(() => {
    if (!open) {
      setCollDelta("0");
      setDebtDelta("0");
      setMode("adjust");
    }
  }, [open]);

  const collDeltaWei = useMemo(() => {
    try {
      return parseUnits(collDelta || "0", 18);
    } catch {
      return 0n;
    }
  }, [collDelta]);
  const debtDeltaWei = useMemo(() => {
    try {
      return parseUnits(debtDelta || "0", 18);
    } catch {
      return 0n;
    }
  }, [debtDelta]);

  const adjustParams = useMemo(() => {
    if (!address) return null;
    const collDeposit = collDeltaWei > 0n ? collDeltaWei : 0n;
    const collWithdrawal = collDeltaWei < 0n ? -collDeltaWei : 0n;
    const debtChange = debtDeltaWei < 0n ? -debtDeltaWei : debtDeltaWei;
    const isDebtIncrease = debtDeltaWei >= 0n;
    return {
      account: address as Address,
      collDeposit,
      collWithdrawal,
      debtChange,
      isDebtIncrease,
      troveInsertHint,
    };
  }, [address, collDeltaWei, debtDeltaWei, troveInsertHint]);

  const closeParams = useMemo(() => {
    if (!address || debtMusd === undefined) return null;
    return { account: address as Address, debtMusd };
  }, [address, debtMusd]);

  const bundle = useMemo(() => {
    if (mode === "close" && closeParams) return buildBorrowCloseBundle(closeParams);
    if (mode === "adjust" && adjustParams) return buildBorrowAdjustBundle(adjustParams);
    return null;
  }, [mode, adjustParams, closeParams]);

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: 0n, after: 0n },
      musd: {
        before: (musdBalance.data as bigint | undefined) ?? 0n,
        after: (musdBalance.data as bigint | undefined) ?? 0n,
      },
      sMusd: { before: 0n, after: 0n },
      mezo: { before: 0n, after: 0n },
    }),
    [musdBalance.data],
  );

  const request: SimulationRequest | null = useMemo(() => {
    if (!bundle) return null;
    // Skip sim when adjust mode has no real change requested.
    if (mode === "adjust" && collDeltaWei === 0n && debtDeltaWei === 0n) return null;
    return { legs: bundle.legs, views: bundle.views, beforeBalances };
  }, [bundle, mode, collDeltaWei, debtDeltaWei, beforeBalances]);

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

  // Reset the pipeline on every fresh open so a stale set of `runs` from a
  // prior session can't be auto-resumed against the current legs.
  useEffect(() => {
    if (open) pipeline.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fingerprint the current bundle legs. If the user changes inputs after a
  // partial run, the legs no longer match — reset before executing.
  const legsFingerprint = useMemo(
    () => (bundle ? JSON.stringify(bundle.legs, bigintReplacer) : ""),
    [bundle],
  );

  const onExecute = async () => {
    if (!bundle || !sim.data) return;
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    const existingFp = pipeline.runs.length
      ? JSON.stringify(pipeline.runs.map((r) => r.spec), bigintReplacer)
      : "";
    const fpMatches = existingFp === legsFingerprint;
    const hasConfirmedLeg = pipeline.runs.some((r) => r.status === "confirmed");
    if (!fpMatches || pipeline.runs.length === 0 || !hasConfirmedLeg) {
      pipeline.start(bundle.legs, summaries);
    }
    await pipeline.executeAll();
  };

  const collText = collateralBtc !== undefined
    ? Number(formatUnits(collateralBtc, 18)).toLocaleString(undefined, {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6,
      })
    : "—";
  const debtText = debtMusd !== undefined
    ? Number(formatUnits(debtMusd, 18)).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : "—";

  const musdBalanceValue = (musdBalance.data as bigint | undefined) ?? 0n;
  const repayingMore = mode === "adjust" && debtDeltaWei < 0n && -debtDeltaWei > musdBalanceValue;
  // Liquity model: closeTrove pulls (debt - gas comp) from the user. The 200
  // MUSD gas comp lives in the protocol's Gas Pool and is burned automatically.
  const closeRepayAmount =
    debtMusd !== undefined && debtMusd > MUSD_GAS_COMPENSATION
      ? debtMusd - MUSD_GAS_COMPENSATION
      : 0n;
  const closeShort = mode === "close" && musdBalanceValue < closeRepayAmount;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-zinc-950/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Manage Trove</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Collateral</div>
            <div className="mt-0.5 font-mono text-zinc-200">{collText} BTC</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Debt</div>
            <div className="mt-0.5 font-mono text-zinc-200">{debtText} MUSD</div>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-1">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="adjust">Adjust</TabsTrigger>
            <TabsTrigger value="close">Close</TabsTrigger>
          </TabsList>
        </Tabs>

        {mode === "adjust" && (
          <div className="grid grid-cols-1 gap-2.5">
            <AssetInput
              label="BTC delta (+ add · − withdraw)"
              symbol="BTC"
              value={collDelta}
              onChange={setCollDelta}
              step="0.001"
            />
            <AssetInput
              label="MUSD delta (+ borrow · − repay)"
              symbol="MUSD"
              value={debtDelta}
              onChange={setDebtDelta}
              step="50"
              helper={
                debtDeltaWei < 0n
                  ? `Repaying ${formatUnits(-debtDeltaWei, 18)} MUSD · wallet ${Number(formatUnits(musdBalanceValue, 18)).toFixed(2)}`
                  : undefined
              }
            />
            {repayingMore && (
              <div className="text-[11px] text-rose-300/90">
                Repay amount exceeds wallet MUSD balance.
              </div>
            )}
          </div>
        )}

        {mode === "close" && (
          <div className="rounded-md border border-rose-500/20 bg-rose-500/[0.04] px-3 py-2.5 text-[12px] text-rose-200/90">
            Repays {Number(formatUnits(closeRepayAmount, 18)).toFixed(2)} MUSD from your wallet
            ({debtText} debt − 200 gas comp held by the protocol) and returns {collText} BTC
            collateral. The 200 MUSD in the Gas Pool is burned on clean close — never your cost.
            {closeShort && (
              <div className="mt-1.5 text-rose-300">
                Wallet has {Number(formatUnits(musdBalanceValue, 18)).toFixed(2)} MUSD —
                short by {Number(formatUnits(closeRepayAmount - musdBalanceValue, 18)).toFixed(2)} MUSD.
              </div>
            )}
          </div>
        )}

        {/* Sim preview */}
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
            troveBefore={debtMusd && collateralBtc ? { debt: debtMusd, coll: collateralBtc } : null}
            troveAfter={sim.data.outcome.trove}
            legsCount={sim.data.legs.length}
          />
        )}

        {pipeline.runs.length > 0 && (
          <MezoLegTimeline runs={pipeline.runs} onRetry={pipeline.retry} />
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <AssetIcon symbol="BTC" size="sm" noTooltip />
            <span>→</span>
            <AssetIcon symbol="MUSD" size="sm" noTooltip />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExecuting}>
              Cancel
            </Button>
            <Button
              onClick={onExecute}
              disabled={!sim.data || isExecuting || repayingMore || closeShort}
              variant={mode === "close" ? "destructive" : "default"}
            >
              {mode === "close" ? "Close Trove" : "Apply Adjustment"}
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
