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

interface ManageLiquidityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** LP token balance the user holds in the MUSD/BTC pool. */
  lpBalance: bigint | undefined;
}

type Mode = "add" | "remove";

const DEADLINE_BUFFER = 20n * 60n; // 20 min

export function ManageLiquidityDialog({
  open,
  onOpenChange,
  lpBalance,
}: ManageLiquidityDialogProps) {
  const { address } = useAccount();
  const [mode, setMode] = useState<Mode>("add");

  const musdBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MUSD,
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && open },
  });
  const btcBalanceErc20 = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.BTC,
    abi: MEZO_ABIS.MUSD, // ERC-20 surface
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && open },
  });

  const [musdAmount, setMusdAmount] = useState("0");
  const [btcAmount, setBtcAmount] = useState("0");
  const [lpAmount, setLpAmount] = useState("0");

  useEffect(() => {
    if (!open) {
      setMusdAmount("0");
      setBtcAmount("0");
      setLpAmount("0");
      setMode("add");
    }
  }, [open]);

  const musdWei = useMemo(() => {
    try { return parseUnits(musdAmount || "0", 18); } catch { return 0n; }
  }, [musdAmount]);
  const btcWei = useMemo(() => {
    try { return parseUnits(btcAmount || "0", 18); } catch { return 0n; }
  }, [btcAmount]);
  const lpWei = useMemo(() => {
    try { return parseUnits(lpAmount || "0", 18); } catch { return 0n; }
  }, [lpAmount]);

  const deadline = useMemo(
    () => BigInt(Math.floor(Date.now() / 1000)) + DEADLINE_BUFFER,
    [musdWei, btcWei, lpWei, mode],
  );

  const legs: MezoLegSpec[] = useMemo(() => {
    if (!address) return [];
    if (mode === "add") {
      if (musdWei <= 0n || btcWei <= 0n) return [];
      return [
        {
          type: "approveErc20",
          token: MEZO_CONTRACTS.MUSD,
          spender: MEZO_CONTRACTS.Router,
          amount: musdWei,
          tokenLabel: "MUSD",
        },
        {
          type: "approveErc20",
          token: MEZO_CONTRACTS.BTC,
          spender: MEZO_CONTRACTS.Router,
          amount: btcWei,
          tokenLabel: "BTC",
        },
        {
          type: "routerAddLiquidity",
          tokenA: MEZO_CONTRACTS.MUSD,
          tokenB: MEZO_CONTRACTS.BTC,
          stable: false,
          amountADesired: musdWei,
          amountBDesired: btcWei,
          amountAMin: 0n,
          amountBMin: 0n,
          to: address as Address,
          deadline,
        },
      ];
    }
    // remove
    if (lpWei <= 0n) return [];
    return [
      {
        type: "approveErc20",
        token: MEZO_CONTRACTS.MUSD_BTC_Pool,
        spender: MEZO_CONTRACTS.Router,
        amount: lpWei,
        tokenLabel: "LP",
      },
      {
        type: "routerRemoveLiquidity",
        tokenA: MEZO_CONTRACTS.MUSD,
        tokenB: MEZO_CONTRACTS.BTC,
        stable: false,
        liquidity: lpWei,
        amountAMin: 0n,
        amountBMin: 0n,
        to: address as Address,
        deadline,
      },
    ];
  }, [mode, musdWei, btcWei, lpWei, address, deadline]);

  const musdBalanceValue = (musdBalance.data as bigint | undefined) ?? 0n;
  const btcBalanceValue = (btcBalanceErc20.data as bigint | undefined) ?? 0n;
  const lpBalanceValue = lpBalance ?? 0n;

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: btcBalanceValue, after: btcBalanceValue },
      musd: { before: musdBalanceValue, after: musdBalanceValue },
      sMusd: { before: 0n, after: 0n },
      mezo: { before: 0n, after: 0n },
    }),
    [btcBalanceValue, musdBalanceValue],
  );

  const request: SimulationRequest | null = useMemo(() => {
    if (legs.length === 0 || !address) return null;
    return {
      legs,
      views: [
        { kind: "musdBalanceOf", account: address as Address },
        { kind: "lpBalanceOfForPair", tokenA: MEZO_CONTRACTS.MUSD, tokenB: MEZO_CONTRACTS.BTC, stable: false, account: address as Address },
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

  const addExceedsMusd = mode === "add" && musdWei > musdBalanceValue;
  const addExceedsBtc = mode === "add" && btcWei > btcBalanceValue;
  const removeExceedsLp = mode === "remove" && lpWei > lpBalanceValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-zinc-950/95 text-zinc-100">
        <DialogHeader>
          <DialogTitle className="text-base font-medium">Manage MUSD/BTC liquidity</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 rounded-md border border-white/[0.06] bg-white/[0.02] p-3 text-[12px]">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">MUSD</div>
            <div className="mt-0.5 font-mono text-zinc-200">
              {Number(formatUnits(musdBalanceValue, 18)).toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">BTC</div>
            <div className="mt-0.5 font-mono text-zinc-200">
              {Number(formatUnits(btcBalanceValue, 18)).toFixed(6)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">LP shares</div>
            <div className="mt-0.5 font-mono text-zinc-200">
              {Number(formatUnits(lpBalanceValue, 18)).toFixed(6)}
            </div>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mt-1">
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="add">Add</TabsTrigger>
            <TabsTrigger value="remove">Remove</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="rounded-md border border-amber-500/20 bg-amber-500/[0.04] px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-amber-200/80">
          Testnet · slippage min set to 0 — not safe for mainnet liquidity.
        </div>

        {mode === "add" && (
          <div className="grid grid-cols-1 gap-2.5">
            <AssetInput
              label="MUSD to deposit"
              symbol="MUSD"
              value={musdAmount}
              onChange={setMusdAmount}
              step="50"
              balance={musdBalanceValue}
            />
            <AssetInput
              label="BTC to deposit"
              symbol="BTC"
              value={btcAmount}
              onChange={setBtcAmount}
              step="0.001"
              balance={btcBalanceValue}
              helper="Amounts must match the pool's current ratio (router uses min slippage)."
            />
            {addExceedsMusd && (
              <div className="text-[11px] text-rose-300/90">MUSD amount exceeds wallet balance.</div>
            )}
            {addExceedsBtc && (
              <div className="text-[11px] text-rose-300/90">BTC amount exceeds wallet balance.</div>
            )}
          </div>
        )}

        {mode === "remove" && (
          <div className="grid grid-cols-1 gap-2.5">
            <AssetInput
              label="LP shares to burn"
              symbol="MUSD"
              value={lpAmount}
              onChange={setLpAmount}
              step="0.0001"
              balance={lpBalanceValue}
              helper="Returns proportional MUSD + BTC. Router uses min-slippage=0 — set tighter for production."
            />
            {removeExceedsLp && (
              <div className="text-[11px] text-rose-300/90">LP amount exceeds your position.</div>
            )}
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
            liquidity={sim.data.outcome.liquidity}
            legsCount={sim.data.legs.length}
          />
        )}

        {pipeline.runs.length > 0 && (
          <MezoLegTimeline runs={pipeline.runs} onRetry={pipeline.retry} />
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <AssetIcon symbol="MUSD" size="sm" noTooltip />
            <span>+</span>
            <AssetIcon symbol="BTC" size="sm" noTooltip />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isExecuting}>
              Cancel
            </Button>
            <Button
              onClick={onExecute}
              disabled={!sim.data || isExecuting || addExceedsMusd || addExceedsBtc || removeExceedsLp || legs.length === 0}
            >
              {mode === "add" ? "Add liquidity" : "Remove liquidity"}
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
