import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowsClockwise, Lightning, Warning } from "@phosphor-icons/react";

import { MEZO_CONTRACTS, isPlaceholderAddress } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { MEZO_LENS_COPY } from "../copy";

import { buildStackBundle } from "../sim/bundles/stack";
import { useMezoBundleSimulation } from "../sim/useMezoBundleSimulation";
import type { SimulationRequest, SimulationBalances } from "../sim/types";

import { PreviewPanel } from "../preview/PreviewPanel";
import type { ExtraReceive } from "../preview/DepositReceiveCards";
import { useMezoLegPipeline } from "../pipeline/useMezoLegPipeline";
import { MezoLegTimeline } from "../pipeline/MezoLegTimeline";
import { usePriceFeed } from "../hooks/usePriceFeed";

import { AssetInput } from "../components/AssetInput";
import { AssetIcon } from "../components/AssetIcon";
import { WorkbenchBody } from "../components/WorkbenchBody";
import { Term } from "../components/Term";

// Mezo's VotingEscrow rounds the unlock time down to the previous week
// boundary, so a strict 7-day duration can round to "this week" and fail
// the future-time check. Two weeks guarantees we land in the next week.
const ONE_WEEK_SECONDS = 14n * 24n * 60n * 60n;

export function StackTab() {
  const { address } = useAccount();

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
  const sMusdBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.sMUSD,
    abi: MEZO_ABIS.sMUSD,
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

  const [btcInput, setBtcInput] = useState("0.05");
  const [musdInput, setMusdInput] = useState("2000");
  const [sMusdInput, setSMusdInput] = useState("1500");
  const [mezoInput, setMezoInput] = useState("50");

  const veMezoPlaceholder = isPlaceholderAddress(MEZO_CONTRACTS.veMEZO);

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: btc.data?.value ?? 0n, after: btc.data?.value ?? 0n },
      musd: {
        before: (musdBalance.data as bigint | undefined) ?? 0n,
        after: (musdBalance.data as bigint | undefined) ?? 0n,
      },
      sMusd: {
        before: (sMusdBalance.data as bigint | undefined) ?? 0n,
        after: (sMusdBalance.data as bigint | undefined) ?? 0n,
      },
      mezo: {
        before: (mezoBalance.data as bigint | undefined) ?? 0n,
        after: (mezoBalance.data as bigint | undefined) ?? 0n,
      },
    }),
    [btc.data?.value, musdBalance.data, sMusdBalance.data, mezoBalance.data],
  );

  // SortedTroves has 100s of existing troves on Mezo; openTrove with
  // zero-address hints reverts (no data). Read head() and pass it as both
  // hints so the contract can walk the linked list to our insert spot.
  const sortedTrovesHead = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.SortedTroves,
    abi: MEZO_ABIS.SortedTroves,
    functionName: "getFirst",
  });
  const troveInsertHint = sortedTrovesHead.data as Address | undefined;

  // Detect whether the user already has an active trove. If so, the bundle
  // skips openTrove so re-running Build Stack doesn't error out trying to
  // re-open. status === 1 means Active in the Liquity fork.
  const existingTrove = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.TroveManager,
    abi: MEZO_ABIS.TroveManager,
    functionName: "Troves",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const troveActive = useMemo(() => {
    const data = existingTrove.data as
      | readonly [bigint, bigint, bigint, bigint, number, bigint, bigint, bigint, bigint]
      | undefined;
    return data ? data[4] === 1 : false;
  }, [existingTrove.data]);

  const params = useMemo(() => {
    if (!address) return null;
    try {
      return {
        account: address as Address,
        collateralBtcWei: parseUnits(btcInput || "0", 18),
        debtMusd: parseUnits(musdInput || "0", 18),
        sMusdDepositAmount: parseUnits(sMusdInput || "0", 18),
        mezoLockAmount: parseUnits(mezoInput || "0", 18),
        lockDurationSeconds: ONE_WEEK_SECONDS,
        troveInsertHint,
        skipOpenTrove: troveActive,
      };
    } catch {
      return null;
    }
  }, [address, btcInput, musdInput, sMusdInput, mezoInput, troveInsertHint, troveActive]);

  const bundle = useMemo(() => (params ? buildStackBundle(params) : null), [
    params,
  ]);

  const request: SimulationRequest | null = useMemo(() => {
    if (!bundle) return null;
    return { legs: bundle.legs, views: bundle.views, beforeBalances };
  }, [bundle, beforeBalances]);

  const [debouncedRequest, setDebouncedRequest] = useState<SimulationRequest | null>(
    null,
  );
  useEffect(() => {
    const t = setTimeout(() => setDebouncedRequest(request), 350);
    return () => clearTimeout(t);
  }, [request]);

  const sim = useMezoBundleSimulation(debouncedRequest, {
    enabled: !veMezoPlaceholder,
  });

  const pipeline = useMezoLegPipeline();

  const onBuildStack = async () => {
    if (!bundle || !sim.data) return;
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    // If a prior run already started (possibly with confirmed legs), resume
    // instead of clobbering progress with a fresh start. The user can hit
    // Reset to force a clean rebuild.
    const hasExistingRun = pipeline.runs.length > 0;
    const hasConfirmedLeg = pipeline.runs.some((r) => r.status === "confirmed");
    if (!hasExistingRun || !hasConfirmedLeg) {
      pipeline.start(bundle.legs, summaries);
    }
    await pipeline.executeAll();
  };

  const priceFeed = usePriceFeed();
  const btcUsdPrice = priceFeed.data
    ? Number(priceFeed.data as bigint) / 1e18
    : undefined;
  const btcUsdValue = useMemo(() => {
    if (!btcUsdPrice) return undefined;
    const n = Number(btcInput);
    return Number.isFinite(n) ? n * btcUsdPrice : undefined;
  }, [btcInput, btcUsdPrice]);
  const musdUsdValue = useMemo(() => {
    const n = Number(musdInput);
    return Number.isFinite(n) ? n : undefined;
  }, [musdInput]);
  const sMusdUsdValue = useMemo(() => {
    const n = Number(sMusdInput);
    return Number.isFinite(n) ? n : undefined;
  }, [sMusdInput]);

  // Pre-simulation ICR + minimum-debt validation so the user sees
  // BorrowerOps violations before the bundle reverts.
  const troveCheck = useMemo(() => {
    const collBtc = Number(btcInput);
    const borrow = Number(musdInput);
    if (!Number.isFinite(collBtc) || !Number.isFinite(borrow)) return null;
    if (borrow <= 0) {
      return {
        kind: "below-min" as const,
        message: "MUSD borrow must be at least 2,000 (1,800 net + 200 gas comp)",
      };
    }
    if (borrow < 2000) {
      return {
        kind: "below-min" as const,
        message: `Below minimum trove debt (2,000 MUSD). You typed ${borrow.toLocaleString()}.`,
      };
    }
    if (!btcUsdPrice) return null;
    // Mezo gross debt = borrow × 1.01 issuance fee + 200 MUSD gas comp
    const grossDebt = borrow * 1.01 + 200;
    const collateralUsd = collBtc * btcUsdPrice;
    const icr = grossDebt > 0 ? (collateralUsd / grossDebt) * 100 : 0;
    const minBtc = (grossDebt * 1.1) / btcUsdPrice;
    if (icr < 110) {
      return {
        kind: "icr-violation" as const,
        icr,
        grossDebt,
        minBtc,
        message: `ICR ${icr.toFixed(1)}% < 110% min · need ≥ ${minBtc.toFixed(4)} BTC for ${borrow.toLocaleString()} MUSD borrow`,
      };
    }
    return {
      kind: "ok" as const,
      icr,
      grossDebt,
      minBtc,
    };
  }, [btcInput, musdInput, btcUsdPrice]);

  const extraReceives: ExtraReceive[] = useMemo(() => {
    const out: ExtraReceive[] = [];
    if (sim.data?.outcome.trove) {
      const t = sim.data.outcome.trove;
      out.push({
        label: `Trove opened · ${(t.icrBps / 100).toFixed(0)}% ICR`,
        detail: `Liquidation @ $${t.liquidationPriceUsd.toFixed(0)} BTC`,
      });
    }
    if (params?.mezoLockAmount && params.mezoLockAmount > 0n) {
      out.push({
        label: "veMEZO governance NFT",
        detail: "1-week lock · voting power decays linearly",
      });
    }
    return out;
  }, [sim.data, params]);

  const isExecuting = pipeline.runs.some(
    (r) => r.status === "signing" || r.status === "confirming",
  );

  return (
    <WorkbenchBody
      composerHeader={
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-50">
              <Term k="stack">{MEZO_LENS_COPY.tabs.stack.title}</Term>
            </h3>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
              <AssetIcon symbol="BTC" size="lg" />
              <span className="text-zinc-700">→</span>
              <AssetIcon symbol="MUSD" size="lg" />
              <span className="text-zinc-700">→</span>
              <AssetIcon symbol="sMUSD" size="lg" />
              <span className="text-zinc-700">+</span>
              <AssetIcon symbol="veMEZO" size="lg" />
              <span className="ml-1 text-zinc-700">·</span>
              <Term k="atomicBundle">atomic</Term>
            </div>
          </div>
          {veMezoPlaceholder && (
            <Alert className="max-w-xs border-amber-500/25 bg-amber-500/[0.04] py-2">
              <Warning className="h-4 w-4 text-amber-300" />
              <AlertDescription className="text-[11px] text-amber-100/80">
                veMEZO unresolved · run{" "}
                <code className="rounded bg-amber-500/10 px-1 text-[10px] text-amber-100">
                  scripts/mezo-day-0-smoke.sh
                </code>
              </AlertDescription>
            </Alert>
          )}
          {troveActive && (
            <div className="inline-flex max-w-md items-center gap-2 rounded-md border border-sky-500/25 bg-sky-500/[0.04] px-2.5 py-1.5 text-[11px] text-sky-200/90">
              <span className="font-mono text-[10px] uppercase tracking-wider text-sky-300/80">Trove active</span>
              <span className="text-sky-100/70">— openTrove leg skipped; stack continues from sMUSD deposit.</span>
            </div>
          )}
        </div>
      }
      composer={
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <AssetInput
            label="BTC collateral"
            symbol="BTC"
            value={btcInput}
            onChange={setBtcInput}
            step="0.001"
            balance={btc.data?.value}
            usdValue={btcUsdValue}
          />
          <AssetInput
            label="MUSD borrow"
            symbol="MUSD"
            value={musdInput}
            onChange={setMusdInput}
            step="100"
            helper="Min 2,000 (1,800 net + 200 gas comp)"
            balance={musdBalance.data as bigint | undefined}
            usdValue={musdUsdValue}
            intent="receive"
          />
          <AssetInput
            label="→ sMUSD savings"
            symbol="sMUSD"
            value={sMusdInput}
            onChange={setSMusdInput}
            step="100"
            helper="Direct yield · no gauge stake in v1"
            balance={musdBalance.data as bigint | undefined}
            usdValue={sMusdUsdValue}
          />
          <AssetInput
            label="MEZO lock · 1 week"
            symbol="MEZO"
            value={mezoInput}
            onChange={setMezoInput}
            step="10"
            helper="Creates a veMEZO governance position"
            balance={mezoBalance.data as bigint | undefined}
          />
          {troveCheck && troveCheck.kind !== "ok" && (
            <div className="md:col-span-2">
              <Alert
                className={
                  troveCheck.kind === "icr-violation"
                    ? "border-red-500/30 bg-red-500/[0.04]"
                    : "border-amber-500/25 bg-amber-500/[0.04]"
                }
              >
                <Warning
                  className={
                    troveCheck.kind === "icr-violation"
                      ? "h-4 w-4 text-red-300"
                      : "h-4 w-4 text-amber-300"
                  }
                />
                <AlertDescription
                  className={
                    troveCheck.kind === "icr-violation"
                      ? "text-[11px] text-red-100/85"
                      : "text-[11px] text-amber-100/85"
                  }
                >
                  {troveCheck.message}
                </AlertDescription>
              </Alert>
            </div>
          )}
          {troveCheck && troveCheck.kind === "ok" && (
            <div className="md:col-span-2 grid grid-cols-3 gap-2 rounded-lg border border-white/[0.05] bg-zinc-950/30 px-3 py-2 text-[11px] text-zinc-400">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Projected ICR
                </span>
                <span
                  className={`font-mono tabular-nums ${
                    troveCheck.icr >= 150
                      ? "text-emerald-300"
                      : troveCheck.icr >= 130
                      ? "text-zinc-100"
                      : "text-amber-300"
                  }`}
                >
                  {troveCheck.icr.toFixed(1)}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Gross debt
                </span>
                <span className="font-mono tabular-nums text-zinc-100">
                  {troveCheck.grossDebt.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}{" "}
                  MUSD
                </span>
              </div>
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Min collateral
                </span>
                <span className="font-mono tabular-nums text-zinc-100">
                  {troveCheck.minBtc.toFixed(4)} BTC
                </span>
              </div>
            </div>
          )}
        </div>
      }
      outcome={
        <PreviewPanel
          isLoading={sim.isFetching}
          error={sim.error as Error | null}
          result={sim.data}
          userAddress={address}
          btcDeltaWei={params ? -params.collateralBtcWei : undefined}
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
            onClick={onBuildStack}
            disabled={
              !sim.data ||
              veMezoPlaceholder ||
              isExecuting ||
              (troveCheck !== null && troveCheck.kind !== "ok")
            }
            title={
              veMezoPlaceholder
                ? "Day-0 smoke required to resolve veMEZO before execution"
                : undefined
            }
            className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Lightning weight="fill" className="mr-1.5 h-3.5 w-3.5" />
            {MEZO_LENS_COPY.buildStackCta}
          </Button>
        </>
      }
    />
  );
}
