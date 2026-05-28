import { useEffect, useMemo, useState } from "react";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import { ArrowsClockwise, Vault } from "@phosphor-icons/react";

import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { MEZO_LENS_COPY } from "../copy";

import { buildBorrowOpenBundle } from "../sim/bundles/borrow";
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

export function BorrowTab() {
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
  const sortedTrovesHead = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.SortedTroves,
    abi: MEZO_ABIS.SortedTroves,
    functionName: "getFirst",
  });
  const troveInsertHint = sortedTrovesHead.data as Address | undefined;

  const [btcInput, setBtcInput] = useState("0.05");
  const [musdInput, setMusdInput] = useState("2000");

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: btc.data?.value ?? 0n, after: btc.data?.value ?? 0n },
      musd: {
        before: (musdBalance.data as bigint | undefined) ?? 0n,
        after: (musdBalance.data as bigint | undefined) ?? 0n,
      },
      sMusd: { before: 0n, after: 0n },
      mezo: { before: 0n, after: 0n },
    }),
    [btc.data?.value, musdBalance.data],
  );

  const params = useMemo(() => {
    if (!address) return null;
    try {
      return {
        account: address as Address,
        collateralBtcWei: parseUnits(btcInput || "0", 18),
        debtMusd: parseUnits(musdInput || "0", 18),
        troveInsertHint,
      };
    } catch {
      return null;
    }
  }, [address, btcInput, musdInput, troveInsertHint]);

  const bundle = useMemo(
    () => (params ? buildBorrowOpenBundle(params) : null),
    [params],
  );

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

  const sim = useMezoBundleSimulation(debouncedRequest);
  const pipeline = useMezoLegPipeline();

  const onOpenTrove = async () => {
    if (!bundle || !sim.data) return;
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    pipeline.start(bundle.legs, summaries);
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

  const extraReceives: ExtraReceive[] = useMemo(() => {
    const out: ExtraReceive[] = [];
    if (sim.data?.outcome.trove) {
      const t = sim.data.outcome.trove;
      out.push({
        label: `Trove opened · ${(t.icrBps / 100).toFixed(0)}% ICR`,
        detail: `Liquidation @ $${t.liquidationPriceUsd.toFixed(0)} BTC`,
      });
    }
    return out;
  }, [sim.data]);

  const isExecuting = pipeline.runs.some(
    (r) => r.status === "signing" || r.status === "confirming",
  );

  return (
    <WorkbenchBody
      composerHeader={
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-zinc-50">
            <Term k="trove">{MEZO_LENS_COPY.tabs.borrow.title}</Term>
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
            <AssetIcon symbol="BTC" size="lg" />
            <span className="text-zinc-700">→</span>
            <AssetIcon symbol="MUSD" size="lg" />
            <span className="ml-1 text-zinc-700">·</span>
            <span>
              liquidates if <Term k="icr">ICR</Term> &lt; 110%
            </span>
          </div>
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
            helper="Your BTC backs the borrow · liquidation @ ICR < 110%"
            balance={btc.data?.value}
            usdValue={btcUsdValue}
          />
          <AssetInput
            label="MUSD borrow"
            symbol="MUSD"
            value={musdInput}
            onChange={setMusdInput}
            step="100"
            helper="Min 2,000 MUSD (1,800 net + 200 gas comp)"
            balance={musdBalance.data as bigint | undefined}
            usdValue={musdUsdValue}
            intent="receive"
          />
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
              size="lg"
              onClick={pipeline.reset}
              className="text-zinc-500 hover:text-zinc-200"
            >
              Reset
            </Button>
          )}
          <Button
            variant="outline"
            size="lg"
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
            size="lg"
            onClick={onOpenTrove}
            disabled={!sim.data || isExecuting}
            className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Vault weight="fill" className="mr-1.5 h-3.5 w-3.5" />
            Open Trove
          </Button>
        </>
      }
    />
  );
}
