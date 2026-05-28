import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { formatUnits, parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import {
  ArrowsClockwise,
  ArrowsDownUp,
  ArrowsLeftRight,
  Lightning,
} from "@phosphor-icons/react";

import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { MEZO_LENS_COPY } from "../copy";

import { buildSwapBundle } from "../sim/bundles/swap";
import { useMezoBundleSimulation } from "../sim/useMezoBundleSimulation";
import { useFindPool } from "../hooks/useFindPool";
import type { SimulationRequest, SimulationBalances } from "../sim/types";

import { PreviewPanel } from "../preview/PreviewPanel";
import { usePriceFeed } from "../hooks/usePriceFeed";
import { useMezoLegPipeline } from "../pipeline/useMezoLegPipeline";
import { MezoLegTimeline } from "../pipeline/MezoLegTimeline";

import { AssetInput } from "../components/AssetInput";
import { AssetIcon, type AssetSymbol } from "../components/AssetIcon";
import { WorkbenchBody } from "../components/WorkbenchBody";

type SwapToken = Extract<AssetSymbol, "BTC" | "MUSD" | "MEZO">;

const TOKEN_ORDER: SwapToken[] = ["BTC", "MUSD", "MEZO"];

const TOKEN_ADDRESS: Record<SwapToken, Address> = {
  BTC: MEZO_CONTRACTS.BTC,
  MUSD: MEZO_CONTRACTS.MUSD,
  MEZO: MEZO_CONTRACTS.MEZO,
};

const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0];

const DEFAULT_DEADLINE_MIN = 20;

/** Trim a decimal string to at most `maxDp` fractional digits, drop trailing zeros. */
function trimDecimals(s: string, maxDp: number): string {
  if (!s.includes(".")) return s;
  const [whole, frac] = s.split(".");
  const truncated = frac.slice(0, maxDp).replace(/0+$/, "");
  return truncated.length === 0 ? whole : `${whole}.${truncated}`;
}

