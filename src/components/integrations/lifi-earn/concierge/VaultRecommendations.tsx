import React, { useState } from "react";
import { ArrowsLeftRight, ArrowsClockwise } from "@phosphor-icons/react";
import { Card } from "../../../../components/ui/card";
import { Badge } from "../../../../components/ui/badge";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "../../../../components/ui/hover-card";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../../../../components/ui/tooltip";
import ChainIcon from "../../../icons/ChainIcon";
import { VaultForecastButton } from "../simulator/VaultPositionSimulator";
import type {
  VaultRecommendation,
  SelectedSource,
  RecommendationPick,
} from "./types";
import type { EarnVault } from "../types";

/**
 * Normalized per-card view model. Both portfolio (idle-sweep) and intent
 * (free-form yield goal) modes build a list of these and feed them in — no
 * synthetic IdleAsset sentinel is needed to fake the intent-mode path.
 */
export interface RecommendationTarget {
  /** `${chainId}:${tokenAddress}` — must match `rec.forChainId:rec.forTokenAddress`. */
  key: string;
  /** Card header title. */
  displayTitle: string;
  /** Chain ID for the header ChainIcon. `null` or `0` = hide the icon. */
  displayChainId: number | null;
  /** Tooltip text for the chain icon (human-readable chain name). */
  displayChainName: string;
  /**
   * Source chain used for route detection (bridge required?). `null` skips
   * route detection — intent mode passes null because the recommendation is
   * not tied to a specific source chain.
   */
  sourceChainId: number | null;
}

interface VaultRecommendationsProps {
  targets: RecommendationTarget[];
  recommendations: VaultRecommendation[];
  destination: EarnVault | null;
  perAssetDestinations?: Map<string, EarnVault>;
  onPick: (vault: EarnVault, selectionKey: string) => void;
  isLoading?: boolean;
  sourceTokenSymbol?: string | null;
  /** Notice text to show above recommendations (e.g. symbol-relaxation warning). */
  headerNotice?: string | null;
  /** Cap on visible vault slots. 1 = Best only, 2 = Best+Safest, 3 = +1 Alt, 4/null = all. */
  resultCount?: number | null;
}

/** Convenience: build portfolio-mode targets from an idle-sweep selections map. */
export function portfolioTargets(
  selections: Map<string, SelectedSource>,
): RecommendationTarget[] {
  const out: RecommendationTarget[] = [];
  for (const [key, sel] of selections) {
    out.push({
      key,
      displayTitle: sel.asset.token.symbol,
      displayChainId: sel.asset.chainId,
      displayChainName: sel.asset.chainName,
      sourceChainId: sel.asset.chainId > 0 ? sel.asset.chainId : null,
    });
  }
  return out;
}

