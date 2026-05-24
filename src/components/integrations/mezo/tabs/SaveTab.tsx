import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import { ArrowsClockwise, PiggyBank } from "@phosphor-icons/react";

import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { MEZO_LENS_COPY } from "../copy";

import { buildSaveBundle } from "../sim/bundles/save";
import { useMezoBundleSimulation } from "../sim/useMezoBundleSimulation";
import type { SimulationRequest, SimulationBalances } from "../sim/types";

import { PreviewPanel } from "../preview/PreviewPanel";
import { useMezoLegPipeline } from "../pipeline/useMezoLegPipeline";
import { MezoLegTimeline } from "../pipeline/MezoLegTimeline";

import { AssetInput } from "../components/AssetInput";
import { AssetIcon } from "../components/AssetIcon";
import { WorkbenchBody } from "../components/WorkbenchBody";
import { Term } from "../components/Term";

export function SaveTab() {
  const { address } = useAccount();

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

  const [musdInput, setMusdInput] = useState("100");

  const beforeBalances: SimulationBalances = useMemo(
    () => ({
      btc: { before: 0n, after: 0n },
      musd: {
        before: (musdBalance.data as bigint | undefined) ?? 0n,
        after: (musdBalance.data as bigint | undefined) ?? 0n,
      },
      sMusd: {
        before: (sMusdBalance.data as bigint | undefined) ?? 0n,
        after: (sMusdBalance.data as bigint | undefined) ?? 0n,
      },
      mezo: { before: 0n, after: 0n },
    }),
    [musdBalance.data, sMusdBalance.data],
  );

  const params = useMemo(() => {
    if (!address) return null;
    try {
      return {
        account: address as Address,
        musdDepositAmount: parseUnits(musdInput || "0", 18),
      };
    } catch {
      return null;
    }
  }, [address, musdInput]);

  const bundle = useMemo(() => (params ? buildSaveBundle(params) : null), [params]);

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

  const onSave = async () => {
    if (!bundle || !sim.data) return;
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    pipeline.start(bundle.legs, summaries);
    await pipeline.executeAll();
  };

  const musdUsdValue = useMemo(() => {
    const n = Number(musdInput);
    return Number.isFinite(n) ? n : undefined;
  }, [musdInput]);

  const isExecuting = pipeline.runs.some(
    (r) => r.status === "signing" || r.status === "confirming",
  );

  return (
    <WorkbenchBody
      composerHeader={
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-zinc-50">
            {MEZO_LENS_COPY.tabs.save.title}
          </h3>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
            <AssetIcon symbol="MUSD" size="lg" />
            <span className="text-zinc-700">→</span>
            <AssetIcon symbol="sMUSD" size="lg" />
            <span className="ml-1 text-zinc-700">·</span>
            <span>
              direct yield · <Term k="gauge">gauge</Term> stake in v2
            </span>
          </div>
        </div>
      }
      composer={
        <AssetInput
          label="MUSD to deposit"
          symbol="MUSD"
          value={musdInput}
          onChange={setMusdInput}
          step="10"
          helper="Direct yield via sMUSD vault · gauge stake toggle is v2"
          balance={musdBalance.data as bigint | undefined}
          usdValue={musdUsdValue}
        />
      }
      outcome={
        <PreviewPanel
          isLoading={sim.isFetching}
          error={sim.error as Error | null}
          result={sim.data}
          userAddress={address}
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
            onClick={onSave}
            disabled={!sim.data || isExecuting}
            className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <PiggyBank weight="fill" className="mr-1.5 h-3.5 w-3.5" />
            Deposit MUSD
          </Button>
        </>
      }
    />
  );
}
