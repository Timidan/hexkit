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

interface ManageSavingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sMusdBalance: bigint | undefined;
}

type Mode = "deposit" | "withdraw";

export function ManageSavingsDialog({
  open,
  onOpenChange,
  sMusdBalance,
}: ManageSavingsDialogProps) {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>("deposit");

  const musdBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MUSD,
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && open },
  });

  const [amount, setAmount] = useState("0");
  useEffect(() => {
    if (!open) {
      setAmount("0");
      setMode("deposit");
    }
  }, [open]);

  const amountWei = useMemo(() => {
    try {
      return parseUnits(amount || "0", 18);
    } catch {
      return 0n;
    }
  }, [amount]);

  const legs: MezoLegSpec[] = useMemo(() => {
    if (amountWei <= 0n) return [];
    if (mode === "deposit") {
      return [
        {
          type: "approveErc20",
          token: MEZO_CONTRACTS.MUSD,
          spender: MEZO_CONTRACTS.sMUSD,
          amount: amountWei,
          tokenLabel: "MUSD",
        },
        { type: "sMusdDeposit", amount: amountWei },
      ];
    }
    return [{ type: "sMusdWithdraw", amount: amountWei }];
  }, [mode, amountWei]);

  const musdBalanceValue = (musdBalance.data as bigint | undefined) ?? 0n;
  const sMusdBalanceValue = sMusdBalance ?? 0n;

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: 0n, after: 0n },
      musd: { before: musdBalanceValue, after: musdBalanceValue },
      sMusd: { before: sMusdBalanceValue, after: sMusdBalanceValue },
      mezo: { before: 0n, after: 0n },
    }),
    [musdBalanceValue, sMusdBalanceValue],
  );

  const request: SimulationRequest | null = useMemo(() => {
    if (legs.length === 0 || !address) return null;
    return {
      legs,
      views: [
        { kind: "musdBalanceOf", account: address as Address },
        { kind: "sMusdBalanceOf", account: address as Address },
      ],
      beforeBalances,
    };
  }, [legs, address, beforeBalances]);

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

  const depositExceeds = mode === "deposit" && amountWei > musdBalanceValue;
  const withdrawExceeds = mode === "withdraw" && amountWei > sMusdBalanceValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-zinc-950/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Manage sMUSD savings</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">Wallet MUSD</div>
            <div className="mt-0.5 font-mono text-zinc-200">
              {Number(formatUnits(musdBalanceValue, 18)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">sMUSD balance</div>
            <div className="mt-0.5 font-mono text-zinc-200">
              {Number(formatUnits(sMusdBalanceValue, 18)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-1">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="deposit">Deposit</TabsTrigger>
            <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-1 gap-2.5">
          <AssetInput
            label={mode === "deposit" ? "MUSD to deposit" : "MUSD to withdraw"}
            symbol="MUSD"
            value={amount}
            onChange={setAmount}
            step="100"
            balance={mode === "deposit" ? musdBalanceValue : sMusdBalanceValue}
            helper={mode === "deposit"
              ? "Direct yield · no gauge stake in v1"
              : "Vault burns the matching sMUSD shares and returns MUSD."
            }
          />
          {depositExceeds && (
            <div className="text-[11px] text-rose-300/90">Deposit exceeds wallet MUSD balance.</div>
          )}
          {withdrawExceeds && (
            <div className="text-[11px] text-rose-300/90">Withdraw exceeds sMUSD balance.</div>
          )}
        </div>

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
            legsCount={sim.data.legs.length}
          />
        )}

        {pipeline.runs.length > 0 && (
          <MezoLegTimeline runs={pipeline.runs} onRetry={pipeline.retry} />
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <AssetIcon symbol="MUSD" size="sm" noTooltip />
            <span>→</span>
            <AssetIcon symbol="sMUSD" size="sm" noTooltip />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExecuting}>
              Cancel
            </Button>
            <Button
              onClick={onExecute}
              disabled={!sim.data || isExecuting || depositExceeds || withdrawExceeds || legs.length === 0}
            >
              {mode === "deposit" ? "Deposit" : "Withdraw"}
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
