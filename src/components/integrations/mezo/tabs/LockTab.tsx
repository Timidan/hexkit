import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseUnits, type Address } from "viem";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowsClockwise, Lock, Warning } from "@phosphor-icons/react";

import { MEZO_CONTRACTS, isPlaceholderAddress } from "../../../../../data/mezoContracts";
import { MEZO_ABIS } from "../abi";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import { MEZO_LENS_COPY } from "../copy";

import { buildLockBundle } from "../sim/bundles/lock";
import { useMezoBundleSimulation } from "../sim/useMezoBundleSimulation";
import type { SimulationRequest, SimulationBalances } from "../sim/types";

import { PreviewPanel } from "../preview/PreviewPanel";
import type { ExtraReceive } from "../preview/DepositReceiveCards";
import { useMezoLegPipeline } from "../pipeline/useMezoLegPipeline";
import { MezoLegTimeline } from "../pipeline/MezoLegTimeline";

import { AssetInput } from "../components/AssetInput";
import { AssetIcon } from "../components/AssetIcon";
import { WorkbenchBody } from "../components/WorkbenchBody";
import { Term } from "../components/Term";

function formatVeMezo(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n >= 100) return n.toFixed(0);
  if (n >= 10) return n.toFixed(1);
  if (n >= 1) return n.toFixed(2);
  if (n >= 0.01) return n.toFixed(3);
  return n.toExponential(1);
}

const DURATION_PRESETS = [
  { label: "14d", seconds: 14n * 24n * 60n * 60n, weight: 0.08 },
  { label: "30d", seconds: 30n * 24n * 60n * 60n, weight: 0.16 },
  { label: "180d", seconds: 180n * 24n * 60n * 60n, weight: 0.5 },
  { label: "365d", seconds: 365n * 24n * 60n * 60n, weight: 1.0 },
];

export function LockTab() {
  const { address } = useAccount();
  const veMezoPlaceholder = isPlaceholderAddress(MEZO_CONTRACTS.veMEZO);

  const mezoBalance = useReadContract({
    chainId: MEZO_TESTNET_CHAIN_ID,
    address: MEZO_CONTRACTS.MEZO,
    abi: MEZO_ABIS.MEZO,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const [mezoInput, setMezoInput] = useState("50");
  const [durationIdx, setDurationIdx] = useState(0);

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

  const params = useMemo(() => {
    if (!address) return null;
    try {
      return {
        account: address as Address,
        mezoLockAmount: parseUnits(mezoInput || "0", 18),
        lockDurationSeconds: DURATION_PRESETS[durationIdx].seconds,
      };
    } catch {
      return null;
    }
  }, [address, mezoInput, durationIdx]);

  const bundle = useMemo(() => (params ? buildLockBundle(params) : null), [
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

  const onLock = async () => {
    if (!bundle || !sim.data) return;
    const summaries = sim.data.legs.map((l) => l.decodedSummary);
    pipeline.start(bundle.legs, summaries);
    await pipeline.executeAll();
  };

  const extraReceives: ExtraReceive[] = useMemo(() => {
    if (!params) return [];
    const days = Number(params.lockDurationSeconds) / 86400;
    const label =
      days >= 365
        ? `${(days / 365).toFixed(0)} year`
        : days >= 30
        ? `${(days / 30).toFixed(0)} month`
        : `${days.toFixed(0)} day`;
    return [
      {
        label: "veMEZO governance NFT",
        detail: `${label} lock · voting power decays linearly`,
      },
    ];
  }, [params]);

  const isExecuting = pipeline.runs.some(
    (r) => r.status === "signing" || r.status === "confirming",
  );

  const currentPreset = DURATION_PRESETS[durationIdx];
  const projectedVotingPower = useMemo(() => {
    const n = Number(mezoInput);
    if (!Number.isFinite(n)) return undefined;
    return n * currentPreset.weight;
  }, [mezoInput, currentPreset]);

  return (
    <WorkbenchBody
      composerHeader={
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-zinc-50">
              {MEZO_LENS_COPY.tabs.lock.title}
            </h3>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-500">
              <AssetIcon symbol="MEZO" size="lg" />
              <span className="text-zinc-700">→</span>
              <AssetIcon symbol="veMEZO" size="lg" />
              <span className="ml-1 text-zinc-700">·</span>
              <span>
                <Term k="voteWeight">voting power</Term> decays linearly
              </span>
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
        </div>
      }
      composer={
        <div className="grid grid-cols-1 gap-3">
          <AssetInput
            label="MEZO to lock"
            symbol="MEZO"
            value={mezoInput}
            onChange={setMezoInput}
            step="10"
            helper="Creates a veMEZO governance position (NFT)"
            balance={mezoBalance.data as bigint | undefined}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between px-0.5">
              <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                Lock duration
              </span>
              {projectedVotingPower !== undefined && (
                <span className="font-mono text-[11px] tabular-nums text-zinc-400">
                  ≈ {projectedVotingPower.toFixed(2)}{" "}
                  <Term k="voteWeight">vote weight</Term>
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1 rounded-lg border border-white/[0.07] bg-zinc-950/40 p-1">
              {DURATION_PRESETS.map((preset, i) => {
                const active = i === durationIdx;
                const mezoIn = Number(mezoInput);
                const projected =
                  Number.isFinite(mezoIn) && mezoIn > 0
                    ? mezoIn * preset.weight
                    : undefined;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setDurationIdx(i)}
                    className={
                      active
                        ? "flex flex-col items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.07] px-2 py-2 text-[11px] font-medium text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        : "flex flex-col items-center gap-0.5 rounded-md border border-transparent px-2 py-2 text-[11px] font-medium text-zinc-500 transition-colors hover:bg-white/[0.03] hover:text-zinc-200"
                    }
                  >
                    <span className="font-mono tabular-nums">{preset.label}</span>
                    <span
                      className={
                        "font-mono text-[10px] tabular-nums " +
                        (active ? "text-zinc-400" : "text-zinc-600")
                      }
                    >
                      {projected !== undefined
                        ? `≈ ${formatVeMezo(projected)} veMEZO`
                        : `${preset.weight.toFixed(2)}×`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      }
      outcome={
        <PreviewPanel
          isLoading={sim.isFetching}
          error={sim.error as Error | null}
          result={sim.data}
          userAddress={address}
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
            onClick={onLock}
            disabled={!sim.data || veMezoPlaceholder || isExecuting}
            className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            <Lock weight="fill" className="mr-1.5 h-3.5 w-3.5" />
            Lock MEZO
          </Button>
        </>
      }
    />
  );
}
