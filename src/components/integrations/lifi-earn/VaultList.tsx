import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { MagnifyingGlass, ArrowsDownUp, CaretUp, CaretDown, CircleNotch, CaretRight, Lightning, ArrowsClockwise, ArrowSquareOut, Copy, Check, Info, Warning } from "@phosphor-icons/react";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../../../components/ui/popover";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import ChainIcon from "../../icons/ChainIcon";
import { TokenIcon } from "./TokenIcon";
import type { EarnVault, VaultFilters } from "./types";
import { useEarnVaults } from "./hooks/useEarnVaults";
import { useEarnChains } from "./hooks/useEarnChains";
import { useEarnProtocols } from "./hooks/useEarnProtocols";
import { VaultForecastButton } from "./simulator/VaultPositionSimulator";

function InfoTip({ label, tip, children }: { label?: string; tip: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          className="inline-flex items-center gap-0.5 cursor-help"
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {children ?? label}
          <Info className="h-2.5 w-2.5 text-muted-foreground/50" weight="fill" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="w-56 px-3 py-2 text-xs text-muted-foreground leading-relaxed"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {tip}
      </PopoverContent>
    </Popover>
  );
}

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

const HIGH_RISK_APY_THRESHOLD = 250;
const HIGH_RISK_TVL_THRESHOLD = 2_000_000;

export function isHighRiskVault(vault: EarnVault): boolean {
  const apyTotal = vault.analytics.apy.total;
  const tvlUsd = parseFloat(vault.analytics.tvl.usd);
  if (apyTotal === null || isNaN(tvlUsd)) return false;
  return apyTotal > HIGH_RISK_APY_THRESHOLD && tvlUsd < HIGH_RISK_TVL_THRESHOLD;
}

type CautionReason = "reward-heavy" | "apy-spike" | "declining-yield" | "micro-tvl";

const CAUTION_LABELS: Record<CautionReason, string> = {
  "reward-heavy": "Reward-heavy",
  "apy-spike": "APY spike",
  "declining-yield": "Declining yield",
  "micro-tvl": "Micro TVL",
};

function getCautionReasons(vault: EarnVault): CautionReason[] {
  if (isHighRiskVault(vault)) return [];

  const reasons: CautionReason[] = [];
  const { apy, tvl } = vault.analytics;
  const apyTotal = apy.total;
  const apyReward = apy.reward ?? 0;
  const apy1d = vault.analytics.apy1d;
  const apy7d = vault.analytics.apy7d;
  const apy30d = vault.analytics.apy30d;
  const tvlUsd = parseFloat(tvl.usd);

  if (!isNaN(tvlUsd) && tvlUsd < 250_000) reasons.push("micro-tvl");

  if (apyTotal !== null && apyTotal !== 0) {
    if (apyReward / apyTotal > 0.6) reasons.push("reward-heavy");
    if (apy1d !== null && apy30d !== null && apy1d > apy30d * 3) reasons.push("apy-spike");
  }

  if (
    apy1d !== null &&
    apy7d !== null &&
    apy30d !== null &&
    apy30d > apy7d &&
    apy7d > apy1d &&
    apy1d < apy30d * 0.5
  ) reasons.push("declining-yield");

  return reasons;
}

function isCautionVault(vault: EarnVault): boolean {
  return getCautionReasons(vault).length > 0;
}

export const HIGH_RISK_ACK_KEY = "hexkit-vault-risk-ack";
export const CAUTION_ACK_KEY = "hexkit-vault-caution-ack";

export function loadAckSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

export function saveAckSet(key: string, ids: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...ids]));
}

export function vaultKey(v: EarnVault): string {
  return `${v.chainId}-${v.address}`;
}

interface VaultListProps {
  onSelectVault: (vault: EarnVault) => void;
  compact?: boolean;
  // Lock the chain filter to a single chain — used by the concierge
  // destination picker in consolidate mode to prevent cross-chain vault picks.
  lockedChainId?: number;
}

