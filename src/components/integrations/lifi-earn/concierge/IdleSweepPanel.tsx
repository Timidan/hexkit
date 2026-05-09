import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useEarnAdapter } from "../../../../features/earn/context/EarnAdapterContext";
import { Button } from "../../../../components/ui/button";
import { useIdleBalances } from "./hooks/useIdleBalances";
import { useVaultRecommendations } from "./hooks/useVaultRecommendations";
import { useExecutionLegs } from "./hooks/useExecutionLegs";
import { IdleAssetsTable, keyForAsset, rawFromPercent } from "./IdleAssetsTable";
import { VaultRecommendations } from "./VaultRecommendations";
import { DestinationPicker } from "./DestinationPicker";
import { ExecutionQueue } from "./ExecutionQueue";
import { FlowDiagram, type RoutingMode } from "./FlowDiagram";
import { LlmErrorAlert } from "./LlmErrorAlert";
import {
  EXTENDED_NETWORKS,
  type ExtendedChain,
} from "../../../shared/NetworkSelector";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import ChainIcon from "../../../icons/ChainIcon";
import { CaretDown, CaretRight, Check, Globe } from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import type { IdleAsset, SelectedSource } from "./types";
import type { EarnVault } from "../types";

interface IdleSweepPanelProps {
  targetAddress: string | null;
}

/**
 * Holdings-driven concierge. Scans wallet for idle balances, then asks the
 * LLM (or rules fallback) to pick best/safest vaults for each held asset.
 *
 * This is the "what should I do with what I already have?" entry point. For
 * the "I have a goal, find me a vault" entry point, see IntentPanel.
 */
