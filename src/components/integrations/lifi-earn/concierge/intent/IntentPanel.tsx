import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useAccount } from "wagmi";
import {
  CircleNotch,
  Sparkle,
  X,
  TrendUp,
  ShieldCheck,
  Scales,
  Play,
  Warning,
} from "@phosphor-icons/react";
import { Textarea } from "../../../../../components/ui/textarea";
import ChainIcon from "../../../../icons/ChainIcon";
import { VaultRecommendations } from "../VaultRecommendations";
import { LlmErrorAlert } from "../LlmErrorAlert";
import { ExecutionQueue } from "../ExecutionQueue";
import { initialLegState, legsReducer } from "../executionMachine";
import { useQuery } from "@tanstack/react-query";
import { useEarnChains } from "../../hooks/useEarnChains";
import { useEarnProtocols } from "../../hooks/useEarnProtocols";
import { fetchEarnVaults } from "../../earnApi";
import { useIdleBalances } from "../hooks/useIdleBalances";
import { useIntentParser } from "./hooks/useIntentParser";
import { useVaultsByIntent } from "./hooks/useVaultsByIntent";
import { useIntentRecommendation, buildRecommendation } from "./hooks/useIntentRecommendation";
import { useLlmInvocation } from "../../../../../hooks/useLlmInvocation";
import { useLlmConfig } from "../../../../../contexts/LlmConfigContext";
import type { ParsedIntent } from "./schema";
import type { EarnVault } from "../../types";
import type { IdleAsset, SelectedSource, VaultRecommendation } from "../types";
import { rankVaultsForIntent, type IntentVaultsResult } from "./hooks/useVaultsByIntent";
import {
  VaultCard,
  vaultKey,
  loadAckSet,
  saveAckSet,
  HIGH_RISK_ACK_KEY,
  CAUTION_ACK_KEY,
} from "../../VaultList";

interface IntentPanelProps {
  /** Opens the shared VaultDrawer owned by LifiEarnPage. */
  onSelectVault: (vault: EarnVault) => void;
  /** Connected wallet or manually-entered address for balance scanning. */
  targetAddress?: string | null;
}

// Claude Code–style thinking indicator: a color-shifting sparkle + typewriter
// word that cycles through synonyms for "thinking".
const THINKING_WORDS = [
  "Pondering",
  "Analyzing",
  "Searching",
  "Evaluating",
  "Scanning",
  "Exploring",
  "Considering",
  "Investigating",
  "Reasoning",
  "Manifesting",
];

/**
 * Typewriter hook — types out the current word character by character,
 * pauses, then erases and moves to the next word.
 */
function useThinkingLabel(active: boolean) {
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!active) {
      setWordIndex(0);
      setCharIndex(0);
      setDeleting(false);
      return;
    }

    const word = THINKING_WORDS[wordIndex];

    if (!deleting) {
      // Typing forward
      if (charIndex < word.length) {
        const id = setTimeout(() => setCharIndex((c) => c + 1), 60);
        return () => clearTimeout(id);
      }
      // Pause at full word before erasing
      const id = setTimeout(() => setDeleting(true), 1400);
      return () => clearTimeout(id);
    }

    // Deleting
    if (charIndex > 0) {
      const id = setTimeout(() => setCharIndex((c) => c - 1), 30);
      return () => clearTimeout(id);
    }

    // Move to next word
    setDeleting(false);
    setWordIndex((i) => (i + 1) % THINKING_WORDS.length);
  }, [active, wordIndex, charIndex, deleting]);

  const word = THINKING_WORDS[wordIndex];
  return active ? word.slice(0, charIndex) : "";
}

