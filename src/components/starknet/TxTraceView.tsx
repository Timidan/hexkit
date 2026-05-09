import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import { PlayIcon, XCloseIcon } from "../icons/IconLibrary";
import NetworkSelector, {
  STARKNET_NETWORKS,
  type ExtendedChain,
} from "../shared/NetworkSelector";
import { cn } from "@/lib/utils";
import { StarknetSimulator } from "@/chains/starknet/simulatorClient";
import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";
import type { StarknetNetwork } from "@/config/networkConfig";
import { useStarknetSimulation } from "@/contexts/StarknetSimulationContext";
import { generateStarknetSimulationId } from "@/services/StarknetSimulationHistoryService";
import BridgeErrorAlert from "./BridgeErrorAlert";
import PendingElapsed from "./PendingElapsed";
import { extractTxHash } from "./txHashParse";

interface Props {
  /** Manual/Project · Transaction Replay strip rendered at the TOP of the
   *  replay card. Mirrors EVM `<TransactionReplayView modeToggle={...}>` —
   *  the hub owns the toggle so the same DOM swaps between sub-modes. */
  modeToggle?: React.ReactNode;
  /** Pre-populate the hash input from the URL (?txHash=…) and auto-trace
   *  once on mount. */
  initialTxHash?: string | null;
  /** Sync the active tx hash to the URL after a successful trace, or
   *  clear it when the input goes empty. */
  onTxHashCommit?: (hash: string | null) => void;
  /** Push to the page-level "Recent simulations" sidebar after each
   *  successful trace. */
  onTraceSucceeded?: (txHash: string) => void;
  /** Which Starknet network this trace targets. Threaded into the
   *  simulator client so the bridge picks the right RPC via the
   *  `X-Starknet-Rpc-Url` header. */
  network: StarknetNetwork;
  /** Extended chain — drives the inline NetworkSelector inside the
   *  Transaction Hash input's right edge. The hub owns this so the
   *  picker's choice survives mode switches. */
  selectedNetwork: ExtendedChain;
  onNetworkChange: (network: ExtendedChain) => void;
}

// Match EVM's `replayCardStyle` chrome — single bordered container, no
// shadcn `<Card>` wrapper, hardcoded inline so the visual matches even if
// EVM's local style constants drift.
const replayCardStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  padding: "24px",
  background: "transparent",
  border: "1px solid #444",
  borderRadius: "8px",
  boxShadow: "none",
};

