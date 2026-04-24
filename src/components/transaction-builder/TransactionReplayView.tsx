import React, { useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Bug } from "@phosphor-icons/react";
import {
  Loader2Icon,
  CheckCircleIcon,
  AlertTriangleIcon,
  PlayIcon,
  XCloseIcon,
} from "../icons/IconLibrary";
import { ethers } from "ethers";
import NetworkSelector, { EXTENDED_NETWORKS, type ExtendedChain } from "../shared/NetworkSelector";
import { cn } from "@/lib/utils";
import type { Chain } from "../../types";
import {
  replayTransactionWithSimulator,
} from "../../utils/transactionSimulation";
import { useSimulation } from "../../contexts/SimulationContext";
import { useNetworkConfig } from "../../contexts/NetworkConfigContext";
import { classifySimulationError } from "../../utils/errorParser";
import {
  type TxPreviewData,
  type TxFetchStatus,
  type ReplayIntentAudit,
  type TxHashReplayData,
  TXHASH_REPLAY_KEY,
  TXHASH_REPLAY_EVENT,
  TXHASH_REPLAY_LAST_INTENT_KEY,
  replayShellStyle,
  replayGridContainerStyle,
  replayGridStyle,
  replayCardStyle,
  replaySectionTitleStyle,
  replaySectionStyle,
  defaultReplayNetwork,
  mapExtendedToChain,
} from "./types";
import { shortenAddress } from "../shared/AddressDisplay";

function formatReplayRpcError(rawError: string, networkName: string, mode: string): string {
  const trimmed = rawError.trim();
  const lower = trimmed.toLowerCase();

  if (lower.includes('could not detect network') || lower.includes('nonetwork')) {
    if (mode === 'DEFAULT') {
      return `Could not connect to the App Default RPC for ${networkName}. Configure a custom RPC in Settings if this network remains unavailable.`;
    }
    return `Could not connect to the configured ${mode} RPC for ${networkName}. Check your API key or switch providers in Settings.`;
  }

  if (lower.includes('403') || lower.includes('forbidden')) {
    if (mode === 'DEFAULT') {
      return `The App Default RPC for ${networkName} rejected the request. Configure a custom RPC in Settings to continue.`;
    }
    return `The configured ${mode} RPC rejected the request. Check your API key or switch providers in Settings.`;
  }

  return trimmed || "Failed to fetch transaction";
}

function formatSimulationBridgeError(rawError: string): string {
  const classified = classifySimulationError(rawError);
  return classified.suggestion
    ? `${classified.message} ${classified.suggestion}`
    : classified.message;
}

const ALCHEMY_MISSING_KEY_NOTICE =
  "Alchemy was selected without an API key. Switched back to App Default RPC.";
const INFURA_MISSING_KEY_NOTICE =
  "Infura was selected without a Project ID. Switched back to App Default RPC.";
const RPC_AUTO_SWITCH_NOTICE_KEY = "web3-toolkit:rpc-auto-switch-notice";

type RpcNoticeConfig = {
  rpcMode: "DEFAULT" | "ALCHEMY" | "INFURA" | "CUSTOM";
  alchemyApiKey?: string;
  infuraProjectId?: string;
};

function getMissingProviderNotice(config: RpcNoticeConfig): string | null {
  if (config.rpcMode === "ALCHEMY" && !config.alchemyApiKey?.trim()) {
    return ALCHEMY_MISSING_KEY_NOTICE;
  }

  if (config.rpcMode === "INFURA" && !config.infuraProjectId?.trim()) {
    return INFURA_MISSING_KEY_NOTICE;
  }

  return null;
}

function clearPersistedRpcAutoSwitchNotice() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(RPC_AUTO_SWITCH_NOTICE_KEY);
  window.sessionStorage.removeItem(RPC_AUTO_SWITCH_NOTICE_KEY);
}