export function VaultRecommendations({
  targets,
  recommendations,
  destination,
  perAssetDestinations,
  onPick,
  isLoading = false,
  sourceTokenSymbol,
  headerNotice,
  resultCount,
}: VaultRecommendationsProps) {
  if (targets.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
        Select one or more idle assets above to see vault recommendations.
      </div>
    );
  }

  const targetByKey = new Map(targets.map((t) => [t.key, t]));
  const relevant = recommendations.filter((r) =>
    targetByKey.has(`${r.forChainId}:${r.forTokenAddress}`),
  );

  if (isLoading && relevant.length === 0) {
    return <RecommendationsSkeleton count={targets.length} />;
  }

  if (relevant.length === 0) {
    return (
      <div className="rounded-md border border-border/40 bg-background/30 p-4 text-xs text-muted-foreground">
        No recommendations available for the selected assets.
      </div>
    );
  }

  const maxSlots = resultCount != null ? Math.min(Math.max(resultCount, 1), 4) : 4;

  return (
    <div className="space-y-2">
      {headerNotice && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
          {headerNotice}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {relevant.map((rec) => {
          const key = `${rec.forChainId}:${rec.forTokenAddress}`;
          const target = targetByKey.get(key);
          if (!target) return null;

          const activeDestination =
            perAssetDestinations?.get(key) ?? destination;

          // Build slots, respecting maxSlots cap.
          // When capped to fewer slots, prefer populated picks so a missing
          // bestPick doesn't hide a valid safestPick or alternative.
          const allSlots: Array<{ label: string; pick: RecommendationPick | null }> = [
            { label: "Best", pick: rec.bestPick },
            { label: "Safest", pick: rec.safestPick },
            ...rec.alternatives
              .slice(0, 2)
              .map((p) => ({ label: "Alt", pick: p })),
          ];
          const populated = allSlots.filter((s) => s.pick !== null);
          const empty = allSlots.filter((s) => s.pick === null);
          const slots = [...populated, ...empty].slice(0, maxSlots);
          while (slots.length < maxSlots && slots.length < 4) {
            slots.push({ label: "—", pick: null });
          }

          const showChainIcon =
            target.displayChainId != null && target.displayChainId > 0;

          return (
            <Card key={key} className={maxSlots === 1 ? "p-3 sm:col-span-2" : "p-3"}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight">
                  {target.displayTitle}
                </span>
                {showChainIcon && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-help">
                          <ChainIcon chainId={target.displayChainId!} size={16} rounded={999} />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {target.displayChainName}
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Badge
                  variant={rec.source === "ai" ? "default" : "secondary"}
                  className="ml-auto text-[9px]"
                >
                  {rec.source === "ai" ? "AI" : "Rules"}
                </Badge>
              </div>

              <div className={maxSlots === 1 ? "grid grid-cols-1 gap-1.5" : "grid grid-cols-2 gap-1.5"}>
                {slots.map((slot, idx) => (
                  <VaultPill
                    key={`${slot.label}-${idx}`}
                    label={slot.label}
                    pick={slot.pick}
                    isDestination={
                      !!activeDestination &&
                      !!slot.pick &&
                      activeDestination.slug === slot.pick.vaultSlug
                    }
                    onPick={(v) => onPick(v, key)}
                    sourceTokenSymbol={sourceTokenSymbol}
                    sourceChainId={target.sourceChainId ?? undefined}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Symbol-alias groups — "ETH" and "WETH" are effectively the same asset. */
const SWAP_ALIAS_GROUPS: ReadonlyArray<ReadonlySet<string>> = [
  new Set(["ETH", "WETH"]),
  new Set(["BTC", "WBTC", "CBBTC", "TBTC"]),
  new Set(["USDC", "USDC.E", "USDBC"]),
  new Set(["USDT", "USDT.E"]),
  new Set(["MATIC", "WMATIC", "POL"]),
];

function needsSwap(sourceSymbol: string | null | undefined, vault: EarnVault): boolean {
  if (!sourceSymbol) return false;
  const src = sourceSymbol.toUpperCase();
  const underlyings = (vault.underlyingTokens ?? []).map((t) => t.symbol.toUpperCase());
  if (underlyings.length === 0) return false;
  // Check direct match or alias match
  for (const u of underlyings) {
    if (u === src) return false;
    for (const group of SWAP_ALIAS_GROUPS) {
      if (group.has(src) && group.has(u)) return false;
    }
  }
  return true;
}

function VaultPill({
  label,
  pick,
  isDestination,
  onPick,
  sourceTokenSymbol,
  sourceChainId,
}: {
  label: string;
  pick: RecommendationPick | null;
  isDestination: boolean;
  onPick: (v: EarnVault) => void;
  sourceTokenSymbol?: string | null;
  sourceChainId?: number;
}) {
  if (!pick) {
    return (
      <div className="flex min-h-[52px] items-center justify-center rounded-md border border-dashed border-border/30 bg-background/20 text-[9px] uppercase tracking-wide text-muted-foreground/50">
        {label === "—" ? "empty" : `no ${label.toLowerCase()}`}
      </div>
    );
  }

  const apy = pick.vault.analytics.apy.total;
  const apyStr = apy != null ? `${apy.toFixed(2)}%` : "—";
  const vaultName = pick.vault.name ?? pick.vault.slug;
  const tvlUsd = Number(pick.vault.analytics.tvl?.usd ?? "0");
  const tvlStr = formatCompactUsd(tvlUsd);
  const swapRequired = needsSwap(sourceTokenSymbol, pick.vault);
  const bridgeRequired = sourceChainId != null && pick.vault.chainId !== sourceChainId;
  const vaultAccepts = (pick.vault.underlyingTokens ?? []).map((t) => t.symbol).join("/");

  // Keep the HoverCard open while the forecast popover is mounted so Radix
  // doesn't lose its anchor when the cursor moves into the popover.
  const [hoverOpen, setHoverOpen] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);

  return (
    <HoverCard
      openDelay={120}
      closeDelay={100}
      open={hoverOpen || forecastOpen}
      onOpenChange={setHoverOpen}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => onPick(pick.vault)}
          aria-label={`Set ${vaultName} as destination`}
          aria-pressed={isDestination}
          className={`group relative flex min-w-0 flex-col rounded-md border px-2.5 py-2 text-left transition-all duration-150 ease-out hover:-translate-y-px ${
            isDestination
              ? "border-emerald-500/60 bg-emerald-500/10"
              : "border-border/40 bg-background/30 hover:border-emerald-500/40 hover:bg-emerald-500/5"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
            <span className="flex items-center gap-1.5">
              {isDestination && (
                <span
                  className="text-[10px] font-bold text-emerald-500"
                  aria-hidden
                >
                  ✓
                </span>
              )}
              <ChainIcon
                chainId={pick.vault.chainId}
                size={14}
                rounded={999}
              />
            </span>
          </div>
          <span className="mt-0.5 truncate text-xs font-medium text-foreground">
            {vaultName}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-emerald-500">
            {apyStr} APY
          </span>
          {(swapRequired || bridgeRequired) && (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[8px] font-medium">
              {bridgeRequired && (
                <span className="flex items-center gap-0.5 text-sky-400">
                  <ArrowsClockwise className="h-2.5 w-2.5" weight="bold" />
                  Bridge
                </span>
              )}
              {swapRequired && (
                <span className="flex items-center gap-0.5 text-amber-500">
                  <ArrowsLeftRight className="h-2.5 w-2.5" weight="bold" />
                  Swap to {vaultAccepts}
                </span>
              )}
            </span>
          )}
        </button>
      </HoverCardTrigger>

      <HoverCardContent
        side="top"
        align="start"
        className="w-72 p-3"
      >
        <div className="mb-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{vaultName}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <ChainIcon chainId={pick.vault.chainId} size={12} rounded={999} />
              <span>
                {pick.vault.protocol.name} · {pick.vault.network}
              </span>
            </div>
          </div>
          {isDestination && (
            <Badge className="bg-emerald-500/20 text-[9px] text-emerald-500">
              Destination
            </Badge>
          )}
        </div>

        {(swapRequired || bridgeRequired) && (
          <div className="mb-2 flex flex-col gap-1">
            {bridgeRequired && (
              <div className="flex items-center gap-1.5 rounded-md border border-sky-500/20 bg-sky-500/5 px-2 py-1.5 text-[10px] text-sky-400">
                <ArrowsClockwise className="h-3 w-3 flex-none" weight="bold" />
                <span>Bridge to {pick.vault.network ?? `chain ${pick.vault.chainId}`} via LI.FI</span>
              </div>
            )}
            {swapRequired && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] text-amber-500">
                <ArrowsLeftRight className="h-3 w-3 flex-none" weight="bold" />
                <span>Swap {sourceTokenSymbol} → {vaultAccepts} via LI.FI</span>
              </div>
            )}
          </div>
        )}

        {pick.rationale && (
          <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
            {pick.rationale}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 border-t border-border/40 pt-2 text-[10px]">
          <div>
            <div className="uppercase tracking-wider text-muted-foreground/70">
              APY
            </div>
            <div className="mt-0.5 font-mono text-sm tabular-nums text-emerald-500">
              {apyStr}
            </div>
          </div>
          <div>
            <div className="uppercase tracking-wider text-muted-foreground/70">
              TVL
            </div>
            <div className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
              {tvlStr}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-muted-foreground/70">
          <span className="flex-1">
            Click the pill to {isDestination ? "keep" : "set"} as destination.
          </span>
          <VaultForecastButton
            vault={pick.vault}
            onOpenChange={setForecastOpen}
            triggerClassName="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function formatCompactUsd(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function RecommendationsSkeleton({ count }: { count: number }) {
  const cardCount = Math.max(1, Math.min(count, 8));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="relative inline-flex h-2 w-2">
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span>AI is picking the best vaults for each asset…</span>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: cardCount }).map((_, cardIdx) => (
          <div
            key={cardIdx}
            className="rounded-xl border border-border/40 bg-background/30 p-3"
            style={{ animationDelay: `${cardIdx * 80}ms` }}
          >
            <div className="mb-2.5 flex items-center gap-2">
              <div
                className="h-3 w-10 animate-pulse rounded bg-muted/60"
                style={{ animationDelay: `${cardIdx * 80}ms` }}
              />
              <span className="text-muted-foreground/30">·</span>
              <div
                className="h-4 w-4 animate-pulse rounded-full bg-muted/60"
                style={{ animationDelay: `${cardIdx * 80 + 40}ms` }}
              />
              <div
                className="ml-auto h-4 w-8 animate-pulse rounded bg-muted/60"
                style={{ animationDelay: `${cardIdx * 80 + 80}ms` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }).map((_, pillIdx) => (
                <div
                  key={pillIdx}
                  className="flex min-h-[52px] flex-col gap-1.5 rounded-md border border-border/40 bg-background/40 px-2.5 py-2"
                  style={{
                    animationDelay: `${cardIdx * 80 + pillIdx * 60}ms`,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div
                      className="h-2 w-8 animate-pulse rounded bg-muted/60"
                      style={{
                        animationDelay: `${cardIdx * 80 + pillIdx * 60}ms`,
                      }}
                    />
                    <div
                      className="h-3 w-3 animate-pulse rounded-full bg-muted/60"
                      style={{
                        animationDelay: `${cardIdx * 80 + pillIdx * 60 + 30}ms`,
                      }}
                    />
                  </div>
                  <div
                    className="mt-0.5 h-3 w-[85%] animate-pulse rounded bg-muted/60"
                    style={{
                      animationDelay: `${cardIdx * 80 + pillIdx * 60 + 60}ms`,
                    }}
                  />
                  <div
                    className="h-2 w-12 animate-pulse rounded bg-emerald-500/20"
                    style={{
                      animationDelay: `${cardIdx * 80 + pillIdx * 60 + 90}ms`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