const replaySectionTitleStyle: React.CSSProperties = {
  fontSize: "15px",
  fontWeight: 600,
  color: "#888",
  marginBottom: "16px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const replaySectionStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  maxWidth: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const TxTraceView: React.FC<Props> = ({
  modeToggle,
  initialTxHash,
  onTxHashCommit,
  onTraceSucceeded,
  network,
  selectedNetwork,
  onNetworkChange,
}) => {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const navigate = useNavigate();
  const { setSimulation } = useStarknetSimulation();
  const [hash, setHash] = useState(initialTxHash ?? "");
  const [pending, setPending] = useState(false);
  // string = local input validation; Error = bridge response (handed to alert mapper).
  const [error, setError] = useState<string | Error | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [bridgeGitSha, setBridgeGitSha] = useState<string | null>(null);
  // Policy B (background pre-fetch): the upstream /trace path returns fast
  // but lacks state_diff; we fire `?trace_steps=1` in parallel for a local
  // replay so the STATE tab is usually populated by the time the user opens it.
  // After the navigation refactor the only consumer is the
  // <StarknetSimulationContext> entry — local UI no longer reads these flags
  // because the inline results panel was removed.
  const stateReplayRequestedForHashRef = useRef<string | null>(null);
  const stateReplayAbortRef = useRef<AbortController | null>(null);
  // Latest sim entry id we navigated with — Policy B needs to read this so
  // the prefetch-success handler can update the same context entry without
  // racing against an unrelated newer trace.
  const lastSimEntryIdRef = useRef<string | null>(null);
  const lastResponseRef = useRef<SimulateResponse | null>(null);
  const lastNetworkRef = useRef<StarknetNetwork>(network);
  lastNetworkRef.current = network;
  // Re-fires auto-trace when the URL hash changes (recent-sim click, edited query)
  // — without it, navigation stickied on the first hash and rendered stale results.
  const lastAutoTracedRef = useRef<string | null>(null);

  // /health on mount — chain_id seeds Voyager/Starkscan links; git SHA pins the footer.
  useEffect(() => {
    if (!simulator.isConfigured) return;
    let cancelled = false;
    simulator
      .health()
      .then((h) => {
        if (cancelled) return;
        setChainId(h.chain_id ?? null);
        setBridgeGitSha(h.git_sha ?? null);
      })
      .catch(() => {
        // BridgeErrorBanner already surfaces health to the user.
      });
    return () => {
      cancelled = true;
    };
  }, [simulator]);

  const parsed = extractTxHash(hash);
  const valid = parsed !== null;

  const cancelStateReplay = useCallback(() => {
    if (stateReplayAbortRef.current) {
      stateReplayAbortRef.current.abort();
      stateReplayAbortRef.current = null;
    }
  }, []);

  // Policy B fetch: overlays only `stateDiff` onto the existing response.
  // Two guards: AbortController on pivot-away, latestHashRef mismatch skip.
  const latestHashRef = useRef<string | null>(null);
  const prefetchStateDiff = useCallback(
    (target: string) => {
      if (!target) return;
      if (stateReplayRequestedForHashRef.current === target) return;
      stateReplayRequestedForHashRef.current = target;
      const controller = new AbortController();
      stateReplayAbortRef.current = controller;
      void simulator
        .trace(target, { traceSteps: true, signal: controller.signal, network })
        .then((res) => {
          if (controller.signal.aborted) return;
          if (latestHashRef.current !== target) return;
          const replayedDiff = res.results?.[0]?.stateDiff ?? null;
          // Merge the diff into the canonical response we last surfaced,
          // then push the updated entry back into context so the results
          // page re-renders with the State tab populated.
          const prev = lastResponseRef.current;
          const entryId = lastSimEntryIdRef.current;
          if (prev && entryId) {
            const replayedResult = res.results?.[0];
            const hasReplayStateDiff = Boolean(replayedResult?.stateDiff);
            const hasReplaySteps =
              (replayedResult?.traceSteps?.length ?? 0) > 0 ||
              (replayedResult?.functionFrames?.length ?? 0) > 0;
            const nextResults = prev.results.map((r, idx) =>
              idx === 0
                ? {
                    ...r,
                    stateDiff: replayedDiff,
                    traceSteps: replayedResult?.traceSteps ?? r.traceSteps,
                    functionFrames:
                      replayedResult?.functionFrames ?? r.functionFrames,
                    stateDiffSource: hasReplayStateDiff
                      ? res.source ?? replayedResult?.stateDiffSource ?? r.stateDiffSource
                      : r.stateDiffSource,
                    traceStepsSource: hasReplaySteps
                      ? res.source ?? replayedResult?.traceStepsSource ?? r.traceStepsSource
                      : r.traceStepsSource,
                    stateDiffWarning:
                      res.warning ?? replayedResult?.stateDiffWarning ?? r.stateDiffWarning,
                  }
                : r,
            );
            const nextResponse: SimulateResponse = {
              ...prev,
              chainId: res.chainId ?? prev.chainId,
              source: prev.source ?? res.source,
              warning: prev.warning ?? res.warning,
              stateDiffSource: hasReplayStateDiff
                ? res.source ?? prev.stateDiffSource
                : prev.stateDiffSource,
              traceStepsSource: hasReplaySteps
                ? res.source ?? prev.traceStepsSource
                : prev.traceStepsSource,
              stateDiffWarning: res.warning ?? prev.stateDiffWarning,
              results: nextResults,
            };
            lastResponseRef.current = nextResponse;
            setSimulation({
              id: entryId,
              source: "trace",
              response: nextResponse,
              txHash: target,
              chainId: nextResponse.chainId ?? nextResponse.blockContext.chainId ?? chainId,
              bridgeGitSha,
              network: lastNetworkRef.current,
              stateReplayPending: false,
              stateReplayError: null,
              createdAt: Date.now(),
            });
          }
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          // Reset the requested-for ref on failure so a retry path can refire.
          stateReplayRequestedForHashRef.current = null;
          const e = err instanceof Error ? err : new Error(String(err));
          // Push the error into context so the results page can render it.
          const prev = lastResponseRef.current;
          const entryId = lastSimEntryIdRef.current;
          if (prev && entryId) {
            setSimulation({
              id: entryId,
              source: "trace",
              response: prev,
              txHash: latestHashRef.current ?? undefined,
              chainId: prev.chainId ?? prev.blockContext.chainId ?? chainId,
              bridgeGitSha,
              network: lastNetworkRef.current,
              stateReplayPending: false,
              stateReplayError: e,
              createdAt: Date.now(),
            });
          }
        })
        .finally(() => {
          if (stateReplayAbortRef.current === controller) {
            stateReplayAbortRef.current = null;
          }
        });
    },
    [simulator, network, setSimulation, chainId, bridgeGitSha],
  );

  const runTrace = useCallback(
    async (nextHash?: string) => {
      const target = extractTxHash(nextHash ?? hash);
      setError(null);
      // Tearing down a stale state-diff request keeps the State tab
      // honest: a fresh trace re-runs the pre-fetch from scratch.
      cancelStateReplay();
      stateReplayRequestedForHashRef.current = null;
      if (!target) {
        setError(
          "Paste a 0x-prefixed hash or a Voyager / Starkscan transaction URL.",
        );
        return;
      }
      // Canonicalize — if the user pasted a URL, snap the input back to
      // the bare hash so the field, the URL bar, and the trace request
      // all agree.
      if (target !== hash.trim()) setHash(target);
      latestHashRef.current = target;
      setPending(true);
      try {
        const res = await simulator.trace(target, { network });
        onTxHashCommit?.(target);
        onTraceSucceeded?.(target);
        // Policy B background pre-fetch — fire only when the upstream
        // response carries no usable stateDiff (the upstream
        // traceTransaction path strips it for landed txs). If the diff
        // is already present (e.g. reverted txs / speculative simulate)
        // there's nothing to recompute.
        const sd = res.results?.[0]?.stateDiff ?? null;
        const sdEmpty =
          !sd ||
          ((sd.storageDiffs?.length ?? 0) === 0 &&
            (sd.nonceUpdates?.length ?? 0) === 0 &&
            (sd.classHashUpdates?.length ?? 0) === 0);

        // EDB-parity: stamp a friendly base36 ID (matches EVM's format),
        // push into context, navigate away. The Policy B prefetch (below)
        // updates the same context entry.
        const simId = generateStarknetSimulationId();
        lastSimEntryIdRef.current = simId;
        lastResponseRef.current = res;
        setSimulation({
          id: simId,
          source: "trace",
          response: res,
          txHash: target,
          chainId: res.chainId ?? res.blockContext.chainId ?? chainId,
          bridgeGitSha,
          network,
          stateReplayPending: sdEmpty,
          stateReplayError: null,
          createdAt: Date.now(),
        });
        navigate(`/starknet/simulation/${simId}`, {
          state: { fromSimulation: true },
        });

        if (sdEmpty) {
          // Defer to a microtask so navigation paints first and the
          // pre-fetch genuinely runs in the background.
          Promise.resolve().then(() => prefetchStateDiff(target));
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setPending(false);
      }
    },
    [
      simulator,
      hash,
      network,
      onTxHashCommit,
      onTraceSucceeded,
      cancelStateReplay,
      prefetchStateDiff,
      setSimulation,
      navigate,
      chainId,
      bridgeGitSha,
    ],
  );

  // Do not abort the replay on the navigation to the results page: that
  // request is what hydrates the State and Debug tabs for the entry we just
  // wrote into context. New trace submissions still abort stale replay via
  // cancelStateReplay() above.
  useEffect(() => {
    return undefined;
  }, []);

  // Auto-trace whenever the URL hands us a NEW tx hash. The ref tracks
  // the last canonical hash we fired against so HMR / route re-renders
  // don't duplicate the call, but a genuine change (recent-list click,
  // back/forward, edited query string) re-fires + clears stale state.
  useEffect(() => {
    const canonical = extractTxHash(initialTxHash);
    if (!canonical) {
      // URL no longer carries a tx hash — clear local input error.
      if (lastAutoTracedRef.current !== null) {
        lastAutoTracedRef.current = null;
        setError(null);
      }
      return;
    }
    if (lastAutoTracedRef.current === canonical) return;
    lastAutoTracedRef.current = canonical;
    setError(null);
    setHash(canonical);
    void runTrace(canonical);
  }, [initialTxHash, runTrace]);

  // EVM parity: the Play button is gated purely on the felt-shape regex
  // (`extractTxHash` returns null for malformed input). Starknet has no
  // EVM-equivalent pre-validation `txFetchStatus` flow, so a 64-char
  // hex felt is enough to enable Run Replay.
  const runDisabled = !valid || pending;

  return (
    <div className="space-y-4">
      <div style={replayCardStyle}>
        <h3 style={replaySectionTitleStyle}>Transaction Replay</h3>
        {modeToggle}

        <section style={replaySectionStyle}>
          <div className="flex flex-col gap-3">
            <Label
              htmlFor="starknet-tx-hash-input"
              className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1"
            >
              Transaction Hash
            </Label>

            <div className="relative group">
              <div className="relative flex items-center">
                <Input
                  id="starknet-tx-hash-input"
                  name="starknetTransactionHash"
                  autoComplete="off"
                  spellCheck={false}
                  value={hash}
                  onChange={(e) => {
                    const next = e.target.value;
                    setHash(next);
                    if (next.trim() === "") onTxHashCommit?.(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !runDisabled) void runTrace();
                  }}
                  placeholder="0x0000…0000"
                  disabled={pending}
                  className={cn(
                    "h-12 pl-4 pr-[120px] font-mono text-sm tracking-tight transition-all duration-300",
                    "bg-transparent! border-slate-800/50 hover:border-slate-700/60 focus:ring-0 focus:border-white/50",
                    valid && "border-white/30 bg-white/[0.02]"
                  )}
                />

                <div className="absolute right-1.5 flex items-center h-9 gap-1 px-1">
                  {hash && (
                    <Button
                      type="button"
                      variant="icon-borderless"
                      size="icon-inline"
                      onClick={() => {
                        setHash("");
                        onTxHashCommit?.(null);
                      }}
                      className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                      title="Clear hash"
                      aria-label="Clear hash"
                    >
                      <XCloseIcon width={14} height={14} />
                    </Button>
                  )}

                  <NetworkSelector
                    className="scale-90 opacity-90 hover:opacity-100 transition-opacity"
                    selectedNetwork={selectedNetwork}
                    onNetworkChange={onNetworkChange}
                    networks={STARKNET_NETWORKS}
                    showTestnets={selectedNetwork.isTestnet === true}
                    size="sm"
                    variant="input"
                  />

                  <Button
                    type="button"
                    variant="icon-borderless"
                    size="icon-inline"
                    onClick={() => void runTrace()}
                    disabled={runDisabled}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      "text-primary hover:text-primary-foreground hover:bg-primary",
                      "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-primary"
                    )}
                    title="Run Replay"
                    aria-label="Run Replay"
                  >
                    {pending ? (
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    ) : (
                      <PlayIcon width={16} height={16} />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {!simulator.isConfigured && (
            <Alert>
              <AlertTitle className="text-warning">Bridge disabled</AlertTitle>
              <AlertDescription>
                Set <span className="font-mono">VITE_STARKNET_SIM_BRIDGE_URL</span> in{" "}
                <span className="font-mono">.env</span> to enable tracing.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            typeof error === "string" ? (
              <Alert variant="destructive">
                <AlertTitle>Check the input</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : (
              <BridgeErrorAlert error={error} context="Trace" />
            )
          )}

          {pending && (
            <div className="pt-1">
              <PendingElapsed label="Tracing" testId="trace-elapsed" />
            </div>
          )}
        </section>
      </div>

      {/* Results render on /starknet/simulation/:id — see
          StarknetSimulationResultsPage. The form stays here so when the user
          navigates back via the results-page Back button the input field is
          still pre-populated with the last-traced hash. */}
    </div>
  );
};

export default TxTraceView;
