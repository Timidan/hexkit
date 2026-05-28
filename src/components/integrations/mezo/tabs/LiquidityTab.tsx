import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import {
  ArrowsClockwise,
  CirclesThreePlus,
  Lightning,
  Plus,
} from "@phosphor-icons/react";

import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { MEZO_LENS_COPY } from "../copy";

import { buildLiquidityBundle } from "../sim/bundles/liquidity";
import { useMezoBundleSimulation } from "../sim/useMezoBundleSimulation";
import { useFindPool } from "../hooks/useFindPool";
import { useReserves } from "../hooks/useReserves";
import type { SimulationRequest, SimulationBalances } from "../sim/types";

import { PreviewPanel } from "../preview/PreviewPanel";
import type { ExtraReceive } from "../preview/DepositReceiveCards";
import { usePriceFeed } from "../hooks/usePriceFeed";
import { useMezoLegPipeline } from "../pipeline/useMezoLegPipeline";
import { MezoLegTimeline } from "../pipeline/MezoLegTimeline";

import { AssetInput } from "../components/AssetInput";
import { AssetIcon, type AssetSymbol } from "../components/AssetIcon";
import { WorkbenchBody } from "../components/WorkbenchBody";

type LpToken = Extract<AssetSymbol, "BTC" | "MUSD" | "MEZO">;

const TOKEN_ORDER: LpToken[] = ["BTC", "MUSD", "MEZO"];

const TOKEN_ADDRESS: Record<LpToken, Address> = {
  BTC: MEZO_CONTRACTS.BTC,
  MUSD: MEZO_CONTRACTS.MUSD,
  MEZO: MEZO_CONTRACTS.MEZO,
};

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];
const DEFAULT_DEADLINE_MIN = 20;

function trimDecimals(s: string, maxDp: number): string {
  if (!s.includes(".")) return s;
  const [whole, frac] = s.split(".");
  const truncated = frac.slice(0, maxDp).replace(/0+$/, "");
  return truncated.length === 0 ? whole : `${whole}.${truncated}`;
}