function getPersistedRpcAutoSwitchNotice(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.localStorage.getItem(RPC_AUTO_SWITCH_NOTICE_KEY) ||
    window.sessionStorage.getItem(RPC_AUTO_SWITCH_NOTICE_KEY)
  );
}

function shouldClearAutoSwitchNotice(
  notice: string | null | undefined,
  config: Pick<RpcNoticeConfig, "alchemyApiKey" | "infuraProjectId">
): boolean {
  if (notice === ALCHEMY_MISSING_KEY_NOTICE) {
    return Boolean(config.alchemyApiKey?.trim());
  }

  if (notice === INFURA_MISSING_KEY_NOTICE) {
    return Boolean(config.infuraProjectId?.trim());
  }

  return false;
}

export const TransactionReplayView: React.FC<{
  modeToggle: ReactNode;
}> = ({ modeToggle }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { setSimulation } = useSimulation();
  const { config, resolveRpcUrl, saveConfig } = useNetworkConfig();
  const [selectedNetwork, setSelectedNetwork] = useState<ExtendedChain>(defaultReplayNetwork);
  const [txHash, setTxHash] = useState("");
  const [blockTag, setBlockTag] = useState("");
  const [enableDebug, setEnableDebug] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [bridgeWarning, setBridgeWarning] = useState<string | null>(null);
  const [rpcNotice, setRpcNotice] = useState<string | null>(null);
  // When true, form was prefilled from a clone resimulation - don't auto-run
  const [noAutoReplay, setNoAutoReplay] = useState(false);
  const [pendingAutoReplayToken, setPendingAutoReplayToken] = useState<number | null>(null);
  const [lastReplayIntent, setLastReplayIntent] = useState<ReplayIntentAudit | null>(null);

  // Transaction preview state - validates tx exists before enabling replay
  const [txPreview, setTxPreview] = useState<TxPreviewData | null>(null);
  const [txFetchStatus, setTxFetchStatus] = useState<TxFetchStatus>("idle");
  const [txFetchError, setTxFetchError] = useState<string | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const consumeTxHashReplayIntent = useCallback(() => {
    try {
      const stored = localStorage.getItem(TXHASH_REPLAY_KEY);
      if (!stored) return;

      const replayData: TxHashReplayData = JSON.parse(stored);
      const replayIntentAudit: ReplayIntentAudit = {
        transactionHash: replayData.transactionHash,
        noAutoReplay: replayData.noAutoReplay === true,
        source: replayData.source || "replay-intent",
        recordedAt: Date.now(),
      };

      // Clear localStorage immediately to prevent re-use
      localStorage.removeItem(TXHASH_REPLAY_KEY);
      localStorage.setItem(TXHASH_REPLAY_LAST_INTENT_KEY, JSON.stringify(replayIntentAudit));
      setLastReplayIntent(replayIntentAudit);

      // Pre-populate the form fields
      if (replayData.transactionHash) {
        setTxHash(replayData.transactionHash);
      }
      if (replayData.forkBlockTag) {
        setBlockTag(replayData.forkBlockTag);
      }
      if (typeof replayData.debugEnabled === "boolean") {
        setEnableDebug(replayData.debugEnabled);
      }
      setNoAutoReplay(replayData.noAutoReplay === true);

      // Find and set the network
      if (replayData.networkId) {
        const network = EXTENDED_NETWORKS.find(n => n.id === replayData.networkId);
        if (network) {
          setSelectedNetwork(network);
        }
      }

      setPendingAutoReplayToken(replayData.noAutoReplay ? null : Date.now());
    } catch {
      localStorage.removeItem(TXHASH_REPLAY_KEY);
      setPendingAutoReplayToken(null);
    }
  }, []);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(TXHASH_REPLAY_LAST_INTENT_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as ReplayIntentAudit;
      if (!parsed || typeof parsed.transactionHash !== "string") return;
      setLastReplayIntent(parsed);
    } catch {
      // ignore malformed observability payloads
    }
  }, []);

  // Consume replay intent on route changes and while mounted in-place.
  React.useEffect(() => {
    consumeTxHashReplayIntent();
  }, [consumeTxHashReplayIntent, location.pathname, location.search]);

  // Same-route replay requests are dispatched as a custom event by Universal Search.
  React.useEffect(() => {
    const handleReplayIntent = () => consumeTxHashReplayIntent();
    window.addEventListener(TXHASH_REPLAY_EVENT, handleReplayIntent);
    return () => window.removeEventListener(TXHASH_REPLAY_EVENT, handleReplayIntent);
  }, [consumeTxHashReplayIntent]);

  // Auto-trigger replay once form is populated from localStorage
  // Using a separate effect to ensure state has been updated
  const handleReplayRef = React.useRef<(() => Promise<void>) | undefined>(undefined);

  React.useEffect(() => {
    // Auto-replay once per consumed localStorage payload when allowed.
    if (pendingAutoReplayToken && !noAutoReplay && txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash) && !isSimulating) {
      // Small delay to ensure network state is also updated
      const timer = setTimeout(() => {
        setPendingAutoReplayToken(null);
        handleReplayRef.current?.();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [pendingAutoReplayToken, noAutoReplay, txHash, isSimulating]);

  useEffect(() => {
    const handleAutoSwitch = (event: Event) => {
      const detail = (event as CustomEvent<{ note?: string }>).detail;
      if (detail?.note) {
        setRpcNotice(detail.note);
      }
    };

    window.addEventListener('network-config-auto-switched', handleAutoSwitch);
    return () => window.removeEventListener('network-config-auto-switched', handleAutoSwitch);
  }, []);

  useEffect(() => {
    const missingProviderNotice = getMissingProviderNotice(config);
    if (missingProviderNotice) {
      setRpcNotice(missingProviderNotice);
      saveConfig({ rpcMode: "DEFAULT" });
      return;
    }

    const persistedNotice = getPersistedRpcAutoSwitchNotice();
    if (shouldClearAutoSwitchNotice(persistedNotice, config)) {
      clearPersistedRpcAutoSwitchNotice();
    }

    setRpcNotice((currentNotice) =>
      shouldClearAutoSwitchNotice(currentNotice, config) ? null : currentNotice
    );
  }, [config, saveConfig]);

  const handleNetworkChange = useCallback((network: ExtendedChain) => {
    setRpcNotice(null);
    clearPersistedRpcAutoSwitchNotice();
    setSelectedNetwork(network);
  }, []);

  // Debounced effect to fetch transaction preview when hash/network changes
  useEffect(() => {
    const trimmedHash = txHash.trim();

    // Reset state if hash is empty or invalid format
    if (!trimmedHash || !/^0x[a-fA-F0-9]{64}$/.test(trimmedHash)) {
      setTxPreview(null);
      setTxFetchStatus("idle");
      setTxFetchError(null);
      return;
    }

    // Abort any in-flight request
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }

    const abortController = new AbortController();
    fetchAbortRef.current = abortController;

    // Debounce the fetch
    const timer = setTimeout(async () => {
      if (abortController.signal.aborted) return;

      setTxFetchStatus("fetching");
      setTxFetchError(null);
      setTxPreview(null);

      try {
        const missingProviderNotice = getMissingProviderNotice(config);
        if (missingProviderNotice) {
          setRpcNotice(missingProviderNotice);
          saveConfig({ rpcMode: "DEFAULT" });
        }

        const chainForRpc: Chain = {
          id: selectedNetwork.id,
          name: selectedNetwork.name,
          rpcUrl: selectedNetwork.rpcUrl ?? "",
          blockExplorer: selectedNetwork.blockExplorer ?? "",
        } as Chain;

        const rpcResolution = resolveRpcUrl(chainForRpc.id, selectedNetwork.rpcUrl);
        const rpcUrl = rpcResolution.url;
        const persistedNotice = getPersistedRpcAutoSwitchNotice();
        if (shouldClearAutoSwitchNotice(persistedNotice, config)) {
          clearPersistedRpcAutoSwitchNotice();
        } else if (persistedNotice) {
          setRpcNotice(persistedNotice);
        } else if (rpcResolution.note) {
          setRpcNotice(rpcResolution.note);
        }

        if (!rpcUrl) {
          setTxFetchStatus("error");
          setTxFetchError(
            rpcResolution.note ||
            `No RPC available for ${selectedNetwork.name}. Switch to App Default RPC or configure a custom RPC in Settings.`
          );
          return;
        }

        const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        const tx = await provider.getTransaction(trimmedHash);

        if (abortController.signal.aborted) return;

        if (!tx) {
          setTxFetchStatus("not_found");
          setTxFetchError(`Transaction not found on ${selectedNetwork?.name || "this network"}`);
          return;
        }

        setTxPreview({
          from: tx.from,
          to: tx.to ?? null,
          value: tx.value?.toString() || "0",
          data: tx.data || "0x",
          blockNumber: tx.blockNumber ?? null,
          nonce: tx.nonce,
        });
        setTxFetchStatus("found");
        setTxFetchError(null);
      } catch (err: any) {
        if (abortController.signal.aborted) return;
        setTxFetchStatus("error");
        setTxFetchError(
          formatReplayRpcError(
            err?.message || "Failed to fetch transaction",
            selectedNetwork?.name || "this network",
            resolveRpcUrl(selectedNetwork.id, selectedNetwork.rpcUrl).mode || 'DEFAULT'
          )
        );
      }
    }, 500); // 500ms debounce

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [txHash, selectedNetwork, resolveRpcUrl]);

  const handleReplay = useCallback(async () => {
    const trimmedHash = txHash.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(trimmedHash)) {
      setFormError("Enter a valid 32-byte transaction hash (0x-prefixed).");
      return;
    }

    setFormError(null);
    setBridgeWarning(null);
    setIsSimulating(true);

    try {
      const chainForReplay = mapExtendedToChain(selectedNetwork);
      const simulation = await replayTransactionWithSimulator(
        chainForReplay,
        trimmedHash,
        {
          blockTag: blockTag.trim() || undefined,
          enableDebug: enableDebug === true,
        }
      );

      if (!simulation) {
        setBridgeWarning(
          "Simulator bridge unavailable. Run `npm run simulator:server` and ensure the edb-simulator binary is built."
        );
        return;
      }

      // Check if simulation failed with an error message
      if (simulation.success === false && simulation.error) {
        setBridgeWarning(formatSimulationBridgeError(simulation.error));
        return;
      }

      const generatedSimulationId = crypto.randomUUID();
      const enrichedSimulation = {
        ...simulation,
        networkName: selectedNetwork?.name || "Unknown",
        chainId: selectedNetwork?.id,
        transactionHash: trimmedHash,
        debugEnabled: enableDebug === true,
        // If user specified a fork block, store it separately (don't overwrite original blockNumber)
        ...(blockTag.trim() ? { forkBlockTag: blockTag.trim() } : {}),
        simulationId: generatedSimulationId,
      };

      const calldata = simulation.data;
      const networkIdForCtx = selectedNetwork?.id || 1;
      const contractContext = {
        chainFamily: 'evm' as const,
        chainKey: `evm:${networkIdForCtx}` as const,
        address: simulation.to || "",
        abi: null as any[] | null,
        networkId: networkIdForCtx,
        networkName: selectedNetwork?.name || "Unknown",
        simulationOrigin: 'tx-hash-replay' as const,
        replayTxHash: trimmedHash,
        fromAddress: simulation.from || undefined,
        calldata: calldata || undefined,
        ethValue: simulation.value || undefined,
        blockOverride: blockTag.trim() || (simulation.blockNumber ? String(simulation.blockNumber) : undefined),
        debugEnabled: enableDebug === true,
      };

      setSimulation(enrichedSimulation as any, contractContext);
      navigate(`/simulation/${generatedSimulationId}`, { state: { fromSimulation: true } });
    } catch (error: any) {
      const rawMessage =
        error?.message ??
        "Replay failed due to an unexpected error.";
      const classified = classifySimulationError(rawMessage);
      setFormError(classified.message);
    } finally {
      setIsSimulating(false);
    }
  }, [
    selectedNetwork,
    txHash,
    blockTag,
    enableDebug,
    navigate,
    setSimulation,
  ]);

  // Keep the ref updated so auto-replay can call the latest handleReplay
  handleReplayRef.current = handleReplay;

  const resetForm = useCallback(() => {
    setTxHash("");
    setBlockTag("");
    setEnableDebug(false);
    setFormError(null);
    setBridgeWarning(null);
    setRpcNotice(null);
    clearPersistedRpcAutoSwitchNotice();
    setTxPreview(null);
    setTxFetchStatus("idle");
    setTxFetchError(null);
  }, []);

  // Only enable replay when transaction has been verified to exist on the network
  const runDisabled = !txHash.trim() || isSimulating || txFetchStatus !== "found";

  return (
    <div style={replayShellStyle}>
      <div style={replayGridContainerStyle}>
        <div style={replayGridStyle}>
          {/* Bordered Container - matching SimpleGridUI's contractCardStyle */}
          <div style={replayCardStyle}>
            <h3 style={replaySectionTitleStyle}>Transaction Replay</h3>
            {modeToggle}

            <section style={replaySectionStyle}>
              {/* Transaction Hash with inline Network Selector and Action Button */}
              <div className="flex flex-col gap-3">
                <Label
                  htmlFor="transaction-hash-input"
                  className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1"
                >
                  Transaction Hash
                </Label>
                {lastReplayIntent && (
                  <p className="pl-1 text-[11px] text-slate-400">
                    Last intent: {lastReplayIntent.noAutoReplay ? "manual replay prefill" : "auto trace replay"} ·{" "}
                    {lastReplayIntent.source} · {new Date(lastReplayIntent.recordedAt).toLocaleTimeString()}
                  </p>
                )}

                <div className="relative group">
                  <div className="relative flex items-center">
                    <Input
                      id="transaction-hash-input"
                      name="transactionHash"
                      autoComplete="off"
                      spellCheck={false}
                      value={txHash}
                      onChange={(event) => {
                        setRpcNotice(null);
                        clearPersistedRpcAutoSwitchNotice();
                        setTxHash(event.target.value);
                      }}
                      placeholder="0x0000…0000"
                      className={cn(
                        "h-12 pl-4 pr-[120px] font-mono text-sm tracking-tight transition-all duration-300",
                        "bg-transparent! border-slate-800/50 hover:border-slate-700/60 focus:ring-0 focus:border-white/50",
                        txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash) && "border-white/30 bg-white/[0.02]"
                      )}
                    />

                    <div className="absolute right-1.5 flex items-center h-9 gap-1 px-1">
                      {txHash && (
                        <Button
                          type="button"
                          variant="icon-borderless"
                          size="icon-inline"
                          onClick={() => setTxHash("")}
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
                        onNetworkChange={handleNetworkChange}
                        networks={EXTENDED_NETWORKS}
                        showTestnets={true}
                        size="sm"
                        variant="input"
                      />

                      <Button
                        type="button"
                        variant="icon-borderless"
                        size="icon-inline"
                        onClick={handleReplay}
                        disabled={runDisabled}
                        className={cn(
                          "p-1.5 rounded-md transition-colors",
                          "text-primary hover:text-primary-foreground hover:bg-primary",
                          "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-primary"
                        )}
                        title="Run Replay"
                        aria-label="Run Replay"
                      >
                        {isSimulating ? (
                          <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        ) : (
                          <PlayIcon width={16} height={16} />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {rpcNotice && (
                <div className="flex items-center gap-3 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10">
                  <AlertTriangleIcon width={16} height={16} className="text-yellow-300" />
                  <span className="text-sm text-yellow-100">{rpcNotice}</span>
                </div>
              )}

              {txHash.trim() && /^0x[a-fA-F0-9]{64}$/.test(txHash.trim()) && (
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  {txFetchStatus === "fetching" && (
                    <div className="flex items-center gap-3 p-4 bg-muted/30">
                      <Loader2Icon width={16} height={16} className="animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Validating transaction on {selectedNetwork?.name}...
                      </span>
                    </div>
                  )}

                  {txFetchStatus === "not_found" && (
                    <div className="flex items-center gap-3 p-4 bg-destructive/10 border-destructive/30">
                      <AlertTriangleIcon width={16} height={16} className="text-destructive" />
                      <span className="text-sm text-destructive">
                        {txFetchError || "Transaction not found on this network"}
                      </span>
                    </div>
                  )}

                  {txFetchStatus === "error" && (
                    <div className="flex items-center gap-3 p-4 bg-destructive/10 border-destructive/30">
                      <AlertTriangleIcon width={16} height={16} className="text-destructive" />
                      <span className="text-sm text-destructive">
                        {txFetchError || "Failed to fetch transaction"}
                      </span>
                    </div>
                  )}

                  {txFetchStatus === "found" && txPreview && (
                    <div className="p-4 bg-green-500/5 border-green-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircleIcon width={16} height={16} className="text-green-500" />
                        <span className="text-sm font-medium text-green-400">
                          Transaction found on {selectedNetwork?.name}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block mb-1">From</span>
                          <code className="text-foreground font-mono">{shortenAddress(txPreview.from)}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-1">To</span>
                          <code className="text-foreground font-mono">{shortenAddress(txPreview.to)}</code>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-1">Value</span>
                          <code className="text-foreground font-mono">
                            {txPreview.value === "0" ? "0" : `${ethers.utils.formatEther(txPreview.value)} ETH`}
                          </code>
                        </div>
                        <div>
                          <span className="text-muted-foreground block mb-1">Block</span>
                          <code className="text-foreground font-mono">
                            {txPreview.blockNumber ?? "Pending"}
                          </code>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-col gap-3">
                <Label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                  Block Tag (optional)
                </Label>
                <Input
                  type="text"
                  value={blockTag}
                  onChange={(event) => setBlockTag(event.target.value)}
                  placeholder="latest"
                  className="h-12 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground pl-1">
                  Leave empty for latest state. Accepts block numbers or tags (e.g. "safe").
                </p>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label
                      htmlFor="replay-enable-debug"
                      className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"
                    >
                      <Bug className="w-3.5 h-3.5" />
                      Debug Session
                    </Label>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Opt-in live debugging (expression eval, snapshots, source stepping). This increases replay startup time.
                    </p>
                  </div>
                  <Switch
                    id="replay-enable-debug"
                    checked={enableDebug === true}
                    onCheckedChange={(checked) => setEnableDebug(checked === true)}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={resetForm}
                  size="sm"
                >
                  Reset
                </Button>
              </div>

              {formError && (
                <div className="p-3 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-sm">
                  {formError}
                </div>
              )}

              {bridgeWarning && (
                <div className="p-3 rounded-md border border-yellow-500/50 bg-yellow-500/10 text-yellow-200 text-sm">
                  {bridgeWarning}
                </div>
              )}
            </section>

            {isSimulating && (
              <section style={replaySectionStyle} className="border-t border-border pt-6 mt-4">
                <div className="flex items-center gap-3 p-4 rounded-md border border-primary/30 bg-primary/5">
                  <Loader2Icon
                    width={20}
                    height={20}
                    className="animate-spin text-primary"
                  />
                  <div>
                    <strong className="text-foreground">Executing replay...</strong>
                    <p className="text-sm text-muted-foreground mt-1">
                      Forking state and running the transaction through EDB. Results will open in a new page.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
