import React, { useMemo, useState } from "react";
import {
  CircleNotch,
  Wallet,
  CaretDown,
} from "@phosphor-icons/react";
import { useAccount } from "wagmi";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import ChainIcon from "../../icons/ChainIcon";
import { Button } from "../../../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../../components/ui/popover";
import { useEarnPositions } from "./hooks/useEarnPositions";
import { useEarnChains } from "./hooks/useEarnChains";
import { useVaultLookup, lookupVault } from "./hooks/useVaultLookup";
import { WithdrawFlow } from "./WithdrawFlow";
import { TokenIcon } from "./TokenIcon";
import type { EarnPosition, EarnVault } from "./types";

function formatUsd(usd: string | number | undefined): string {
  const n = typeof usd === "number" ? usd : parseFloat(usd ?? "");
  if (!Number.isFinite(n)) return "—";
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBalance(amount: string | undefined): string {
  const n = parseFloat(amount ?? "");
  if (!Number.isFinite(n)) return "—";
  if (n > 0 && n < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}

// "aave-v3" → "Aave v3"
function formatProtocolName(slug: string): string {
  if (!slug) return "—";
  return slug
    .split("-")
    .map((part) => {
      if (/^v\d+$/i.test(part)) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

// Deterministic hue 200-320° so protocol badges are stable and on-palette.
function hueForSlug(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return 200 + (hash % 120);
}

// DefiLlama slugs line up with LI.FI protocol.name; unknown slugs return HTML
// and trip the <img> onError, falling back to a gradient initial badge.
function protocolIconUrl(slug: string, size: number): string {
  return `https://icons.llamao.fi/icons/protocols/${encodeURIComponent(slug)}?w=${size}&h=${size}`;
}

function ProtocolBadge({ slug, size = 36 }: { slug: string; size?: number }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (formatProtocolName(slug).charAt(0) || "?").toUpperCase();
  const hue = hueForSlug(slug);
  const bg = `linear-gradient(135deg, hsl(${hue} 70% 55%) 0%, hsl(${(hue + 40) % 360} 65% 45%) 100%)`;

  if (!imgFailed) {
    return (
      <img
        src={protocolIconUrl(slug, Math.round(size * 2))}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        alt=""
        aria-hidden
        onError={() => setImgFailed(true)}
        className="flex-none rounded-full bg-background/40 object-cover shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      aria-hidden
      className="flex flex-none items-center justify-center rounded-full text-white font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
      style={{
        width: size,
        height: size,
        background: bg,
        fontSize: size * 0.42,
      }}
    >
      {initial}
    </div>
  );
}

type GroupMode = "protocol" | "chain";

// Top-level bucket aggregated along the primary dimension. `secondaryKeys` is
// the distinct set of the _other_ dimension seen within the group (chains
// when grouped by protocol, protocols when grouped by chain) — used to render
// the mini chip row on the header without re-walking positions.
interface PositionGroup {
  key: string;
  totalUsd: number;
  positions: EarnPosition[];
  secondaryKeys: string[];
}

function groupPositions(
  positions: EarnPosition[],
  mode: GroupMode,
): PositionGroup[] {
  const map = new Map<string, PositionGroup>();
  for (const pos of positions) {
    const key =
      mode === "protocol" ? pos.protocolName : String(pos.chainId);
    const secondary =
      mode === "protocol" ? String(pos.chainId) : pos.protocolName;
    const usd = parseFloat(pos.balanceUsd ?? "");
    const usdSafe = Number.isFinite(usd) ? usd : 0;

    let group = map.get(key);
    if (!group) {
      group = { key, totalUsd: 0, positions: [], secondaryKeys: [] };
      map.set(key, group);
    }
    group.totalUsd += usdSafe;
    group.positions.push(pos);
    if (!group.secondaryKeys.includes(secondary)) {
      group.secondaryKeys.push(secondary);
    }
  }

  const groups = Array.from(map.values());
  for (const g of groups) {
    g.positions.sort((a, b) => {
      const av = parseFloat(a.balanceUsd ?? "") || 0;
      const bv = parseFloat(b.balanceUsd ?? "") || 0;
      return bv - av;
    });
  }
  groups.sort((a, b) => b.totalUsd - a.totalUsd);
  return groups;
}

interface PositionsViewProps {
  targetAddress: string | null;
  vaults?: EarnVault[];
}

export function PositionsView({ targetAddress, vaults = [] }: PositionsViewProps) {
  const { data, isLoading, error } = useEarnPositions(targetAddress);
  const { data: earnChains } = useEarnChains();
  const [mode, setMode] = useState<GroupMode>("protocol");

  const positions = data?.positions ?? [];

  const totalUsd = positions.reduce((acc, pos) => {
    const n = parseFloat(pos.balanceUsd ?? "");
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const groups = useMemo(
    () => groupPositions(positions, mode),
    [positions, mode],
  );

  const vaultMap = useVaultLookup(vaults);
  const { address: connectedAddress } = useAccount();
  const [withdrawKey, setWithdrawKey] = useState<string | null>(null);

  const uniqueProtocolCount = useMemo(
    () => new Set(positions.map((p) => p.protocolName)).size,
    [positions],
  );
  const uniqueChainCount = useMemo(
    () => new Set(positions.map((p) => p.chainId)).size,
    [positions],
  );

  const chainNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const chain of SUPPORTED_CHAINS) {
      map[chain.id] = chain.name;
    }
    for (const chain of earnChains ?? []) {
      map[chain.chainId] = chain.name;
    }
    return map;
  }, [earnChains]);

  return (
    <div className={`flex flex-col gap-3 p-4 ${positions.length > 0 ? "max-w-xl" : ""}`}>
      {!targetAddress ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Wallet className="h-10 w-10" />
          <p className="text-sm">Connect your wallet or enter an address...</p>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <CircleNotch className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading positions...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-sm text-destructive">
          <p>{error instanceof Error ? error.message : "Failed to load positions."}</p>
        </div>
      ) : positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <p className="text-sm">No yield positions found for this address</p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between pb-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Portfolio
              </div>
              <div className="mt-0.5 font-mono text-2xl font-semibold tracking-tight tabular-nums">
                {`$${totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              {uniqueProtocolCount}{" "}
              {uniqueProtocolCount === 1 ? "protocol" : "protocols"} ·{" "}
              {uniqueChainCount}{" "}
              {uniqueChainCount === 1 ? "chain" : "chains"} ·{" "}
              {positions.length}{" "}
              {positions.length === 1 ? "position" : "positions"}
            </div>
          </div>

          <div className="flex items-center justify-between pb-1">
            <div className="inline-flex rounded-md border border-border/40 bg-muted/20 p-0.5">
              {(["protocol", "chain"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-3 py-1 text-[11px] font-medium capitalize transition-colors ${
                    mode === m
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  By {m}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-border/30 rounded-lg border border-border/30 bg-background/30">
            {groups.map((group) => (
              <PositionGroupCard
                key={`${mode}-${group.key}`}
                mode={mode}
                group={group}
                chainNameById={chainNameById}
                vaultMap={vaultMap}
                canWithdraw={!!connectedAddress && (targetAddress?.toLowerCase() === connectedAddress.toLowerCase())}
                withdrawKey={withdrawKey}
                onWithdrawToggle={setWithdrawKey}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function PositionGroupCard({
  mode,
  group,
  chainNameById,
  vaultMap,
  canWithdraw,
  withdrawKey,
  onWithdrawToggle,
}: {
  mode: GroupMode;
  group: PositionGroup;
  chainNameById: Record<number, string>;
  vaultMap: Map<string, import("./hooks/useVaultLookup").VaultLookupResult>;
  canWithdraw: boolean;
  withdrawKey: string | null;
  onWithdrawToggle: (key: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const primaryIcon =
    mode === "protocol" ? (
      <ProtocolBadge slug={group.key} size={28} />
    ) : (
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-muted/40">
        <ChainIcon chainId={Number(group.key)} size={20} rounded={999} />
      </span>
    );

  const primaryLabel =
    mode === "protocol"
      ? formatProtocolName(group.key)
      : chainNameById[Number(group.key)] ?? `Chain ${group.key}`;

  const MAX_CHIPS = 5;
  const visibleChips = group.secondaryKeys.slice(0, MAX_CHIPS);
  const overflowChips = group.secondaryKeys.length - visibleChips.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/20"
        >
          {primaryIcon}

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium tracking-tight">
              {primaryLabel}
            </span>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {visibleChips.map((secondary) => (
                <SecondaryChip
                  key={secondary}
                  mode={mode}
                  secondary={secondary}
                  chainNameById={chainNameById}
                />
              ))}
              {overflowChips > 0 && (
                <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[9px] font-medium">
                  +{overflowChips}
                </span>
              )}
              <span className="ml-1">
                {group.positions.length}{" "}
                {group.positions.length === 1 ? "position" : "positions"}
              </span>
            </div>
          </div>

          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatUsd(group.totalUsd)}
          </span>
          <CaretDown
            className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        collisionPadding={16}
        // Match VaultForecastButton: keep open while interacting with the
        // floating panel. Click the trigger or press Esc to dismiss.
        onInteractOutside={(e) => {
          const target = e.target as HTMLElement | null;
          if (target?.closest("[data-positions-popover-content]")) {
            e.preventDefault();
          }
        }}
        data-positions-popover-content
        className="w-[min(420px,calc(100vw-32px))] max-h-[70vh] overflow-y-auto rounded-lg border border-border/40 bg-background/95 p-0 shadow-xl backdrop-blur-sm"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/30 bg-background/95 px-3 py-2 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            {primaryIcon}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">
                {primaryLabel}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {group.positions.length}{" "}
                {group.positions.length === 1 ? "position" : "positions"} ·{" "}
                {formatUsd(group.totalUsd)}
              </span>
            </div>
          </div>
        </div>

        <div className="divide-y divide-border/20">
          {group.positions.map((pos) => {
            const rowKey = `${pos.chainId}-${pos.protocolName}-${pos.asset.address}`;
            const vaultResult = lookupVault(vaultMap, pos);
            const isWithdrawOpen = withdrawKey === rowKey;
            const rowSecondary =
              mode === "protocol" ? (
                <span
                  className="flex items-center gap-1 text-[10px] text-muted-foreground"
                  title={chainNameById[pos.chainId] ?? `Chain ${pos.chainId}`}
                >
                  <ChainIcon chainId={pos.chainId} size={12} rounded={999} />
                  <span className="truncate">
                    {chainNameById[pos.chainId] ?? `Chain ${pos.chainId}`}
                  </span>
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {formatProtocolName(pos.protocolName)}
                </span>
              );

            const vault = vaultResult.vault;
            const apy = vault?.analytics?.apy;
            const apyTotal = apy?.total;
            const apyDisplay =
              apyTotal != null && Number.isFinite(apyTotal)
                ? `${apyTotal.toFixed(2)}%`
                : null;
            const tvlUsd = vault?.analytics?.tvl?.usd;
            const tvlDisplay = tvlUsd
              ? `$${formatCompact(parseFloat(tvlUsd))}`
              : null;

            return (
              <div key={rowKey} className="px-3 py-2">
                <div className="flex items-center gap-3 text-xs">
                  <TokenIcon
                    token={pos.asset}
                    chainId={pos.chainId}
                    className="h-5 w-5 flex-none rounded-full"
                  />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {pos.asset.symbol}
                  </span>
                  <span className="flex-none">{rowSecondary}</span>
                  <span className="flex-none font-mono tabular-nums text-muted-foreground">
                    {formatBalance(pos.balanceNative)}
                  </span>
                  <span className="flex-none w-[72px] text-right font-mono tabular-nums">
                    {formatUsd(pos.balanceUsd)}
                  </span>
                  {canWithdraw && vault && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation();
                        onWithdrawToggle(isWithdrawOpen ? null : rowKey);
                      }}
                    >
                      {isWithdrawOpen ? "Cancel" : "Withdraw"}
                    </Button>
                  )}
                  {canWithdraw && vaultResult.ambiguous && (
                    <span
                      className="text-[10px] text-muted-foreground cursor-help"
                      title="Multiple vaults match this position — cannot determine which to withdraw from"
                    >
                      ⚠
                    </span>
                  )}
                </div>
                {(apyDisplay || tvlDisplay) && (
                  <div className="mt-1 ml-8 flex items-center gap-3 text-[10px] text-muted-foreground">
                    {apyDisplay && (
                      <span title={apy?.base != null ? `Base: ${apy.base.toFixed(2)}%${apy?.reward != null ? ` · Reward: ${apy.reward.toFixed(2)}%` : ""}` : undefined}>
                        APY <span className="font-mono font-medium text-emerald-500">{apyDisplay}</span>
                      </span>
                    )}
                    {tvlDisplay && (
                      <span>TVL <span className="font-mono font-medium text-foreground/70">{tvlDisplay}</span></span>
                    )}
                    {vault?.tags && vault.tags.length > 0 && (
                      <span className="flex gap-1">
                        {vault.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded bg-muted/40 px-1 py-px text-[9px]">{tag}</span>
                        ))}
                      </span>
                    )}
                  </div>
                )}
                {isWithdrawOpen && vault && (
                  <WithdrawFlow
                    position={pos}
                    vault={vault}
                    onComplete={() => onWithdrawToggle(null)}
                    onClose={() => onWithdrawToggle(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SecondaryChip({
  mode,
  secondary,
  chainNameById,
}: {
  mode: GroupMode;
  secondary: string;
  chainNameById: Record<number, string>;
}) {
  if (mode === "protocol") {
    const chainId = Number(secondary);
    return (
      <span
        className="flex items-center"
        title={chainNameById[chainId] ?? `Chain ${chainId}`}
      >
        <ChainIcon chainId={chainId} size={12} rounded={999} />
      </span>
    );
  }
  return (
    <span
      className="flex items-center"
      title={formatProtocolName(secondary)}
    >
      <ProtocolBadge slug={secondary} size={12} />
    </span>
  );
}