export function LiquidityTab() {
  const { address } = useAccount();

  const [tokenA, setTokenA] = useState<LpToken>("BTC");
  const [tokenB, setTokenB] = useState<LpToken>("MUSD");
  const [amountA, setAmountA] = useState("0.01");
  const [amountB, setAmountB] = useState("");
  const [lastEdited, setLastEdited] = useState<"A" | "B">("A");
  const [slippagePct, setSlippagePct] = useState(0.5);
  const [stable, setStable] = useState(false);

  const btc = useBalance({
    address,
    chainId: MEZO_TESTNET_CHAIN_ID,
    query: { enabled: !!address },
  });
  const musdBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MUSD,
    abi: MEZO_ABIS.MUSD,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const mezoBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MEZO,
    abi: MEZO_ABIS.MEZO,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const balanceOf = (sym: LpToken): bigint | undefined =>
    sym === "BTC"
      ? btc.data?.value
      : sym === "MUSD"
      ? (musdBalance.data as bigint | undefined)
      : (mezoBalance.data as bigint | undefined);

  const pool = useFindPool(TOKEN_ADDRESS[tokenA], TOKEN_ADDRESS[tokenB], stable);
  const reserves = useReserves(
    TOKEN_ADDRESS[tokenA],
    TOKEN_ADDRESS[tokenB],
    stable,
  );

  const poolMissing =
    !pool.isLoading &&
    (pool.address === undefined ||
      pool.address.toLowerCase() ===
        "0x0000000000000000000000000000000000000000");

  // Auto-balance the un-edited side from current reserves ratio.
  useEffect(() => {
    if (!reserves.reserveA || !reserves.reserveB) return;
    if (reserves.reserveA === 0n || reserves.reserveB === 0n) return;
    try {
      if (lastEdited === "A" && amountA) {
        const a = parseUnits(amountA || "0", 18);
        if (a === 0n) {
          setAmountB("");
          return;
        }
        const b = (a * reserves.reserveB) / reserves.reserveA;
        setAmountB(trimDecimals(formatUnits(b, 18), 6));
      } else if (lastEdited === "B" && amountB) {
        const b = parseUnits(amountB || "0", 18);
        if (b === 0n) {
          setAmountA("");
          return;
        }
        const a = (b * reserves.reserveA) / reserves.reserveB;
        setAmountA(trimDecimals(formatUnits(a, 18), 6));
      }
    } catch {
      // Swallow parse errors — input is mid-edit.
    }
  }, [amountA, amountB, lastEdited, reserves.reserveA, reserves.reserveB]);

  const params = useMemo(() => {
    if (!address) return null;
    if (tokenA === tokenB) return null;
    try {
      const aWei = parseUnits(amountA || "0", 18);
      const bWei = parseUnits(amountB || "0", 18);
      if (aWei === 0n || bWei === 0n) return null;
      const slipBps = BigInt(Math.round(slippagePct * 100));
      const aMin = (aWei * (10_000n - slipBps)) / 10_000n;
      const bMin = (bWei * (10_000n - slipBps)) / 10_000n;
      return {
        account: address as Address,
        tokenA: TOKEN_ADDRESS[tokenA],
        tokenB: TOKEN_ADDRESS[tokenB],
        stable,
        amountADesired: aWei,
        amountBDesired: bWei,
        amountAMin: aMin,
        amountBMin: bMin,
        deadlineSec: BigInt(
          Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MIN * 60,
        ),
      };
    } catch {
      return null;
    }
  }, [address, tokenA, tokenB, amountA, amountB, stable, slippagePct]);

  const bundle = useMemo(
    () => (params ? buildLiquidityBundle(params) : null),
    [params],
  );

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: btc.data?.value ?? 0n, after: btc.data?.value ?? 0n },
      musd: {
        before: (musdBalance.data as bigint | undefined) ?? 0n,
        after: (musdBalance.data as bigint | undefined) ?? 0n,
      },
      sMusd: { before: 0n, after: 0n },
      mezo: {
        before: (mezoBalance.data as bigint | undefined) ?? 0n,
        after: (mezoBalance.data as bigint | undefined) ?? 0n,
      },
    }),
    [btc.data?.value, musdBalance.data, mezoBalance.data],
  );

  const request: SimulationRequest | null = useMemo(() => {
    if (!bundle) return null;
    return { legs: bundle.legs, views: bundle.views, beforeBalances };
  }, [bundle, beforeBalances]);

  const [debouncedRequest, setDebouncedRequest] = useState<
    SimulationRequest | null
  >(null);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRequest(request), 350);
    return () => clearTimeout(t);
  }, [request]);

  const sim = useMezoBundleSimulation(debouncedRequest, {
    enabled: !poolMissing,
  });

  const pipeline = useMezoLegPipeline();

  const onAddLiquidity = async () => {
    if (!bundle || !sim.data) return;
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    pipeline.start(bundle.legs, summaries);
    await pipeline.executeAll();
  };

  const lpReceived = sim.data?.outcome.liquidity?.lpTokensReceived;
  const poolShareBps = sim.data?.outcome.liquidity?.poolShareBps;

  // Native BTC moves don't emit ERC-20 Transfer logs — plumb explicitly so
  // YOU'LL DEPOSIT shows the BTC leg when it's part of the pair.
  const priceFeed = usePriceFeed();
  const btcUsdPrice = priceFeed.data
    ? Number(priceFeed.data as bigint) / 1e18
    : undefined;
  const btcDeltaWei = useMemo(() => {
    if (!params) return undefined;
    if (tokenA === "BTC") return -params.amountADesired;
    if (tokenB === "BTC") return -params.amountBDesired;
    return undefined;
  }, [params, tokenA, tokenB]);

  const formattedLp =
    lpReceived !== undefined ? trimDecimals(formatUnits(lpReceived, 18), 6) : "—";
  const formattedShare =
    poolShareBps !== undefined ? (poolShareBps / 100).toFixed(4) : "—";

  const extraReceives: ExtraReceive[] = useMemo(() => {
    if (lpReceived === undefined || lpReceived === 0n) return [];
    const share =
      poolShareBps !== undefined && poolShareBps > 0
        ? `${(poolShareBps / 100).toFixed(4)}% of the ${stable ? "stable" : "volatile"} pool`
        : `${stable ? "stable" : "volatile"} ${tokenA}/${tokenB} pool`;
    return [
      {
        label: `${formattedLp} LP tokens`,
        detail: share,
      },
    ];
  }, [lpReceived, poolShareBps, formattedLp, stable, tokenA, tokenB]);

  const isExecuting = pipeline.runs.some(
    (r) => r.status === "signing" || r.status === "confirming",
  );

  return (
    <WorkbenchBody
      width="narrow"
      composerHeader={
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-50">
              {MEZO_LENS_COPY.tabs.liquidity.title}
            </h3>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
              <AssetIcon symbol={tokenA} size="lg" />
              <span className="text-zinc-700">+</span>
              <AssetIcon symbol={tokenB} size="lg" />
              <span className="ml-1 text-zinc-700">·</span>
              <span>{stable ? "stable pool" : "volatile pool"}</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <CirclesThreePlus weight="fill" className="h-3 w-3 text-violet-300/80" />
            Mezo Pools
          </div>
        </div>
      }
      composer={
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/40 p-3">
            <div className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              TOKEN A
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <AssetInput
                label=""
                symbol={tokenA}
                value={amountA}
                onChange={(v) => {
                  setLastEdited("A");
                  setAmountA(v);
                }}
                step="0.001"
                balance={balanceOf(tokenA)}
              />
              <TokenPicker
                value={tokenA}
                onChange={(t) => {
                  if (t === tokenB) setTokenB(tokenA);
                  setTokenA(t);
                }}
              />
            </div>
          </div>

          <div className="relative -my-1 flex justify-center">
            <span className="rounded-full border border-white/[0.08] bg-zinc-900 p-2 text-zinc-500">
              <Plus className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/40 p-3">
            <div className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              TOKEN B
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <AssetInput
                label=""
                symbol={tokenB}
                value={amountB}
                onChange={(v) => {
                  setLastEdited("B");
                  setAmountB(v);
                }}
                step="0.001"
                balance={balanceOf(tokenB)}
              />
              <TokenPicker
                value={tokenB}
                onChange={(t) => {
                  if (t === tokenA) setTokenA(tokenB);
                  setTokenB(t);
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 rounded-lg border border-white/[0.05] bg-zinc-950/30 px-3 py-2 text-[11px] text-zinc-400">
            <div className="flex flex-col">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                LP tokens
              </span>
              <span className="font-mono tabular-nums text-zinc-100">
                {sim.isFetching ? "…" : formattedLp}
              </span>
            </div>
            <div className="flex flex-col text-right">
              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                Pool share
              </span>
              <span className="font-mono tabular-nums text-zinc-100">
                {sim.isFetching ? "…" : `${formattedShare}%`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/[0.05] bg-zinc-950/30 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Slippage
              </span>
              {SLIPPAGE_PRESETS.map((preset) => {
                const active = preset === slippagePct;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSlippagePct(preset)}
                    className={
                      active
                        ? "rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 font-mono text-[11px] text-zinc-50"
                        : "rounded-md border border-transparent px-2 py-1 font-mono text-[11px] text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
                    }
                  >
                    {preset}%
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Pool
              </span>
              <button
                type="button"
                onClick={() => setStable(false)}
                className={
                  !stable
                    ? "rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 font-mono text-[11px] text-zinc-50"
                    : "rounded-md border border-transparent px-2 py-1 font-mono text-[11px] text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
                }
              >
                volatile
              </button>
              <button
                type="button"
                onClick={() => setStable(true)}
                className={
                  stable
                    ? "rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 font-mono text-[11px] text-zinc-50"
                    : "rounded-md border border-transparent px-2 py-1 font-mono text-[11px] text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-200"
                }
              >
                stable
              </button>
            </div>
          </div>

          {poolMissing && (
            <p className="text-[11px] text-amber-300/80">
              No {stable ? "stable" : "volatile"} pool exists for {tokenA}/
              {tokenB} on Mezo. You'd be creating a new pool — the first
              depositor sets the price.
            </p>
          )}
        </div>
      }
      outcome={
        <PreviewPanel
          isLoading={sim.isFetching}
          error={sim.error as Error | null}
          result={sim.data}
          userAddress={address}
          btcDeltaWei={btcDeltaWei}
          btcUsdPrice={btcUsdPrice}
          extraReceives={extraReceives}
        />
      }
      trailing={
        pipeline.runs.length > 0 ? (
          <MezoLegTimeline runs={pipeline.runs} onRetry={pipeline.retry} />
        ) : undefined
      }
      actions={
        <>
          {pipeline.runs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={pipeline.reset}
              className="text-zinc-500 hover:text-zinc-200"
            >
              Reset
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => sim.refetch()}
            className="border-white/[0.08] bg-transparent text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-50"
          >
            <ArrowsClockwise
              className={`mr-1.5 h-3.5 w-3.5 ${
                sim.isFetching ? "animate-spin" : ""
              }`}
            />
            Re-simulate
          </Button>
          <Button
            size="sm"
            onClick={onAddLiquidity}
            disabled={!sim.data || isExecuting}
            className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Lightning weight="fill" className="mr-1.5 h-3.5 w-3.5" />
            Add Liquidity
          </Button>
        </>
      }
    />
  );
}

function TokenPicker({
  value,
  onChange,
}: {
  value: LpToken;
  onChange: (next: LpToken) => void;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] p-1">
      {TOKEN_ORDER.map((t) => {
        const active = t === value;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={
              active
                ? "inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.07] px-2 py-1 font-mono text-[11px] text-zinc-50"
                : "inline-flex items-center gap-1.5 rounded-md border border-transparent px-2 py-1 font-mono text-[11px] text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-200"
            }
          >
            <AssetIcon symbol={t} size="sm" noTooltip />
            {t}
          </button>
        );
      })}
    </div>
  );
}