export function IdleSweepPanel({ targetAddress }: IdleSweepPanelProps) {
  const { connectedAddress } = useEarnAdapter();
  const isReadOnly =
    targetAddress != null &&
    targetAddress.toLowerCase() !== connectedAddress?.toLowerCase();

  const {
    isLoading: scanLoading,
    isError: scanError,
    error: scanErrorObj,
    vaults,
    idleAssets,
    dustAssets,
    dustHidden,
    chainsScanned,
    chainsReachable,
  } = useIdleBalances(targetAddress);

  const [selections, setSelections] = useState<Map<string, SelectedSource>>(
    new Map()
  );

  const [routingMode, setRoutingMode] = useState<RoutingMode>("per-asset");
  const [consolidatedDestination, setConsolidatedDestination] =
    useState<EarnVault | null>(null);
  const [consolidatedDestinationChainId, setConsolidatedDestinationChainId] =
    useState<number | undefined>(undefined);
  const [perAssetDestinations, setPerAssetDestinations] = useState<
    Map<string, EarnVault>
  >(new Map());

  const [showDust, setShowDust] = useState(false);
  const graphRef = useRef<HTMLDivElement>(null);

  const hasAnyDestination =
    routingMode === "consolidate"
      ? consolidatedDestination !== null
      : perAssetDestinations.size > 0;

  const prevHasDestRef = useRef(false);
  useEffect(() => {
    if (!prevHasDestRef.current && hasAnyDestination) {
      const raf = requestAnimationFrame(() => {
        graphRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
      prevHasDestRef.current = true;
      return () => cancelAnimationFrame(raf);
    }
    if (!hasAnyDestination) {
      prevHasDestRef.current = false;
    }
  }, [hasAnyDestination]);

  const { state: legState, dispatch: legDispatch } = useExecutionLegs();

  const {
    data: recsData,
    isLoading: recsLoading,
    isFetching: recsFetching,
    refetch: refetchRecs,
  } = useVaultRecommendations({
    sources: Array.from(selections.values()),
    vaults,
    destinationChainId:
      routingMode === "consolidate" ? consolidatedDestinationChainId : undefined,
    targetAddress,
    connectedAddress: connectedAddress ?? null,
  });
  const recommendations = recsData?.recommendations ?? [];
  const llmError = recsData?.llmError ?? null;

  const onToggle = useCallback((asset: IdleAsset, on: boolean) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const key = keyForAsset(asset);
      if (on) next.set(key, { asset, amountRaw: asset.amountRaw });
      else next.delete(key);
      return next;
    });
  }, []);

  const onAmountChange = useCallback((asset: IdleAsset, percent: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const key = keyForAsset(asset);
      const existing = next.get(key);
      if (!existing) return prev;
      next.set(key, { asset, amountRaw: rawFromPercent(asset, percent) });
      return next;
    });
  }, []);

  useEffect(() => {
    setSelections(new Map());
    setConsolidatedDestination(null);
    setConsolidatedDestinationChainId(undefined);
    setPerAssetDestinations(new Map());
    legDispatch({ type: "RESET" });
  }, [targetAddress, legDispatch]);

  // Drop stale selections after rescan, clamp over-balance amounts.
  // Skipped while a queue is in flight.
  useEffect(() => {
    if (legState.legs.length > 0) return;

    setSelections((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map<string, SelectedSource>();
      for (const [key, sel] of prev) {
        const fresh = idleAssets.find((a) => keyForAsset(a) === key);
        if (!fresh) {
          changed = true;
          continue;
        }
        let freshMax = 0n;
        let selRaw = 0n;
        try {
          freshMax = BigInt(fresh.amountRaw);
        } catch {}
        try {
          selRaw = BigInt(sel.amountRaw);
        } catch {}
        if (freshMax === 0n) {
          changed = true;
          continue;
        }
        const clampedRaw = selRaw > freshMax ? freshMax : selRaw;
        if (sel.asset !== fresh || clampedRaw !== selRaw) {
          changed = true;
          next.set(key, { asset: fresh, amountRaw: clampedRaw.toString() });
        } else {
          next.set(key, sel);
        }
      }
      return changed ? next : prev;
    });
  }, [idleAssets, legState.legs.length]);

  const runnableSelections = Array.from(selections.values()).filter((s) => {
    try {
      return BigInt(s.amountRaw) > 0n;
    } catch {
      return false;
    }
  });
  const runnableCount = runnableSelections.length;

  useEffect(() => {
    if (recommendations.length === 0) return;
    if (selections.size === 0) return;
    setPerAssetDestinations((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const [key] of selections) {
        if (next.has(key)) continue;
        const [chainIdStr, addr] = key.split(":");
        const rec = recommendations.find(
          (r) =>
            r.forChainId === Number(chainIdStr) &&
            r.forTokenAddress === addr
        );
        const best = rec?.bestPick?.vault;
        if (best) {
          next.set(key, best);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [recommendations, selections]);

  useEffect(() => {
    setPerAssetDestinations((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map<string, EarnVault>();
      for (const [key, vault] of prev) {
        if (selections.has(key)) next.set(key, vault);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [selections]);

  const setPerAssetDestination = useCallback(
    (selectionKey: string, vault: EarnVault) => {
      setPerAssetDestinations((prev) => {
        const next = new Map(prev);
        next.set(selectionKey, vault);
        return next;
      });
    },
    []
  );

  const canBuildQueue = useMemo(() => {
    if (runnableCount === 0) return false;
    if (routingMode === "consolidate") return consolidatedDestination !== null;
    return runnableSelections.every((s) =>
      perAssetDestinations.has(keyForAsset(s.asset))
    );
  }, [
    runnableCount,
    routingMode,
    consolidatedDestination,
    runnableSelections,
    perAssetDestinations,
  ]);

  const buildQueue = useCallback(() => {
    if (runnableSelections.length === 0) return;
    if (routingMode === "consolidate") {
      if (!consolidatedDestination) return;
      legDispatch({
        type: "BUILD_QUEUE",
        sources: runnableSelections,
        destination: consolidatedDestination,
      });
      return;
    }
    const legs: Array<{ source: SelectedSource; destination: EarnVault }> = [];
    for (const src of runnableSelections) {
      const dest = perAssetDestinations.get(keyForAsset(src.asset));
      if (!dest) continue;
      legs.push({ source: src, destination: dest });
    }
    if (legs.length === 0) return;
    legDispatch({ type: "BUILD_QUEUE_PER_ASSET", legs });
  }, [
    runnableSelections,
    routingMode,
    consolidatedDestination,
    perAssetDestinations,
    legDispatch,
  ]);

  const queueBuilt = legState.legs.length > 0;
  const hasInFlightStep = legState.legs.some((l) =>
    ["quoting", "approving", "executing", "bridging", "ready"].includes(l.status)
  );
  useEffect(() => {
    if (isReadOnly) return;
    if (!queueBuilt || hasInFlightStep) return;
    const wasStarted = legState.started;
    buildQueue();
    if (wasStarted) {
      legDispatch({ type: "START" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReadOnly, consolidatedDestination, perAssetDestinations]);

  useEffect(() => {
    if (isReadOnly) return;
    if (!canBuildQueue) return;
    if (legState.legs.length > 0) return;
    buildQueue();
  }, [isReadOnly, canBuildQueue, legState.legs.length, buildQueue]);

  useEffect(() => {
    if (isReadOnly) return;
    if (legState.legs.length === 0) return;
    if (legState.started) return;
    legDispatch({ type: "START" });
  }, [isReadOnly, legState.legs.length, legState.started, legDispatch]);

  const totalAssets = idleAssets.length;
  const totalSelected = selections.size;

  const vaultChainNetworks = useMemo<ExtendedChain[]>(() => {
    const chainIds = new Set<number>();
    for (const v of vaults) {
      if (!v.isTransactional) continue;
      chainIds.add(v.chainId);
    }
    return EXTENDED_NETWORKS.filter(
      (n) => !n.isTestnet && chainIds.has(n.id)
    );
  }, [vaults]);

  const selectedConsolidatedNetwork = useMemo<ExtendedChain | null>(() => {
    if (consolidatedDestinationChainId === undefined) return null;
    return (
      vaultChainNetworks.find((n) => n.id === consolidatedDestinationChainId) ??
      null
    );
  }, [consolidatedDestinationChainId, vaultChainNetworks]);

  const onConsolidatedChainChange = useCallback((network: ExtendedChain) => {
    setConsolidatedDestinationChainId(network.id);
    setConsolidatedDestination(null);
  }, []);

  if (!targetAddress) {
    return (
      <div className="rounded-lg border border-dashed border-border/40 p-6 text-center text-xs text-muted-foreground">
        Connect your wallet or enter an address above to scan idle balances.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <IdleAssetsTable
        assets={idleAssets}
        selections={selections}
        onToggle={onToggle}
        onAmountChange={onAmountChange}
        isLoading={scanLoading}
      />

      <div className="rounded-lg border border-border/40 bg-muted/10">
        {/* Status row */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <p className="text-xs text-muted-foreground">
            {scanLoading
              ? "Scanning idle balances…"
              : `${chainsReachable} of ${chainsScanned} chains · ${totalAssets} idle · ${totalSelected} selected`}
          </p>
          {scanError && (
            <p className="text-xs text-red-500">
              {(scanErrorObj as Error)?.message ?? "Scan error"}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {totalSelected > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div
                    role="group"
                    aria-label="Routing mode"
                    className="flex items-center gap-0.5 rounded-md border border-border/40 bg-background/60 p-0.5"
                  >
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                        routingMode === "per-asset"
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setRoutingMode("per-asset")}
                    >
                      Per-asset
                    </button>
                    <button
                      type="button"
                      className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                        routingMode === "consolidate"
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setRoutingMode("consolidate")}
                    >
                      Consolidate
                    </button>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px] text-[11px]">
                  {routingMode === "per-asset"
                    ? "Each asset goes to its own vault (may be on different chains)."
                    : "All assets consolidate into one vault (LI.FI Composer bridges as needed)."}
                </TooltipContent>
              </Tooltip>
            )}

            {totalSelected > 0 && routingMode === "consolidate" && (
              <Popover>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="Destination chain"
                        className="inline-flex min-w-[140px] items-center gap-2 rounded-md border border-border/40 bg-background/60 px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-primary/40 hover:bg-background"
                      >
                        {selectedConsolidatedNetwork ? (
                          <ChainIcon
                            chainId={selectedConsolidatedNetwork.id}
                            chain={selectedConsolidatedNetwork.iconKey}
                            size={14}
                            rounded={999}
                          />
                        ) : (
                          <Globe size={14} className="text-muted-foreground" />
                        )}
                        <span className="flex-1 truncate text-left">
                          {selectedConsolidatedNetwork?.name ?? "Any chain"}
                        </span>
                        <CaretDown size={11} className="text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[260px] text-[11px]">
                    {selectedConsolidatedNetwork
                      ? `All sources will land on ${selectedConsolidatedNetwork.name}.`
                      : "Pick the chain every source should converge on. Unset = any chain."}
                  </TooltipContent>
                </Tooltip>
                <PopoverContent
                  align="end"
                  sideOffset={6}
                  className="w-[240px] p-1"
                >
                  <div className="max-h-[320px] overflow-y-auto">
                    {vaultChainNetworks.map((network) => {
                      const isSelected =
                        selectedConsolidatedNetwork?.id === network.id;
                      return (
                        <button
                          key={network.id}
                          type="button"
                          onClick={() => onConsolidatedChainChange(network)}
                          className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-accent/60 ${
                            isSelected ? "bg-primary/10" : ""
                          }`}
                        >
                          <ChainIcon
                            chainId={network.id}
                            chain={network.iconKey}
                            size={18}
                            rounded={999}
                          />
                          <span className="flex-1 truncate font-medium">
                            {network.name}
                          </span>
                          {isSelected && (
                            <Check size={14} className="shrink-0 text-primary" />
                          )}
                        </button>
                      );
                    })}
                    {vaultChainNetworks.length === 0 && (
                      <div className="px-2.5 py-3 text-center text-[11px] text-muted-foreground">
                        No vault chains loaded yet.
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </div>

        {dustHidden > 0 && (
          <>
            <div className="border-t border-border/30" />
            <button
              type="button"
              onClick={() => setShowDust((v) => !v)}
              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {showDust ? <CaretDown size={12} /> : <CaretRight size={12} />}
              <span>
                {dustHidden} low-value token{dustHidden === 1 ? "" : "s"} hidden
                {" "}
                <span className="text-muted-foreground/60">(under $1.50)</span>
              </span>
            </button>
            {showDust && (
              <div className="border-t border-border/30 px-3 py-2">
                <div className="space-y-1.5">
                  {dustAssets.map((a) => (
                    <div
                      key={`${a.chainId}:${a.token.address}`}
                      className="flex items-center justify-between text-xs text-muted-foreground"
                    >
                      <div className="flex items-center gap-2">
                        <ChainIcon chainId={a.chainId} size={14} rounded={999} />
                        <span className="font-medium text-foreground/70">
                          {a.token.symbol}
                        </span>
                        <span className="text-muted-foreground/50">
                          {a.amountDecimal}
                        </span>
                      </div>
                      <span>
                        {a.amountUsd != null ? `$${a.amountUsd.toFixed(2)}` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {totalSelected > 0 && (
        <>
          <LlmErrorAlert
            error={llmError}
            onRetry={refetchRecs}
            isRetrying={recsFetching}
          />
          <VaultRecommendations
            selections={selections}
            recommendations={recommendations}
            destination={
              routingMode === "consolidate" ? consolidatedDestination : null
            }
            perAssetDestinations={
              routingMode === "per-asset" ? perAssetDestinations : undefined
            }
            onPick={(vault, selectionKey) => {
              if (routingMode === "consolidate") {
                setConsolidatedDestination(vault);
              } else if (selectionKey) {
                setPerAssetDestination(selectionKey, vault);
              }
            }}
            isLoading={recsLoading || recsFetching}
          />
        </>
      )}

      {totalSelected > 0 && routingMode === "consolidate" && (
        <DestinationPicker
          destination={consolidatedDestination}
          onPick={(vault) => {
            setConsolidatedDestination(vault);
            setConsolidatedDestinationChainId(vault.chainId);
          }}
          lockedChainId={consolidatedDestinationChainId}
        />
      )}

      {totalSelected > 0 && (
        <div ref={graphRef} className="scroll-mt-20">
          <FlowDiagram
            selections={Array.from(selections.values())}
            consolidatedDestination={consolidatedDestination}
            perAssetDestinations={perAssetDestinations}
            routingMode={routingMode}
            legs={legState.legs}
          />
        </div>
      )}

      {totalSelected > 0 && legState.legs.length === 0 && (
        <div className="flex items-center justify-center">
          {runnableCount === 0 && (
            <span className="text-[10px] text-muted-foreground">
              Slide a selected asset above 0% to run it.
            </span>
          )}
          {runnableCount > 0 && !canBuildQueue && (
            <span className="text-[10px] text-muted-foreground">
              {routingMode === "consolidate"
                ? "Pick a destination vault to continue."
                : "Every selected asset needs a destination."}
            </span>
          )}
        </div>
      )}

      {isReadOnly ? (
        <div className="rounded-lg border border-dashed border-yellow-500/30 bg-yellow-500/5 p-6 text-center">
          <p className="text-xs text-muted-foreground">
            Connect your wallet to deposit these assets into yield vaults.
          </p>
        </div>
      ) : (
        <ExecutionQueue state={legState} dispatch={legDispatch} />
      )}
    </div>
  );
}