/** Twinkling star field — small ✦ glyphs fade in/out with color cycling. */
const STAR_COLORS = ["#e87461", "#d4a054", "#c084fc", "#60a5fa", "#34d399", "#f472b6"];
function TwinklingField() {
  const stars = [
    { x: 2, y: 3, s: 0 }, { x: 10, y: 1, s: 0.3 }, { x: 6, y: 8, s: 0.6 },
    { x: 14, y: 5, s: 0.9 }, { x: 1, y: 10, s: 0.4 }, { x: 12, y: 11, s: 0.7 },
  ];
  return (
    <span className="relative inline-flex h-4 w-4">
      {stars.map((s, i) => (
        <span
          key={i}
          className="absolute text-[6px]"
          style={{
            left: s.x,
            top: s.y,
            color: STAR_COLORS[i % STAR_COLORS.length],
            animation: `twinkle 1.8s ease-in-out ${s.s}s infinite`,
          }}
        >
          ✦
        </span>
      ))}
      <style>{`@keyframes twinkle { 0%,100%{opacity:0.1;transform:scale(0.5)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </span>
  );
}

const EXAMPLE_INTENTS = [
  "Best vaults for my assets",
  "Put my USDC into the safest vault above 5% APY on Arbitrum",
  "Highest yield ETH vault on any chain with at least $50M TVL",
  "Best vault for my ETH even if I need to swap tokens",
];

// Zero address stands in for "target token" when we hand a synthetic IdleAsset
// to <VaultRecommendations>. Only used as a lookup key; never an actual ERC20.
const SYNTH_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

function formatTvl(tvlUsd: string | number): string {
  const n = typeof tvlUsd === "string" ? parseFloat(tvlUsd) : tvlUsd;
  if (isNaN(n)) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/**
 * Runs `useVaultsByIntent` for each intent in the array. Must be called with a
 * stable-length array (React hook rules). We cheat slightly by always calling
 * the single-intent hook internally and gating on index presence.
 */
function useMultiAssetVaults(
  intents: ParsedIntent[],
  maxResults: number,
): IntentVaultsResult[] {
  // Fetch the full vault universe once (shared queryKey with useVaultsByIntent)
  const { data: allVaults, isLoading, isError } = useQuery({
    queryKey: ["earn-vaults", "all"],
    queryFn: async () => {
      const all: EarnVault[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 200; i++) {
        const page = await fetchEarnVaults({ cursor });
        all.push(...page.data);
        if (!page.nextCursor) return all;
        cursor = page.nextCursor;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });

  return useMemo(() => {
    const mkBlank = (): IntentVaultsResult => ({
      ranked: [],
      isLoading,
      isError,
      totalBeforeFilter: 0,
      symbolRelaxed: false,
      relaxedFromSymbol: null,
      rejection: { notTransactional: 0, symbolMismatch: 0, chainMismatch: 0, apyBelowFloor: 0, apyAboveCeiling: 0, tvlBelowFloor: 0, protocolExcluded: 0, protocolNotIncluded: 0, highRisk: 0, caution: 0 },
      highRiskVaults: [],
      cautionVaults: [],
    });
    if (!allVaults || intents.length === 0) {
      return intents.map(() => mkBlank());
    }
    // All per-asset intents share the same filters (target_symbol is null for
    // all of them since LI.FI handles swaps). Compute ranking once and reuse.
    const first = intents[0];
    const rejection: IntentVaultsResult["rejection"] = { notTransactional: 0, symbolMismatch: 0, chainMismatch: 0, apyBelowFloor: 0, apyAboveCeiling: 0, tvlBelowFloor: 0, protocolExcluded: 0, protocolNotIncluded: 0, highRisk: 0, caution: 0 };
    const highRiskCollector: EarnVault[] = [];
    const cautionCollector: EarnVault[] = [];
    const ranked = rankVaultsForIntent(allVaults, first, maxResults, rejection, highRiskCollector, cautionCollector);
    const result: IntentVaultsResult = {
      ranked,
      isLoading: false,
      isError: false,
      totalBeforeFilter: allVaults.length,
      symbolRelaxed: false,
      relaxedFromSymbol: null,
      rejection,
      highRiskVaults: highRiskCollector,
      cautionVaults: cautionCollector,
    };
    return intents.map(() => result);
  }, [allVaults, intents, maxResults, isLoading, isError]);
}

interface MultiRecResult {
  recommendation: VaultRecommendation | null;
  isLoading: boolean;
  isFetching: boolean;
  llmError: string | null;
  refetch: () => void;
}

/**
 * Batches multiple recommendation args into a single React Query call. Each
 * entry in `argsList` produces one independent recommendation (separate LLM
 * round-trip). Null entries are skipped. Returns results in the same order.
 */
function useMultiAssetRecommendations(
  argsList: (Parameters<typeof useIntentRecommendation>[0] | null)[],
): MultiRecResult[] {
  const { invoke } = useLlmInvocation();
  const { config } = useLlmConfig();
  const geminiModel = config.providers.gemini.model || "gemini-2.5-pro";

  const stableKey = useMemo(
    () =>
      argsList.map((a) =>
        a
          ? `${a.synthChainId}:${a.synthTokenAddress}:${a.sourceTokenSymbol ?? ""}:${a.rankedVaults.slice(0, 8).map((v) => v.slug).join(",")}`
          : "null",
      ).join("|"),
    [argsList],
  );

  const hasAnyArgs = argsList.some((a) => a != null);

  const query = useQuery<{ rec: VaultRecommendation | null; error: string | null }[]>({
    queryKey: ["multi-intent-rec", geminiModel, stableKey],
    enabled: hasAnyArgs,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      // Fan out parallel LLM calls — one per non-null arg.
      return Promise.all(
        argsList.map(async (args) => {
          if (!args || args.rankedVaults.length === 0) return { rec: null, error: null };
          const result = await buildRecommendation(invoke, args, geminiModel);
          return { rec: result.recommendation, error: result.llmError };
        }),
      );
    },
  });

  return useMemo(() => {
    return argsList.map((_, idx) => ({
      recommendation: query.data?.[idx]?.rec ?? null,
      isLoading: query.isLoading,
      isFetching: query.isFetching,
      llmError: query.data?.[idx]?.error ?? null,
      refetch: () => void query.refetch(),
    }));
  }, [argsList, query.data, query.isLoading, query.isFetching, query.refetch]);
}

export function IntentPanel({ onSelectVault, targetAddress: externalAddress }: IntentPanelProps) {
  const [text, setText] = useState("");
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const { address: walletAddress, isConnected } = useAccount();
  const { data: chains = [] } = useEarnChains();
  const { data: protocols = [] } = useEarnProtocols();

  // Use pasted/external address if provided, otherwise fall back to connected wallet
  const scanAddress = externalAddress ?? walletAddress ?? null;

  // Risk acknowledgment state (shared with VaultList via localStorage)
  const [highRiskAcked, setHighRiskAcked] = useState<Set<string>>(
    () => loadAckSet(HIGH_RISK_ACK_KEY),
  );
  const [cautionAcked, setCautionAcked] = useState<Set<string>>(
    () => loadAckSet(CAUTION_ACK_KEY),
  );
  const handleAckHighRisk = useCallback((key: string) => {
    setHighRiskAcked((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveAckSet(HIGH_RISK_ACK_KEY, next);
      return next;
    });
  }, []);
  const handleAckCaution = useCallback((key: string) => {
    setCautionAcked((prev) => {
      const next = new Set(prev);
      next.add(key);
      saveAckSet(CAUTION_ACK_KEY, next);
      return next;
    });
  }, []);

  // Detect user's largest idle asset to show "swap required" hints
  const { idleAssets } = useIdleBalances(scanAddress);
  const primaryHeldSymbol = useMemo(() => {
    if (idleAssets.length === 0) return null;
    // Pick the idle asset with the highest USD value
    const sorted = [...idleAssets].sort(
      (a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0),
    );
    return sorted[0]?.token.symbol ?? null;
  }, [idleAssets]);

  const parser = useIntentParser();
  const thinkingLabel = useThinkingLabel(parser.isPending);
  // ── my_assets mode: fan out per wallet asset ──────────────────────────
  const isMyAssetsMode = intent?.my_assets && idleAssets.length > 0;

  // Deduplicate wallet assets by symbol (keep highest-USD-value per symbol)
  const dedupedAssets = useMemo<IdleAsset[]>(() => {
    if (!isMyAssetsMode) return [];
    const bySymbol = new Map<string, IdleAsset>();
    for (const a of idleAssets) {
      const sym = a.token.symbol.toUpperCase();
      const existing = bySymbol.get(sym);
      if (!existing || (a.amountUsd ?? 0) > (existing.amountUsd ?? 0)) {
        bySymbol.set(sym, a);
      }
    }
    return Array.from(bySymbol.values())
      .filter((a) => (a.amountUsd ?? 0) > 0.5)
      .sort((a, b) => (b.amountUsd ?? 0) - (a.amountUsd ?? 0))
      .slice(0, 6); // cap to avoid too many LLM calls
  }, [isMyAssetsMode, idleAssets]);

  // For my_assets mode: create per-asset intents.
  // target_symbol is null so we search ALL vaults — the best vault for a user's
  // BNB might be a WETH vault on Arbitrum (LI.FI handles swaps + bridging).
  // The per-asset differentiation happens at the LLM level: the recommendation
  // prompt receives the user's source token so it can factor in entry cost.
  const perAssetIntents = useMemo<ParsedIntent[]>(() => {
    if (!isMyAssetsMode || !intent) return [];
    return dedupedAssets.map(() => ({
      ...intent,
      my_assets: false,
      target_symbol: null,
    }));
  }, [isMyAssetsMode, intent, dedupedAssets]);

  // Single-target mode vault query (also used for consolidate — global search)
  const singleIntent = useMemo(() => {
    if (!intent) return null;
    if (!isMyAssetsMode) return intent;
    // Consolidate mode: do a global vault search (no target_symbol) using the
    // user's APY/TVL/objective filters. Any transactional vault is a candidate
    // because LI.FI handles swaps from the user's held tokens.
    if (intent.routing_mode === "consolidate") {
      return { ...intent, my_assets: false, target_symbol: null };
    }
    return null; // per-asset mode uses useMultiAssetVaults instead
  }, [intent, isMyAssetsMode]);
  const {
    ranked,
    isLoading: vaultsLoading,
    totalBeforeFilter,
    rejection,
    symbolRelaxed,
    relaxedFromSymbol,
    highRiskVaults,
    cautionVaults,
  } = useVaultsByIntent(singleIntent, 20);

  // Toggles for showing flagged vaults in recommendations
  const [showHighRisk, setShowHighRisk] = useState(false);
  const [showCaution, setShowCaution] = useState(false);
  const effectiveRanked = useMemo(() => {
    let result = ranked;
    if (showCaution && cautionVaults.length > 0) result = [...result, ...cautionVaults];
    if (showHighRisk && highRiskVaults.length > 0) result = [...result, ...highRiskVaults];
    return result;
  }, [ranked, highRiskVaults, cautionVaults, showHighRisk, showCaution]);

  // Multi-asset vault queries — one per held token
  const perAssetVaults = useMultiAssetVaults(perAssetIntents, 20);

  const chainNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of chains) map.set(c.chainId, c.name);
    return map;
  }, [chains]);

  // Build a synthetic "asset" that stands in for the user's intent so we can
  // reuse <VaultRecommendations>, which was originally written for idle-sweep.
  // The asset's chain/symbol populate the card header; address is a sentinel.
  const synthAsset = useMemo<IdleAsset | null>(() => {
    if (!intent || isMyAssetsMode) return null;
    const chainId = intent.target_chain_id ?? 0;
    const chainName =
      intent.target_chain_id !== null
        ? (chainNameById.get(intent.target_chain_id) ??
          `chain ${intent.target_chain_id}`)
        : "Any chain";
    return {
      chainId,
      chainName,
      token: {
        address: SYNTH_TOKEN_ADDRESS,
        symbol: (intent.target_symbol ?? "ANY").toUpperCase(),
        decimals: 18,
      },
      amountRaw: "0",
      amountDecimal: "0",
      amountUsd: null,
    };
  }, [intent, isMyAssetsMode, chainNameById]);

  const synthSelections = useMemo<Map<string, SelectedSource>>(() => {
    const map = new Map<string, SelectedSource>();
    if (isMyAssetsMode) {
      // One selection per deduped wallet asset
      for (const a of dedupedAssets) {
        const key = `${a.chainId}:${a.token.address.toLowerCase()}`;
        map.set(key, { asset: a, amountRaw: a.amountRaw });
      }
    } else if (synthAsset) {
      const key = `${synthAsset.chainId}:${synthAsset.token.address.toLowerCase()}`;
      map.set(key, { asset: synthAsset, amountRaw: "0" });
    }
    return map;
  }, [isMyAssetsMode, dedupedAssets, synthAsset]);

  // Presentation props for the non-portfolio card header.
  // Computed here so VaultRecommendations doesn't infer mode from token symbols.
  const presentationProps = useMemo(() => {
    if (isMyAssetsMode || !intent) {
      return {
        headerTitle: null as string | null,
        headerChainId: null as number | null,
        headerNotice: null as string | null,
        resultCount: intent?.result_count ?? null,
      };
    }

    if (symbolRelaxed && relaxedFromSymbol) {
      return {
        headerTitle: `Top Vaults (swap from ${relaxedFromSymbol})`,
        headerChainId: intent.target_chain_id ?? null,
        headerNotice: `No ${relaxedFromSymbol} vaults matched your criteria. Showing top vaults reachable via swap.`,
        resultCount: intent.result_count ?? null,
      };
    }

    if (intent.target_symbol) {
      return {
        headerTitle: `${intent.target_symbol.toUpperCase()} Vaults`,
        headerChainId: intent.target_chain_id ?? null,
        headerNotice: null,
        resultCount: intent.result_count ?? null,
      };
    }

    // Generic discovery
    return {
      headerTitle: "Top Vaults",
      headerChainId: null,
      headerNotice: null,
      resultCount: intent.result_count ?? null,
    };
  }, [isMyAssetsMode, intent, symbolRelaxed, relaxedFromSymbol]);

  // Single-target recommendation
  const singleRecArgs = useMemo(
    () =>
      intent && synthAsset && effectiveRanked.length > 0
        ? {
            synthChainId: synthAsset.chainId,
            synthTokenAddress: synthAsset.token.address,
            intent,
            rankedVaults: effectiveRanked,
            walletAssets: idleAssets,
          }
        : null,
    [intent, synthAsset, effectiveRanked, idleAssets],
  );

  const {
    recommendation: singleRec,
    isLoading: singleRecLoading,
    isFetching: singleRecFetching,
    llmError: singleLlmError,
    refetch: refetchSingleRec,
  } = useIntentRecommendation(singleRecArgs);

  // Multi-asset recommendations — one per wallet asset
  const perAssetRecArgs = useMemo(() => {
    if (!isMyAssetsMode || !intent) return [];
    return dedupedAssets.map((asset, idx) => {
      const vaultResult = perAssetVaults[idx];
      if (!vaultResult || vaultResult.ranked.length === 0) return null;
      return {
        synthChainId: asset.chainId,
        synthTokenAddress: asset.token.address,
        intent: perAssetIntents[idx],
        rankedVaults: vaultResult.ranked,
        walletAssets: idleAssets,
        sourceTokenSymbol: asset.token.symbol.toUpperCase(),
        sourceChainId: asset.chainId,
      };
    });
  }, [isMyAssetsMode, intent, dedupedAssets, perAssetVaults, perAssetIntents, idleAssets]);

  const perAssetRecs = useMultiAssetRecommendations(perAssetRecArgs);

  // Merge into a single recommendations array
  const recommendations = useMemo(() => {
    if (isMyAssetsMode) {
      return perAssetRecs
        .map((r) => r.recommendation)
        .filter((r): r is VaultRecommendation => r !== null);
    }
    return singleRec ? [singleRec] : [];
  }, [isMyAssetsMode, perAssetRecs, singleRec]);

  const recLoading = isMyAssetsMode
    ? perAssetRecs.some((r) => r.isLoading)
    : singleRecLoading;
  const recFetching = isMyAssetsMode
    ? perAssetRecs.some((r) => r.isFetching)
    : singleRecFetching;
  const llmError = isMyAssetsMode
    ? perAssetRecs.map((r) => r.llmError).find((e) => e != null) ?? null
    : singleLlmError;
  const refetchRec = isMyAssetsMode
    ? () => perAssetRecs.forEach((r) => r.refetch())
    : refetchSingleRec;

  // ── Execution pipeline ─────────────────────────────────────────────
  const [legState, legDispatch] = useReducer(legsReducer, initialLegState);
  const isConsolidateMode = intent?.routing_mode === "consolidate";

  // For consolidate: use the global ranked vault list directly (already sorted
  // by objective in rankVaultsForIntent). No per-asset search needed — LI.FI
  // handles swaps from any held token into the vault's underlying asset.
  const consolidateCandidates = useMemo<EarnVault[]>(() => {
    if (!isConsolidateMode) return [];
    const maxCandidates = intent?.result_count ?? 4;
    return effectiveRanked.slice(0, maxCandidates);
  }, [isConsolidateMode, effectiveRanked, intent?.result_count]);

  const [selectedConsolidateSlug, setSelectedConsolidateSlug] = useState<string | null>(null);

  // Auto-select the first candidate when list changes
  useEffect(() => {
    if (consolidateCandidates.length > 0 && !consolidateCandidates.some((v) => v.slug === selectedConsolidateSlug)) {
      setSelectedConsolidateSlug(consolidateCandidates[0].slug);
    }
  }, [consolidateCandidates, selectedConsolidateSlug]);

  // Reset selection on new intent
  useEffect(() => {
    if (!isConsolidateMode) setSelectedConsolidateSlug(null);
  }, [isConsolidateMode]);

  const consolidateVault = useMemo(
    () => consolidateCandidates.find((v) => v.slug === selectedConsolidateSlug) ?? consolidateCandidates[0] ?? null,
    [consolidateCandidates, selectedConsolidateSlug],
  );

  const canExecute = useMemo(() => {
    if (!isMyAssetsMode || dedupedAssets.length === 0) return false;
    if (recommendations.length === 0) return false;
    if (isConsolidateMode) return consolidateVault !== null;
    // per-asset: every recommendation needs at least a bestPick
    return recommendations.every((r) => r.bestPick !== null);
  }, [isMyAssetsMode, dedupedAssets, recommendations, isConsolidateMode, consolidateVault]);

  const handleExecute = useCallback(() => {
    if (!canExecute) return;

    const sources: SelectedSource[] = dedupedAssets.map((a) => ({
      asset: a,
      amountRaw: a.amountRaw,
    }));

    if (isConsolidateMode && consolidateVault) {
      // All assets → one vault
      legDispatch({ type: "BUILD_QUEUE", sources, destination: consolidateVault });
    } else {
      // Per-asset: each asset → its recommendation's bestPick vault
      const legs: Array<{ source: SelectedSource; destination: EarnVault }> = [];
      for (const src of sources) {
        const key = `${src.asset.chainId}:${src.asset.token.address.toLowerCase()}`;
        const rec = recommendations.find(
          (r) => `${r.forChainId}:${r.forTokenAddress}` === key,
        );
        if (rec?.bestPick) {
          legs.push({ source: src, destination: rec.bestPick.vault });
        }
      }
      if (legs.length > 0) {
        legDispatch({ type: "BUILD_QUEUE_PER_ASSET", legs });
      }
    }
  }, [canExecute, dedupedAssets, isConsolidateMode, consolidateVault, recommendations]);

  // Auto-start pipeline after queue is built
  useEffect(() => {
    if (legState.legs.length > 0 && !legState.started) {
      legDispatch({ type: "START" });
    }
  }, [legState.legs.length, legState.started]);

  const pipelineActive = legState.legs.length > 0;

  const handleSubmit = useCallback(async () => {
    if (parser.isPending) return;
    legDispatch({ type: "RESET" });
    try {
      const result = await parser.mutateAsync({ text, chains, protocols });
      setIntent(result.intent);
    } catch {
      // error surfaces via parser.error — nothing else to do here
    }
  }, [parser, text, chains, protocols]);

  const handleChipRemove = useCallback((patch: Partial<ParsedIntent>) => {
    legDispatch({ type: "RESET" });
    setIntent((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const handleReset = useCallback(() => {
    setIntent(null);
    parser.reset();
    legDispatch({ type: "RESET" });
    setSelectedConsolidateSlug(null);
  }, [parser]);

  const hasIntent = intent !== null;
  const hasAnyFilter =
    intent !== null &&
    (intent.target_symbol !== null ||
      intent.target_chain_id !== null ||
      intent.min_apy_pct !== null ||
      intent.max_apy_pct !== null ||
      intent.min_tvl_usd !== null ||
      intent.include_protocols.length > 0 ||
      intent.exclude_protocols.length > 0);

  return (
    <div className="space-y-4">
      {/* Prompt card + button share a corner — the card's bottom-right
          is squared off and the button's top-left matches, so the button
          looks like it was carved out of the card. */}
      <div>
        <div className="rounded-lg border border-border/40 bg-muted/10 p-4">
          <div className="flex items-start gap-2">
            <Sparkle
              className="mt-1 h-4 w-4 shrink-0 text-primary"
              weight="fill"
            />
            <div className="flex-1 space-y-2">
              <label
                htmlFor="intent-textarea"
                className="text-sm font-medium text-foreground"
              >
                Describe your yield goal
              </label>
              <div className="relative">
                <Textarea
                  id="intent-textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="e.g. Put my USDC into the safest vault above 5% APY on Arbitrum"
                  className="min-h-[72px] pr-8 text-sm"
                  disabled={parser.isPending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      handleSubmit();
                    }
                  }}
                />
                {text.length > 0 && !parser.isPending && (
                  <button
                    type="button"
                    onClick={() => { setText(""); handleReset(); }}
                    className="absolute right-2 top-2 rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:text-foreground"
                    title="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {EXAMPLE_INTENTS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setText(ex)}
                      disabled={parser.isPending}
                      className="rounded-full border border-border/40 bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                    >
                      {ex}
                    </button>
                  ))}
              </div>
              {parser.isError && (
                <p className="text-xs text-red-500">
                  {parser.error instanceof Error
                    ? parser.error.message
                    : "Failed to parse intent"}
                </p>
              )}
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={parser.isPending || text.trim().length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-foreground/80 shadow-sm backdrop-blur-md transition-all duration-300 hover:bg-white/10 hover:border-white/20 disabled:pointer-events-none disabled:opacity-40"
                >
                  {parser.isPending ? (
                    <>
                      <TwinklingField />
                      <span className="min-w-[5ch]">
                        {thinkingLabel}…
                      </span>
                    </>
                  ) : (
                    "Get recommendations"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Parsed filter chips */}
      {hasIntent && (
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Parsed filters
            </span>
            {!hasAnyFilter && (
              <span className="text-xs text-muted-foreground/70">
                (no specific criteria — ranking entire vault universe)
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ObjectiveChip objective={intent!.objective} />
            {intent!.my_assets && (
              <Chip
                label={`My assets (${dedupedAssets.length})`}
                onRemove={() => handleChipRemove({ my_assets: false })}
              />
            )}
            {intent!.my_assets && intent!.routing_mode === "consolidate" && (
              <Chip
                label="Consolidate → 1 vault"
                onRemove={() => handleChipRemove({ routing_mode: "per-asset" })}
              />
            )}
            {intent!.target_symbol && (
              <Chip
                label={intent!.target_symbol}
                onRemove={() => handleChipRemove({ target_symbol: null })}
              />
            )}
            {intent!.target_chain_id !== null && (
              <Chip
                label={
                  chainNameById.get(intent!.target_chain_id) ??
                  `chain ${intent!.target_chain_id}`
                }
                icon={
                  <ChainIcon
                    chainId={intent!.target_chain_id}
                    size={11}
                    rounded={3}
                  />
                }
                onRemove={() => handleChipRemove({ target_chain_id: null })}
              />
            )}
            {intent!.min_apy_pct !== null && (
              <Chip
                label={`≥ ${intent!.min_apy_pct}% APY`}
                onRemove={() => handleChipRemove({ min_apy_pct: null })}
              />
            )}
            {intent!.max_apy_pct !== null && (
              <Chip
                label={`≤ ${intent!.max_apy_pct}% APY`}
                onRemove={() => handleChipRemove({ max_apy_pct: null })}
              />
            )}
            {intent!.min_tvl_usd !== null && (
              <Chip
                label={`≥ ${formatTvl(intent!.min_tvl_usd)} TVL`}
                onRemove={() => handleChipRemove({ min_tvl_usd: null })}
              />
            )}
            {intent!.include_protocols.map((p) => (
              <Chip
                key={`inc-${p}`}
                label={`only ${p}`}
                onRemove={() =>
                  handleChipRemove({
                    include_protocols: intent!.include_protocols.filter(
                      (x) => x !== p,
                    ),
                  })
                }
              />
            ))}
            {intent!.exclude_protocols.map((p) => (
              <Chip
                key={`exc-${p}`}
                label={`no ${p}`}
                tone="warn"
                onRemove={() =>
                  handleChipRemove({
                    exclude_protocols: intent!.exclude_protocols.filter(
                      (x) => x !== p,
                    ),
                  })
                }
              />
            ))}
            {intent!.result_count !== null && (
              <Chip
                label={`Show ${intent!.result_count}`}
                onRemove={() => handleChipRemove({ result_count: null })}
              />
            )}
          </div>
        </div>
      )}

      {/* Recommendation card — reuses the same component idle-sweep uses */}
      {hasIntent && (
        <>
          {isMyAssetsMode && !isConsolidateMode && !isConnected && !scanAddress ? (
            <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Connect your wallet or enter an address to get per-asset recommendations.
              </p>
            </div>
          ) : isMyAssetsMode && !isConsolidateMode && dedupedAssets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No idle assets found in your wallet.
              </p>
            </div>
          ) : vaultsLoading && (!isMyAssetsMode || isConsolidateMode) ? (
            <VaultLoadingNotice />
          ) : (!isMyAssetsMode || isConsolidateMode) && effectiveRanked.length === 0 ? (
            <EmptyResults
              totalBeforeFilter={totalBeforeFilter}
              rejection={rejection}
              intent={intent!}
            />
          ) : (
            <>
              <LlmErrorAlert
                error={llmError}
                onRetry={refetchRec}
                isRetrying={recFetching}
              />

              {/* Consolidate mode: show top vault candidates to pick from */}
              {isMyAssetsMode && isConsolidateMode ? (
                <>
                  {vaultsLoading && consolidateCandidates.length === 0 && (
                    <VaultLoadingNotice />
                  )}
                  {consolidateCandidates.length > 0 && !pipelineActive && (
                    <div className="space-y-3">
                      <p className="px-1 text-xs text-muted-foreground">
                        Pick a vault to consolidate{" "}
                        <span className="font-medium text-foreground">
                          {dedupedAssets.length} asset{dedupedAssets.length === 1 ? "" : "s"}
                        </span>{" "}
                        into:
                      </p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {consolidateCandidates.map((vault) => {
                          const isSelected = vault.slug === selectedConsolidateSlug;
                          const key = vaultKey(vault);
                          return (
                            <div
                              key={vault.slug}
                              className={`relative rounded-xl transition-all ${
                                isSelected
                                  ? "ring-2 ring-emerald-500/50"
                                  : ""
                              }`}
                            >
                              {isSelected && (
                                <span className="absolute top-2 left-2 z-20 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                                  Selected
                                </span>
                              )}
                              <VaultCard
                                vault={vault}
                                onSelect={() => setSelectedConsolidateSlug(vault.slug)}
                                compact
                                highRiskAcknowledged={highRiskAcked.has(key)}
                                cautionAcknowledged={cautionAcked.has(key)}
                                onAcknowledgeHighRisk={() => handleAckHighRisk(key)}
                                onAcknowledgeCaution={() => handleAckCaution(key)}
                              />
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {dedupedAssets.map((a) => (
                          <span
                            key={`${a.chainId}:${a.token.address}`}
                            className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-card/50 px-2 py-0.5 text-xs text-muted-foreground"
                          >
                            <ChainIcon chainId={a.chainId} size={10} rounded={999} />
                            {a.token.symbol}
                          </span>
                        ))}
                        <span className="inline-flex items-center text-xs text-muted-foreground/60">
                          → 1 vault
                        </span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <VaultRecommendations
                    selections={synthSelections}
                    recommendations={recommendations}
                    destination={null}
                    perAssetDestinations={undefined}
                    onPick={(vault) => onSelectVault(vault)}
                    isLoading={recLoading || recFetching}
                    sourceTokenSymbol={
                      isMyAssetsMode
                        ? null
                        : symbolRelaxed
                          ? relaxedFromSymbol
                          : primaryHeldSymbol
                    }
                    headerTitle={presentationProps.headerTitle}
                    headerChainId={presentationProps.headerChainId}
                    headerNotice={presentationProps.headerNotice}
                    resultCount={presentationProps.resultCount}
                  />
                  {!isMyAssetsMode && (
                    <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground/70">
                      <span>
                        Picked from {effectiveRanked.length} intent-filtered vault
                        {effectiveRanked.length === 1 ? "" : "s"} (of {totalBeforeFilter} total).
                      </span>
                      {rejection.caution > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowCaution((p) => !p)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            showCaution
                              ? "border-yellow-500/40 bg-yellow-500/10 text-yellow-400"
                              : "border-border/40 bg-background/30 text-muted-foreground hover:border-yellow-500/30 hover:text-yellow-400"
                          }`}
                        >
                          <Warning size={11} weight="regular" />
                          {showCaution
                            ? `Hiding ${rejection.caution} flagged`
                            : `${rejection.caution} flagged hidden`}
                        </button>
                      )}
                      {rejection.highRisk > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowHighRisk((p) => !p)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                            showHighRisk
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                              : "border-border/40 bg-background/30 text-muted-foreground hover:border-amber-500/30 hover:text-amber-400"
                          }`}
                        >
                          <Warning size={11} weight="bold" />
                          {showHighRisk
                            ? `Hiding ${rejection.highRisk} high-risk`
                            : `${rejection.highRisk} high-risk hidden`}
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Execute pipeline button — only for connected wallets, not read-only */}
              {isMyAssetsMode && canExecute && !pipelineActive && isConnected && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleExecute}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-400 transition-all hover:bg-emerald-500/20 hover:border-emerald-500/50"
                  >
                    <Play size={14} weight="fill" />
                    {isConsolidateMode
                      ? `Consolidate ${dedupedAssets.length} assets → 1 vault`
                      : `Execute ${dedupedAssets.length} deposits`}
                  </button>
                </div>
              )}
              {isMyAssetsMode && !isConnected && (
                <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-4 py-3 text-center text-xs text-white">
                  Connect your wallet to deposit into the selected vault.
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Execution pipeline — only for connected wallets */}
      {pipelineActive && isConnected && (
        <ExecutionQueue state={legState} dispatch={legDispatch} />
      )}
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function ObjectiveChip({
  objective,
}: {
  objective: ParsedIntent["objective"];
}) {
  const config = {
    highest: {
      label: "Highest APY",
      icon: <TrendUp size={13} weight="bold" />,
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    },
    safest: {
      label: "Safest",
      icon: <ShieldCheck size={13} weight="bold" />,
      cls: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    },
    balanced: {
      label: "Balanced",
      icon: <Scales size={13} weight="bold" />,
      cls: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    },
  }[objective];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${config.cls}`}
    >
      {config.icon}
      {config.label}
    </span>
  );
}

