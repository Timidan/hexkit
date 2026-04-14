import React, { useMemo, useState, useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import {
  Lightning,
  ArrowRight,
  CircleNotch,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../ui/dialog";
import ChainIcon from "../../icons/ChainIcon";
import { TokenIcon } from "./TokenIcon";
import { useIdleBalances } from "./concierge/hooks/useIdleBalances";
import type { IdleAsset } from "./concierge/types";
import type { EarnVault } from "./types";

interface IdleYieldBannerProps {
  onSelectVault: (vault: EarnVault) => void;
  targetAddress: string | null;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function formatApy(apy: number | null | undefined): string {
  if (apy == null || !Number.isFinite(apy)) return "—";
  return `${apy.toFixed(2)}%`;
}

function formatBalance(amount: string): string {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return "—";
  if (n > 0 && n < 0.001) return "<0.001";
  if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

interface ScoredSuggestion {
  asset: IdleAsset;
  vault: EarnVault;
  apy: number;
}

function buildSuggestions(
  idleAssets: IdleAsset[],
  vaults: EarnVault[],
): ScoredSuggestion[] {
  const vaultIndex = new Map<string, EarnVault[]>();
  for (const v of vaults) {
    if (!v.isTransactional) continue;
    for (const u of v.underlyingTokens ?? []) {
      const key = `${v.chainId}:${u.address.toLowerCase()}`;
      const arr = vaultIndex.get(key) ?? [];
      arr.push(v);
      vaultIndex.set(key, arr);
    }
  }

  const suggestions: ScoredSuggestion[] = [];

  for (const asset of idleAssets) {
    if (asset.amountUsd != null && asset.amountUsd < 1) continue;
    const key = `${asset.chainId}:${asset.token.address.toLowerCase()}`;
    const candidates = vaultIndex.get(key);
    if (!candidates?.length) continue;

    let bestVault: EarnVault | null = null;
    let bestApy = -1;
    for (const v of candidates) {
      const apy = v.analytics?.apy?.total ?? 0;
      if (apy > bestApy) {
        bestApy = apy;
        bestVault = v;
      }
    }

    if (bestVault && bestApy > 0) {
      suggestions.push({ asset, vault: bestVault, apy: bestApy });
    }
  }

  suggestions.sort((a, b) => (b.asset.amountUsd ?? 0) - (a.asset.amountUsd ?? 0));
  return suggestions;
}

/**
 * Renders a small inline icon button. Place it next to the page title.
 * Clicking it opens a dialog listing idle yield opportunities.
 */
export function IdleYieldBanner({ onSelectVault, targetAddress }: IdleYieldBannerProps) {
  const { address: connectedAddress } = useAccount();
  const isReadOnly = targetAddress != null && targetAddress.toLowerCase() !== connectedAddress?.toLowerCase();
  const { isLoading, idleAssets, vaults } = useIdleBalances(targetAddress);
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(
    () => buildSuggestions(idleAssets, vaults),
    [idleAssets, vaults],
  );

  const totalIdle = useMemo(
    () => suggestions.reduce((sum, s) => sum + (s.asset.amountUsd ?? 0), 0),
    [suggestions],
  );

  if (targetAddress == null) return null;

  if (isLoading) {
    return (
      <span className="inline-flex items-center" title="Scanning for idle assets...">
        <CircleNotch className="h-4 w-4 animate-spin text-emerald-500" />
      </span>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setOpen(true); } }}
        className="relative inline-flex h-[18px] min-w-[18px] cursor-pointer items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white transition-all hover:bg-emerald-400"
        title={`${formatUsd(totalIdle)} idle — ${suggestions.length} yield opportunities`}
      >
        {suggestions.length}
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[380px] p-0 gap-0 overflow-hidden">
          <div className="border-b border-emerald-500/15 px-5 pt-5 pb-4">
            <DialogHeader className="gap-1.5">
              <DialogTitle className="flex items-center gap-2.5 text-base">
                <Lightning className="h-4.5 w-4.5 text-emerald-500" weight="fill" />
                Yield Opportunities
              </DialogTitle>
              <DialogDescription className="text-sm">
                <span className="font-semibold text-emerald-500">{formatUsd(totalIdle)}</span>
                {" "}idle across {suggestions.length} {suggestions.length === 1 ? "asset" : "assets"}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {suggestions.map((s, i) => (
              <button
                key={`${s.asset.chainId}-${s.asset.token.address}-${i}`}
                type="button"
                disabled={isReadOnly}
                onClick={() => {
                  setOpen(false);
                  onSelectVault(s.vault);
                }}
                className="group flex w-full items-center gap-3 border-b border-border/20 px-5 py-3.5 text-left transition-colors last:border-0 hover:bg-emerald-500/[0.04] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <div className="relative flex-none">
                  <TokenIcon
                    token={s.asset.token}
                    chainId={s.asset.chainId}
                    className="h-9 w-9 rounded-full"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5">
                    <ChainIcon chainId={s.asset.chainId} size={14} rounded={999} />
                  </div>
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium truncate">
                    {formatBalance(s.asset.amountDecimal)} {s.asset.token.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {s.vault.protocol.name} · {s.asset.chainName}
                  </span>
                </div>

                <div className="flex flex-none flex-col items-end gap-0.5">
                  <span className="font-mono text-sm font-semibold text-emerald-500">
                    {formatApy(s.apy)}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-emerald-500">
                    {isReadOnly ? "Connect wallet to deposit" : <><span>Deposit</span> <ArrowRight className="h-3 w-3" /></>}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