export function SwapTab() {
  const { address } = useAccount();

  const [tokenIn, setTokenIn] = useState<SwapToken>("BTC");
  const [tokenOut, setTokenOut] = useState<SwapToken>("MUSD");
  const [amountIn, setAmountIn] = useState("0.01");
  const [slippagePct, setSlippagePct] = useState(0.5);
  const [stable, setStable] = useState(false);

  const flip = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("0");
  };

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

  const balanceOf = (sym: SwapToken): bigint | undefined =>
    sym === "BTC"
      ? btc.data?.value
      : sym === "MUSD"
      ? (musdBalance.data as bigint | undefined)
      : (mezoBalance.data as bigint | undefined);

  const pool = useFindPool(
    TOKEN_ADDRESS[tokenIn],
    TOKEN_ADDRESS[tokenOut],
    stable,
  );

  const poolMissing =
    !pool.isLoading &&
    (pool.address === undefined ||
      pool.address.toLowerCase() ===
        "0x0000000000000000000000000000000000000000");

  const params = useMemo(() => {
    if (!address) return null;
    if (tokenIn === tokenOut) return null;
    try {
      const amountInWei = parseUnits(amountIn || "0", 18);
      if (amountInWei === 0n) return null;
      return {
        account: address as Address,
        tokenIn: TOKEN_ADDRESS[tokenIn],
        tokenOut: TOKEN_ADDRESS[tokenOut],
        amountIn: amountInWei,
        amountOutMin: 0n,
        stable,
        slippageBps: BigInt(Math.round(slippagePct * 100)),
        deadlineSec: BigInt(
          Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MIN * 60,
        ),
      };
    } catch {
      return null;
    }
  }, [address, tokenIn, tokenOut, amountIn, slippagePct, stable]);

  const bundle = useMemo(
    () => (params ? buildSwapBundle(params) : null),
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

  const onSwap = async () => {
    if (!bundle || !sim.data) return;
    // Sim ran with amountOutMin=0 so the quote always lands. For real
    // signing, clamp using the live quote × (1 − slippage). Bail if we
    // somehow don't have a quote — never sign with 0 min-out.
    const quote = sim.data.outcome.swap?.amountOut;
    if (quote === undefined || quote === 0n) return;
    const slipBps = BigInt(Math.round(slippagePct * 100));
    const minOutForSigning = (quote * (10_000n - slipBps)) / 10_000n;
    const legsForSigning = bundle.legs.map((leg) =>
      leg.type === "routerSwap"
        ? { ...leg, amountOutMin: minOutForSigning }
        : leg,
    );
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    pipeline.start(legsForSigning, summaries);
    await pipeline.executeAll();
  };

  const quotedOut = sim.data?.outcome.swap?.amountOut;
  const minOut = sim.data?.outcome.swap?.amountOutMin;
  const priceImpactBps = sim.data?.outcome.swap?.priceImpactBps;

  const formattedQuotedOut =
    quotedOut !== undefined ? trimDecimals(formatUnits(quotedOut, 18), 6) : "—";
  const formattedMinOut =
    minOut !== undefined ? trimDecimals(formatUnits(minOut, 18), 6) : "—";

  // Native BTC deltas don't emit ERC-20 Transfer logs, so the DepositReceive
  // aggregator can't see them. Surface them explicitly: negative when BTC is
  // the input side (we send), positive when it's the output (we receive).
  const priceFeed = usePriceFeed();
  const btcUsdPrice = priceFeed.data
    ? Number(priceFeed.data as bigint) / 1e18
    : undefined;
  const btcDeltaWei = useMemo(() => {
    if (tokenIn === "BTC" && params) return -params.amountIn;
    if (tokenOut === "BTC" && quotedOut !== undefined) return quotedOut;
    return undefined;
  }, [tokenIn, tokenOut, params, quotedOut]);

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
              {MEZO_LENS_COPY.tabs.swap.title}
            </h3>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
              <AssetIcon symbol={tokenIn} size="lg" />
              <span className="text-zinc-700">→</span>
              <AssetIcon symbol={tokenOut} size="lg" />
              <span className="ml-1 text-zinc-700">·</span>
              <span>{stable ? "stable pool" : "volatile pool"}</span>
            </div>
          </div>
          <div className="inline-flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            <ArrowsLeftRight weight="fill" className="h-3 w-3 text-sky-300/80" />
            Mezo Router
          </div>
        </div>
      }
      composer={
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/40 p-3">
            <div className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              SELL
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <AssetInput
                label=""
                symbol={tokenIn}
                value={amountIn}
                onChange={setAmountIn}
                step="0.001"
                balance={balanceOf(tokenIn)}
              />
              <TokenPicker
                value={tokenIn}
                onChange={(t) => {
                  if (t === tokenOut) setTokenOut(tokenIn);
                  setTokenIn(t);
                }}
              />
            </div>
          </div>

          <div className="relative -my-1 flex justify-center">
            <button
              type="button"
              onClick={flip}
              aria-label="Flip swap direction"
              className="rounded-full border border-white/[0.08] bg-zinc-900 p-2 text-zinc-300 transition-colors hover:border-white/20 hover:text-zinc-50"
            >
              <ArrowsDownUp className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-zinc-950/40 p-3">
            <div className="px-1 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              BUY (ESTIMATED)
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-zinc-950/40 px-4 py-3">
                  <span className="min-w-0 flex-1 font-mono text-2xl font-light tabular-nums tracking-tight text-zinc-50">
                    {sim.isFetching ? "…" : formattedQuotedOut}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 px-0.5 min-h-[14px]">
                  <p className="text-[11px] leading-tight text-zinc-500">
                    Min received @ {slippagePct}% slip: {formattedMinOut}
                  </p>
                  {priceImpactBps !== undefined && (
                    <span
                      className={`shrink-0 font-mono text-[11px] tabular-nums ${
                        priceImpactBps > 300
                          ? "text-red-400"
                          : priceImpactBps > 100
                          ? "text-amber-300"
                          : "text-zinc-500"
                      }`}
                    >
                      impact {(priceImpactBps / 100).toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
              <TokenPicker
                value={tokenOut}
                onChange={(t) => {
                  if (t === tokenIn) setTokenIn(tokenOut);
                  setTokenOut(t);
                }}
              />
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
              No {stable ? "stable" : "volatile"} pool exists for {tokenIn}/
              {tokenOut} on Mezo. Try the other pool type or a different pair.
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
            onClick={onSwap}
            disabled={!sim.data || poolMissing || isExecuting}
            className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Lightning weight="fill" className="mr-1.5 h-3.5 w-3.5" />
            Swap
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
  value: SwapToken;
  onChange: (next: SwapToken) => void;
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