function Chip({
  label,
  icon,
  onRemove,
  tone = "neutral",
}: {
  label: string;
  icon?: React.ReactNode;
  onRemove: () => void;
  tone?: "neutral" | "warn";
}) {
  const toneCls =
    tone === "warn"
      ? "border-red-500/40 bg-red-500/10 text-red-400"
      : "border-border/40 bg-background/60 text-foreground";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneCls}`}
    >
      {icon}
      <span>{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="ml-0.5 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <X size={10} weight="bold" />
      </button>
    </span>
  );
}

function VaultLoadingNotice() {
  return (
    <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
      <CircleNotch className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
      <p className="mt-2 text-xs text-muted-foreground">
        Loading vault universe…
      </p>
    </div>
  );
}

function EmptyResults({
  totalBeforeFilter,
  rejection,
  intent,
}: {
  totalBeforeFilter: number;
  rejection: ReturnType<typeof useVaultsByIntent>["rejection"];
  intent: ParsedIntent;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
      <p className="text-sm text-muted-foreground">
        No vaults match this intent.
      </p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        {totalBeforeFilter} total vaults in universe. Dropped:{" "}
        {explainRejection(rejection, intent)}
      </p>
    </div>
  );
}

function explainRejection(
  rejection: ReturnType<typeof useVaultsByIntent>["rejection"],
  intent: ParsedIntent,
): string {
  const parts: string[] = [];
  if (rejection.symbolMismatch > 0 && intent.target_symbol)
    parts.push(`${rejection.symbolMismatch} wrong token`);
  if (rejection.chainMismatch > 0 && intent.target_chain_id !== null)
    parts.push(`${rejection.chainMismatch} wrong chain`);
  if (rejection.apyBelowFloor > 0 && intent.min_apy_pct !== null)
    parts.push(`${rejection.apyBelowFloor} below APY floor`);
  if (rejection.tvlBelowFloor > 0 && intent.min_tvl_usd !== null)
    parts.push(`${rejection.tvlBelowFloor} below TVL floor`);
  if (rejection.protocolExcluded > 0)
    parts.push(`${rejection.protocolExcluded} excluded protocol`);
  if (rejection.protocolNotIncluded > 0)
    parts.push(`${rejection.protocolNotIncluded} not in allowlist`);
  if (rejection.notTransactional > 0)
    parts.push(`${rejection.notTransactional} read-only`);
  if (parts.length === 0) return "nothing matched";
  return parts.join(", ");
}
