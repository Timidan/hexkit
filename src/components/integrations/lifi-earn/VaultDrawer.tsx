import React from "react";
import { TrendUp, ArrowSquareOut } from "@phosphor-icons/react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../../components/ui/sheet";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import type { EarnVault } from "./types";
import { TokenIcon } from "./TokenIcon";
import { DepositFlow } from "./DepositFlow";

function formatApy(apy: number | null): string {
  if (apy === null || apy === undefined) return "—";
  return `${apy.toFixed(2)}%`;
}

function formatTvl(tvlUsd: string): string {
  const n = parseFloat(tvlUsd);
  if (isNaN(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

interface VaultDrawerProps {
  vault: EarnVault | null;
  open: boolean;
  onClose: () => void;
}

export function VaultDrawer({ vault, open, onClose }: VaultDrawerProps) {
  if (!vault) return null;

  const chainName =
    SUPPORTED_CHAINS.find((c) => c.id === vault.chainId)?.name ?? vault.network;
  const chain = SUPPORTED_CHAINS.find((c) => c.id === vault.chainId);

  const apy = vault.analytics.apy;
  const tokens = vault.underlyingTokens ?? [];

  const inspectUrl = `/explorer?tool=explorer&address=${vault.address}&chainId=${vault.chainId}`;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[480px] overflow-y-auto flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2 shrink-0">
              {tokens.slice(0, 3).map((token) => (
                <TokenIcon
                  key={token.address}
                  token={token}
                  chainId={vault.chainId}
                  className="h-8 w-8 rounded-full border-2 border-background bg-muted object-contain"
                />
              ))}
            </div>

            <div className="min-w-0">
              <SheetTitle className="text-base font-semibold leading-tight">
                {tokens.length > 0
                  ? tokens.map((t) => t.symbol).join(" / ")
                  : vault.name ?? vault.slug}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                on {chainName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2">
            {vault.protocol.logoURI && (
              <img
                src={vault.protocol.logoURI}
                alt={vault.protocol.name}
                className="h-4 w-4 rounded-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
            <span className="text-xs text-muted-foreground">
              {vault.protocol.name}
            </span>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="rounded-lg border border-border/40 bg-muted/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <TrendUp className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-2xl font-bold text-emerald-500 tabular-nums">
                {formatApy(apy.total)}
              </span>
              <span className="text-xs text-muted-foreground ml-1">Total APY</span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Base APY</span>
                <span className="tabular-nums">{formatApy(apy.base)}</span>
              </div>

              {apy.reward !== null && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Reward APY</span>
                  <span className="tabular-nums">{formatApy(apy.reward)}</span>
                </div>
              )}

              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">7d APY</span>
                <span className="tabular-nums">
                  {formatApy(vault.analytics.apy7d)}
                </span>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">30d APY</span>
                <span className="tabular-nums">
                  {formatApy(vault.analytics.apy30d)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">TVL</span>
            <span className="font-medium tabular-nums">
              {formatTvl(vault.analytics.tvl.usd)}
            </span>
          </div>

          {vault.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {vault.tags.map((tag) => (
                <span
                  key={tag}
                  className="border border-border/50 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {tokens.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Underlying tokens
              </p>
              <div className="rounded-md border border-border/40 divide-y divide-border/40">
                {tokens.map((token) => (
                  <div
                    key={token.address}
                    className="flex items-center gap-2.5 px-3 py-2"
                  >
                    <TokenIcon
                      token={token}
                      chainId={vault.chainId}
                      className="h-5 w-5 rounded-full border border-background bg-muted object-contain shrink-0"
                    />
                    <span className="text-sm font-medium shrink-0">{token.symbol}</span>
                    <span className="text-xs text-muted-foreground truncate font-mono">
                      {token.address}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <a
            href={inspectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
          >
            <ArrowSquareOut className="h-3 w-3" />
            Inspect vault contract
          </a>

          {vault.isTransactional && (
            <div className="pt-2">
              <DepositFlow vault={vault} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