const PAGE_SIZE = 24;

const MIN_TVL_OPTIONS = [
  { label: "Any", value: 0 },
  { label: "$10K+", value: 10_000 },
  { label: "$100K+", value: 100_000 },
  { label: "$500K+", value: 500_000 },
  { label: "$1M+", value: 1_000_000 },
] as const;

export function VaultList({ onSelectVault, compact = false, lockedChainId }: VaultListProps) {
  const prefersReducedMotion = useReducedMotion();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [chainId, setChainId] = useState<number | null>(lockedChainId ?? null);
  const [protocol, setProtocol] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [minTvlUsd, setMinTvlUsd] = useState(0);
  const [sortBy, setSortBy] = useState<VaultFilters["sortBy"]>("apy");
  const [sortDir, setSortDir] = useState<VaultFilters["sortDir"]>("desc");
  // Tracks which risk tiers are HIDDEN. Empty = all visible (default).
  const [hiddenRiskTiers, setHiddenRiskTiers] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [highRiskAcked, setHighRiskAcked] = useState<Set<string>>(() => loadAckSet(HIGH_RISK_ACK_KEY));
  const [cautionAcked, setCautionAcked] = useState<Set<string>>(() => loadAckSet(CAUTION_ACK_KEY));
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce search for server-side asset filtering (400ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const handleHighRiskAck = useCallback((key: string) => {
    setHighRiskAcked((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveAckSet(HIGH_RISK_ACK_KEY, next);
      return next;
    });
  }, []);

  const handleCautionAck = useCallback((key: string) => {
    setCautionAcked((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveAckSet(CAUTION_ACK_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (lockedChainId !== undefined) {
      setChainId(lockedChainId);
    }
  }, [lockedChainId]);

  const apiSortBy = sortBy === "name" ? undefined : sortBy;
  const apiSortDir = sortBy === "name" ? undefined : sortDir;

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useEarnVaults(
      chainId,
      apiSortBy,
      apiSortDir,
      protocol,
      debouncedSearch || null,
      minTvlUsd || null,
    );

  const { data: earnChains } = useEarnChains();
  const { data: earnProtocols } = useEarnProtocols();

  const allVaults = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const chainOptions = useMemo(() => {
    if (earnChains && earnChains.length > 0) {
      return earnChains.map((c) => ({ id: c.chainId, name: c.name }));
    }
    const seen = new Set(allVaults.map((v) => v.chainId));
    return SUPPORTED_CHAINS.filter((c) => seen.has(c.id)).map((c) => ({
      id: c.id,
      name: c.name,
    }));
  }, [earnChains, allVaults]);

  const protocolOptions = useMemo(() => {
    if (earnProtocols && earnProtocols.length > 0) {
      return earnProtocols.map((p) => p.name).sort();
    }
    const names = new Set(allVaults.map((v) => v.protocol.name));
    return Array.from(names).sort();
  }, [earnProtocols, allVaults]);

  const tagOptions = useMemo(() => {
    const tags = new Set(allVaults.flatMap((v) => v.tags));
    return Array.from(tags).sort();
  }, [allVaults]);

  const riskTierCounts = useMemo(() => {
    const counts: Record<string, number> = { "high-risk": 0 };
    for (const r of Object.keys(CAUTION_LABELS)) counts[r] = 0;
    for (const vault of allVaults) {
      if (isHighRiskVault(vault)) { counts["high-risk"]++; continue; }
      for (const r of getCautionReasons(vault)) counts[r]++;
    }
    return counts;
  }, [allVaults]);

  const hasActiveRiskFilter = hiddenRiskTiers.size > 0;

  const toggleRiskTier = useCallback((key: string) => {
    setHiddenRiskTiers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let result = allVaults;

    if (lockedChainId !== undefined) {
      result = result.filter((v) => v.chainId === lockedChainId);
    }

    // tag and risk-tier filters remain client-side (no API support)
    if (tag) result = result.filter((v) => v.tags.includes(tag));
    if (hasActiveRiskFilter) {
      result = result.filter((v) => {
        if (hiddenRiskTiers.has("high-risk") && isHighRiskVault(v)) return false;
        const reasons = getCautionReasons(v);
        if (reasons.some((r) => hiddenRiskTiers.has(r))) return false;
        return true;
      });
    }

    // Name sort is client-side only; apy/tvl sort + direction handled by API
    if (sortBy === "name") {
      result = [...result].sort((a, b) => {
        const nameA = a.underlyingTokens?.[0]?.symbol ?? "";
        const nameB = b.underlyingTokens?.[0]?.symbol ?? "";
        const cmp = nameA.localeCompare(nameB);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return result;
  }, [allVaults, tag, sortBy, sortDir, hasActiveRiskFilter, hiddenRiskTiers, lockedChainId]);

  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, chainId, protocol, tag, minTvlUsd, sortBy, sortDir, hiddenRiskTiers]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (visibleCount < filtered.length) {
          setVisibleCount((c) => c + PAGE_SIZE);
        } else if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [visibleCount, filtered.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const backgroundPagesRef = useRef(0);
  const MAX_BACKGROUND_PAGES = 6;
  const BACKGROUND_FETCH_DELAY_MS = 700;

  useEffect(() => {
    backgroundPagesRef.current = 0;
  }, [chainId, apiSortBy, apiSortDir, protocol, debouncedSearch, minTvlUsd]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    if (backgroundPagesRef.current >= MAX_BACKGROUND_PAGES) return;
    const timer = setTimeout(() => {
      backgroundPagesRef.current += 1;
      fetchNextPage();
    }, BACKGROUND_FETCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSort = useCallback(
    (col: VaultFilters["sortBy"]) => {
      if (sortBy === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(col);
        setSortDir(col === "name" ? "asc" : "desc");
      }
    },
    [sortBy],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
        <CircleNotch className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading vaults…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {(error as Error)?.message ?? "Failed to load vaults."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={
          compact
            ? "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
            : "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
        }
      >
        <div className="relative min-w-0 flex-1 sm:min-w-[200px]">
          <MagnifyingGlass className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search vaults…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {lockedChainId === undefined ? (
            <Select value={chainId === null ? "all" : String(chainId)} onValueChange={(v) => setChainId(v === "all" ? null : Number(v))}>
              <SelectTrigger className="w-[calc(50%-4px)] sm:w-[160px]">
                {chainId === null ? (
                  <SelectValue placeholder="All chains" />
                ) : (
                  <span className="inline-flex items-center gap-1.5 truncate">
                    <ChainIcon chainId={chainId} size={14} rounded={4} />
                    <span className="truncate">
                      {chainOptions.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`}
                    </span>
                  </span>
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chains</SelectItem>
                {chainOptions.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    <span className="inline-flex items-center gap-1.5">
                      <ChainIcon chainId={c.id} size={14} rounded={4} />
                      <span>{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border/40 bg-muted/30 px-3 text-xs text-muted-foreground">
              <span>Chain locked ·</span>
              <ChainIcon chainId={lockedChainId} size={14} rounded={4} />
              <span className="font-medium text-foreground">
                {chainOptions.find((c) => c.id === lockedChainId)?.name ??
                  SUPPORTED_CHAINS.find((c) => c.id === lockedChainId)?.name ??
                  `chain ${lockedChainId}`}
              </span>
            </div>
          )}

          <Select value={protocol ?? "all"} onValueChange={(v) => setProtocol(v === "all" ? null : v)}>
            <SelectTrigger className="w-[calc(50%-4px)] sm:w-[140px]"><SelectValue placeholder="All protocols" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All protocols</SelectItem>
              {protocolOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={tag ?? "all"} onValueChange={(v) => setTag(v === "all" ? null : v)}>
            <SelectTrigger className="w-[calc(50%-4px)] sm:w-[120px]"><SelectValue placeholder="All tags" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tags</SelectItem>
              {tagOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={String(minTvlUsd)} onValueChange={(v) => setMinTvlUsd(Number(v))}>
            <SelectTrigger className="w-[calc(50%-4px)] sm:w-[110px]"><SelectValue placeholder="Min TVL" /></SelectTrigger>
            <SelectContent>
              {MIN_TVL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 sm:ml-auto">
          {(["apy", "tvl", "name"] as const).map((col) => (
            <button
              key={col}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                sortBy === col
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
              onClick={() => handleSort(col)}
            >
              {col.toUpperCase()}
              {sortBy === col && (
                sortDir === "asc"
                  ? <CaretUp className="inline h-3 w-3 ml-0.5 opacity-70" weight="bold" />
                  : <CaretDown className="inline h-3 w-3 ml-0.5 opacity-70" weight="bold" />
              )}
            </button>
          ))}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className={`flex items-center gap-1.5 ml-2 pl-2 border-l border-border/40 select-none text-xs font-medium transition-colors ${
                    hasActiveRiskFilter ? "text-amber-500" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className={`inline-flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                    hasActiveRiskFilter
                      ? "border-amber-500 bg-amber-500/15"
                      : "border-border/60 bg-muted/30"
                  }`}>
                    {hasActiveRiskFilter && <Warning className="h-2.5 w-2.5 text-amber-500" weight="fill" />}
                  </span>
                  Flagged
                  {hasActiveRiskFilter && (
                    <span className="text-[10px] tabular-nums opacity-70">
                      ({hiddenRiskTiers.size} hidden)
                    </span>
                  )}
                  <CaretDown className="h-3 w-3 opacity-50" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[200px] p-2" sideOffset={6}>
                <div className="flex flex-col gap-0.5">
                  <label
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/50 ${
                      hiddenRiskTiers.has("high-risk") ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenRiskTiers.has("high-risk")}
                      onChange={() => toggleRiskTier("high-risk")}
                      className="sr-only"
                    />
                    <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors ${
                      !hiddenRiskTiers.has("high-risk")
                        ? "border-amber-500 bg-amber-500/15"
                        : "border-border/60 bg-muted/30"
                    }`}>
                      {!hiddenRiskTiers.has("high-risk") && <Check className="h-2 w-2 text-amber-500" />}
                    </span>
                    <span className="flex-1">High risk</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{riskTierCounts["high-risk"]}</span>
                  </label>
                  <div className="my-1 border-t border-border/30" />
                  {(Object.keys(CAUTION_LABELS) as CautionReason[]).map((key) => (
                    <label
                      key={key}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-xs transition-colors hover:bg-muted/50 ${
                        hiddenRiskTiers.has(key) ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenRiskTiers.has(key)}
                        onChange={() => toggleRiskTier(key)}
                        className="sr-only"
                      />
                      <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border transition-colors ${
                        !hiddenRiskTiers.has(key)
                          ? "border-yellow-500 bg-yellow-500/15"
                          : "border-border/60 bg-muted/30"
                      }`}>
                        {!hiddenRiskTiers.has(key) && <Check className="h-2 w-2 text-yellow-500" />}
                      </span>
                      <span className="flex-1">{CAUTION_LABELS[key]}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">{riskTierCounts[key]}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          No vaults found matching filters
        </div>
      ) : (
        <motion.div
          className={
            compact
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
              : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
          }
          initial="hidden"
          animate="visible"
          variants={prefersReducedMotion ? undefined : {
            hidden: {},
            visible: { transition: { staggerChildren: 0.04 } },
          }}
        >
          {visible.map((vault) => (
            <motion.div
              key={`${vault.chainId}-${vault.address}`}
              variants={prefersReducedMotion ? undefined : {
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } },
              }}
            >
              <MemoVaultCard
                vault={vault}
                onSelect={onSelectVault}
                compact={compact}
                highRiskAcknowledged={highRiskAcked.has(vaultKey(vault))}
                cautionAcknowledged={cautionAcked.has(vaultKey(vault))}
                onAcknowledgeHighRisk={() => handleHighRiskAck(vaultKey(vault))}
                onAcknowledgeCaution={() => handleCautionAck(vaultKey(vault))}
              />
            </motion.div>
          ))}
        </motion.div>
      )}

      <div ref={sentinelRef} className="h-1" />
      {isFetchingNextPage && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <CircleNotch className="h-4 w-4 animate-spin" />
          Loading more…
        </div>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function truncateAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function MiniSparkline({ points, color }: { points: (number | null)[]; color: string }) {
  const valid = points.filter((p): p is number => p !== null && p !== undefined);
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const h = 32;
  const w = 72;

  const coords = valid.map((v, i) => {
    const x = (i / (valid.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {(() => {
        const last = coords[coords.length - 1].split(",");
        return <circle cx={last[0]} cy={last[1]} r="2" fill={color} />;
      })()}
    </svg>
  );
}

export function VaultCard({
  vault,
  onSelect,
  compact = false,
  highRiskAcknowledged = false,
  cautionAcknowledged = false,
  onAcknowledgeHighRisk,
  onAcknowledgeCaution,
}: {
  vault: EarnVault;
  onSelect: (v: EarnVault) => void;
  compact?: boolean;
  highRiskAcknowledged?: boolean;
  cautionAcknowledged?: boolean;
  onAcknowledgeHighRisk?: () => void;
  onAcknowledgeCaution?: () => void;
}) {
  const highRisk = isHighRiskVault(vault);
  const cautionReasons = useMemo(() => getCautionReasons(vault), [vault]);
  const caution = cautionReasons.length > 0;
  const [copied, setCopied] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showCautionDisclaimer, setShowCautionDisclaimer] = useState(false);
  const revealOpen = hovered || forecastOpen;
  const isFlagged = highRisk && !highRiskAcknowledged;
  const isCautionGated = caution && !highRisk && !cautionAcknowledged;

  const chainName = useMemo(
    () => SUPPORTED_CHAINS.find((c) => c.id === vault.chainId)?.name ?? vault.network,
    [vault.chainId, vault.network],
  );

  const { apy } = vault.analytics;
  const tvl = vault.analytics.tvl.usd;
  const tokens = vault.underlyingTokens ?? [];
  const vaultLabel =
    tokens.length > 0
      ? tokens.map((t) => t.symbol).join(" / ")
      : vault.name ?? vault.slug;

  const isInstantDeposit = vault.depositPacks?.some((p) => p.stepsType === "instant");

  const sparklinePoints = [vault.analytics.apy30d, vault.analytics.apy7d, vault.analytics.apy1d ?? null, apy.total];
  const sparklineColor = (apy.total ?? 0) >= (vault.analytics.apy7d ?? 0) ? "#10b981" : "#f87171";

  const handleCopyAddress = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(vault.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleProtocolLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (vault.protocol.url) {
      window.open(vault.protocol.url, "_blank", "noopener,noreferrer");
    }
  };

  const detailItems = useMemo(() => {
    const items: { label: string; value: string; color?: string; tip: string }[] = [];
    if (vault.analytics.apy1d !== null) items.push({ label: "1d", value: formatApy(vault.analytics.apy1d), tip: "Average annualized yield over the past 24 hours." });
    items.push({ label: "7d", value: formatApy(vault.analytics.apy7d), tip: "Average annualized yield over the past 7 days. Smooths out daily fluctuations." });
    items.push({ label: "30d", value: formatApy(vault.analytics.apy30d), tip: "Average annualized yield over the past 30 days. Best indicator of sustained returns." });
    return items;
  }, [vault.analytics.apy1d, vault.analytics.apy7d, vault.analytics.apy30d]);

  return (
    <motion.div
      role="button"
      tabIndex={0}
      className={`relative flex flex-col rounded-xl border bg-card
                 cursor-pointer text-left overflow-hidden
                 outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                 ${isFlagged ? "border-amber-500/30 grayscale-[60%] opacity-60" : "border-border/50"}`}
      onClick={() => {
        if (forecastOpen) return;
        if (isFlagged) { setShowDisclaimer(true); return; }
        if (isCautionGated) { setShowCautionDisclaimer(true); return; }
        onSelect(vault);
      }}
      onKeyDown={(e) => {
        if (forecastOpen) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isFlagged) { setShowDisclaimer(true); return; }
          if (isCautionGated) { setShowCautionDisclaimer(true); return; }
          onSelect(vault);
        }
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false); }}
      whileHover={compact ? { boxShadow: "0 8px 20px rgba(0,0,0,0.15)" } : { y: -8, boxShadow: "0 20px 40px rgba(0,0,0,0.15)" }}
      animate={{ borderColor: hovered ? "rgba(var(--primary-rgb, 99,102,241), 0.4)" : undefined }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{ willChange: "transform" }}
    >
      {isFlagged && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-amber-500">
          <Warning className="h-3 w-3" weight="fill" />
          <span>High risk</span>
        </div>
      )}
      {caution && !highRisk && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full border border-yellow-500/40 bg-yellow-500/10 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-yellow-500">
          <Warning className="h-3 w-3" weight="regular" />
          <span>Caution</span>
        </div>
      )}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-full border border-border/40 bg-background/80 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
        <ChainIcon chainId={vault.chainId} size={12} rounded={6} />
        <span>{chainName}</span>
      </div>

      <div
        className={
          compact
            ? "flex flex-col items-center gap-1.5 px-3 pt-6 pb-2"
            : "flex flex-col items-center gap-2 px-4 pt-5 pb-3"
        }
      >
        <div className="flex -space-x-2.5">
          {tokens.slice(0, 3).map((token) => (
            <motion.div
              key={token.address}
              animate={{ scale: hovered && !compact ? 1.1 : 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
            >
              <TokenIcon
                token={token}
                chainId={vault.chainId}
                className={
                  compact
                    ? "h-9 w-9 rounded-full border-2 border-background bg-muted object-contain"
                    : "h-11 w-11 rounded-full border-2 border-background bg-muted object-contain"
                }
              />
            </motion.div>
          ))}
          {tokens.length === 0 && (
            <div
              className={
                compact
                  ? "h-9 w-9 rounded-full border-2 border-background bg-muted flex items-center justify-center text-xs text-muted-foreground font-medium"
                  : "h-11 w-11 rounded-full border-2 border-background bg-muted flex items-center justify-center text-sm text-muted-foreground font-medium"
              }
            >
              ?
            </div>
          )}
        </div>

        <p
          className={
            compact
              ? "text-xs font-semibold text-center leading-tight truncate max-w-full"
              : "text-sm font-semibold text-center leading-tight truncate max-w-full"
          }
        >
          {vaultLabel}
        </p>

        <div
          className={
            compact
              ? "flex items-center gap-1.5 text-[10px] text-muted-foreground"
              : "flex items-center gap-1.5 text-[11px] text-muted-foreground"
          }
        >
          <span className="font-medium">{vault.protocol.name}</span>
        </div>
      </div>

      <div
        className={
          compact
            ? "mx-2.5 rounded-lg bg-muted/30 border border-border/30 px-2.5 py-2 mb-2"
            : "mx-3 rounded-lg bg-muted/30 border border-border/30 px-3 py-2.5 mb-2"
        }
      >
        <div className="flex items-center justify-between">
          {compact ? (
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Total APY</span>
          ) : (
            <InfoTip label="Total APY" tip="The combined annual percentage yield from base protocol earnings plus any bonus reward tokens. This is the total return you can expect over one year at current rates.">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Total APY</span>
            </InfoTip>
          )}
        </div>
        <span
          className={`${
            compact ? "text-base" : "text-xl"
          } font-bold tabular-nums block mt-0.5 ${
            apy.total !== null && apy.total > 0 ? "text-emerald-500" : "text-muted-foreground"
          }`}
        >
          {formatApy(apy.total)}
        </span>
        {!compact && (
          <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-border/20">
            <div className="flex items-center gap-1 text-[10px]">
              <InfoTip tip="The yield generated from the protocol's core lending or liquidity activity, excluding any incentive rewards.">
                <span className="text-muted-foreground">Base</span>
              </InfoTip>
              <span className="font-medium tabular-nums text-foreground/80">{formatApy(apy.base)}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px]">
              <InfoTip tip="Additional yield from incentive or governance token rewards distributed by the protocol on top of the base APY.">
                <span className="text-muted-foreground">Reward</span>
              </InfoTip>
              <span className="font-medium tabular-nums text-amber-500">{formatApy(apy.reward)}</span>
            </div>
          </div>
        )}
      </div>

      <div
        className={
          compact
            ? "flex items-center justify-between px-3 py-1.5"
            : "flex items-center justify-between px-4 py-2"
        }
      >
        <div className="flex flex-col">
          <span className={`${compact ? "text-[9px]" : "text-[10px]"} uppercase tracking-wider text-muted-foreground`}>TVL</span>
          <span className={`${compact ? "text-xs" : "text-sm"} font-semibold tabular-nums`}>{formatTvl(tvl)}</span>
        </div>
        <div className="flex items-center gap-1">
          {isInstantDeposit && (
            <span className="flex items-center gap-0.5 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-500">
              <Lightning className="h-2.5 w-2.5" />Instant
            </span>
          )}
          {vault.isRedeemable && !compact && (
            <span className="flex items-center gap-0.5 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[9px] font-medium text-blue-500">
              <ArrowsClockwise className="h-2.5 w-2.5" />Redeem
            </span>
          )}
        </div>
      </div>

      {!compact && vault.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pb-2">
          {vault.tags.slice(0, 3).map((t) => (
            <span key={t} className="border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
          ))}
          {vault.tags.length > 3 && <span className="text-[10px] text-muted-foreground self-center">+{vault.tags.length - 3}</span>}
        </div>
      )}

      {compact ? (
        <div className="mt-auto border-t border-border/30 px-3 py-1.5 text-center text-[10px] font-medium text-muted-foreground">
          Click to pick
        </div>
      ) : (
        <div className="mt-auto border-t border-border/30 px-4 py-2.5">
          <motion.div
            className="flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground"
            animate={{ color: hovered ? "var(--primary)" : undefined }}
          >
            View Details
            <motion.span animate={{ x: hovered ? 3 : 0 }} transition={{ type: "spring", stiffness: 500, damping: 20 }}>
              <CaretRight className="h-3.5 w-3.5" />
            </motion.span>
          </motion.div>
        </div>
      )}

      <AnimatePresence>
        {revealOpen && !compact && (
          <motion.div
            className="absolute top-[62%] bottom-0 left-0 right-0 z-10 bg-card/95 backdrop-blur-sm border-t border-primary/30 shadow-[0_-4px_24px_rgba(0,0,0,0.12)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 500, damping: 35 }}
          >
            <div className="px-4 py-3 flex flex-col gap-3 h-full">

              <motion.div
                className="flex items-center gap-3"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
              >
                {detailItems.map((item, i) => (
                  <motion.div
                    key={item.label}
                    className={`flex flex-col items-center flex-1 py-0.5 ${i > 0 ? "border-l border-border/30" : ""}`}
                    variants={{
                      hidden: { opacity: 0, y: 4 },
                      visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 500, damping: 25 } },
                    }}
                  >
                    <span className={`text-sm font-semibold tabular-nums ${item.color ?? "text-foreground/90"}`}>{item.value}</span>
                    <InfoTip tip={item.tip}>
                      <span className="text-[10px] text-muted-foreground mt-0.5">{item.label}</span>
                    </InfoTip>
                  </motion.div>
                ))}
                <motion.div
                  className="shrink-0 pl-1"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.08 }}
                >
                  <MiniSparkline points={sparklinePoints} color={sparklineColor} />
                </motion.div>
              </motion.div>

              <motion.div
                className="flex items-center justify-between text-[11px] text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.08 }}
              >
                <div className="flex items-center gap-1.5">
                  <InfoTip tip="Total Value Locked — total assets deposited. Higher TVL means more liquidity.">
                    <span>TVL</span>
                  </InfoTip>
                  <span className="font-semibold text-foreground/90 tabular-nums text-xs">{formatTvl(tvl)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono">{truncateAddr(vault.address)}</span>
                  <button onClick={handleCopyAddress} className="p-0.5 rounded hover:bg-muted/60 transition-colors">
                    {copied ? <Check className="h-2.5 w-2.5 text-emerald-500" /> : <Copy className="h-2.5 w-2.5" />}
                  </button>
                  {vault.analytics.updatedAt && (
                    <>
                      <span className="opacity-30">·</span>
                      <span>{timeAgo(vault.analytics.updatedAt)}</span>
                    </>
                  )}
                </div>
              </motion.div>

              <motion.div
                className="flex gap-2 mt-auto"
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, type: "spring", stiffness: 400, damping: 25 }}
              >
                {vault.protocol.url && (
                  <button
                    onClick={handleProtocolLink}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-border/50 bg-muted/30
                               rounded-md py-2 text-xs font-medium text-muted-foreground
                               hover:bg-muted/60 hover:text-foreground transition-colors"
                  >
                    <ArrowSquareOut className="h-3 w-3" />
                    Protocol
                  </button>
                )}
                <VaultForecastButton vault={vault} onOpenChange={setForecastOpen} />
                <div
                  className="flex-1 flex items-center justify-center gap-1.5 bg-primary/90
                             rounded-md py-2 text-xs font-medium text-primary-foreground
                             hover:bg-primary transition-colors"
                >
                  View Details
                  <CaretRight className="h-3.5 w-3.5" />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDisclaimer && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="High risk vault disclaimer"
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 rounded-xl bg-background/95 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Warning className="h-7 w-7 text-amber-500" weight="fill" />
            <p className="text-center text-xs text-foreground leading-relaxed max-w-[220px]">
              This vault has <span className="font-semibold text-amber-500">very high APY</span> with{" "}
              <span className="font-semibold text-amber-500">low TVL</span>. This pattern may indicate
              elevated risk — including unsustainable yields or potential rug pulls. Proceed with caution.
            </p>
            <div className="flex items-center gap-2 mt-1">
              <button
                className="rounded-md border border-border/50 bg-muted/50 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowDisclaimer(false); }}
              >
                Go back
              </button>
              <button
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-600 hover:bg-amber-500/20 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledgeHighRisk?.();
                  setShowDisclaimer(false);
                }}
              >
                I understand
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCautionDisclaimer && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Caution vault disclaimer"
            className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2.5 rounded-xl bg-background/95 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Warning className="h-6 w-6 text-yellow-500" weight="regular" />
            <p className="text-center text-xs text-foreground leading-relaxed max-w-[220px]">
              This vault has signals that warrant extra attention:
            </p>
            <div className="flex flex-col gap-1 w-full max-w-[220px]">
              {cautionReasons.map((r) => (
                <span key={r} className="text-[10px] text-yellow-500 font-medium">
                  · {CAUTION_LABELS[r]}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <button
                className="rounded-md border border-border/50 bg-muted/50 px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowCautionDisclaimer(false); }}
              >
                Go back
              </button>
              <button
                className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-1.5 text-[11px] font-medium text-yellow-500 hover:bg-yellow-500/20 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onAcknowledgeCaution?.();
                  setShowCautionDisclaimer(false);
                }}
              >
                Continue anyway
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const MemoVaultCard = React.memo(VaultCard);
