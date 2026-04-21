import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTxAnalysis, type AnalysisStatus } from "./useTxAnalysis";
import { useHackAnalysis } from "./useHackAnalysis";
import { useHackTriage } from "./useHackTriage";
import { HackAnalysisPanel } from "./HackAnalysisPanel";
import { HackTriagePanel } from "./HackTriagePanel";
import { DeepDiveDrawer } from "./DeepDiveDrawer";
import { SummaryCard } from "./SummaryCard";
import { verdictToMarkdown } from "../../utils/tx-analysis/markdown";
import { LlmError } from "../../utils/llm/types";
import type { BridgeSimulationResponsePayload } from "../../utils/transaction-simulation/types";
import type {
  HeimdallSourceBundle,
  VerifiedSourceBundle,
} from "../../utils/tx-analysis/deepDive";
import { contractResolver } from "../../utils/resolver/ContractResolver";
import { getChainById } from "../../chains/registry";
import { fetchHeimdallDecompilation } from "../../utils/heimdall/heimdallApi";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import NetworkSelector, {
  EXTENDED_NETWORKS,
  type ExtendedChain,
} from "../shared/NetworkSelector";
import {
  defaultReplayNetwork,
  mapExtendedToChain,
  replayCardStyle,
  replayGridContainerStyle,
  replayGridStyle,
  replaySectionStyle,
  replaySectionTitleStyle,
} from "../transaction-builder/types";
import { replayTransactionWithSimulator } from "../../utils/transactionSimulation";
import { useSimulation } from "../../contexts/SimulationContext";
import { classifySimulationError } from "../../utils/errorParser";
import { useTxPreview } from "../../hooks/useTxPreview";
import {
  CircleNotch,
  Detective,
  DownloadSimple,
  StopCircle,
  MagnifyingGlass,
  Play,
} from "@phosphor-icons/react";

const HACK_TRIAGE_ADDRESS: `0x${string}` =
  (import.meta.env.VITE_HACK_TRIAGE_ADDRESS as `0x${string}` | undefined) ??
  "0xBe02be322c7733759ee068067BD620791e9e73D4";

const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

function formatAnalysisError(err: Error): { title: string; detail?: string } {
  if (err.name === "AbortError") return { title: "Analysis cancelled." };
  if (err instanceof LlmError) {
    switch (err.errorClass) {
      case "context_overflow":
        return {
          title: "Evidence too large for the proxy.",
          detail: "Try cancelling verified-source fetching, or run a simpler analysis first.",
        };
      case "rate_limit":
        return {
          title: "LLM rate-limited.",
          detail: "Wait a moment and retry.",
        };
      case "bad_key":
        return {
          title: "LLM key rejected.",
          detail: "Check provider credentials in Settings.",
        };
      case "provider_down":
        return {
          title: "LLM provider unavailable.",
          detail: "Try again in a moment or switch providers.",
        };
      case "network":
        return {
          title: "Network error talking to the LLM proxy.",
          detail: "Check the proxy process is running.",
        };
      case "schema_invalid":
        return {
          title: "LLM returned a malformed verdict.",
          detail: "Try re-running; if it persists, lower the temperature.",
        };
      default:
        return { title: "LLM call failed.", detail: err.message };
    }
  }
  return { title: "Analysis failed.", detail: err.message };
}

const STATUS_LABEL: Record<Exclude<AnalysisStatus, "idle" | "ready" | "error">, string> = {
  extracting: "Extracting evidence from simulation…",
  llm: "Asking the model…",
  deep_dive: "Reading verified + decompiled source…",
};

interface Props {
  simulation: BridgeSimulationResponsePayload | null;
  simulationId: string | null;
  from: string | null;
  to: string | null;
  txHash: string | null;
}

function download(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const TxAnalysisPanel: React.FC<Props> = ({ simulation, simulationId, from, to, txHash }) => {
  const ready = Boolean(simulation && simulationId && from && to);
  const { setAnalysisSubject } = useSimulation();

  const [formTxHash, setFormTxHash] = useState("");
  const [formNetwork, setFormNetwork] = useState<ExtendedChain>(defaultReplayNetwork);
  const [formError, setFormError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [autoRunPending, setAutoRunPending] = useState(false);

  const {
    txPreview: previewTx,
    txFetchStatus: previewStatus,
    txFetchError: previewError,
  } = useTxPreview({ txHash: formTxHash, selectedNetwork: formNetwork });

  const deepDiveFetchers = useMemo(() => {
    const chainId = simulation?.chainId ?? null;
    if (!chainId) return undefined;
    const chain = getChainById(chainId);
    if (!chain) return undefined;

    const fetchVerifiedSource = async (address: string): Promise<VerifiedSourceBundle | null> => {
      const result = await contractResolver.resolve(address, chain);
      const sources = result.metadata?.sources;
      if (!result.verified || !sources || Object.keys(sources).length === 0) return null;
      const provider: VerifiedSourceBundle["provider"] =
        result.source === "etherscan" || result.source === "sourcify" || result.source === "blockscout"
          ? result.source
          : "sourcify";
      return {
        contractName: result.name ?? address,
        files: Object.entries(sources).map(([path, source]) => ({ path, source })),
        provider,
      };
    };

    const fetchHeimdallDecompile = async (address: string): Promise<HeimdallSourceBundle | null> => {
      try {
        const res = await fetchHeimdallDecompilation({ address, chainId });
        return { source: res.source, provider: "heimdall" };
      } catch {
        return null;
      }
    };

    return { fetchVerifiedSource, fetchHeimdallDecompile };
  }, [simulation?.chainId]);

  const analysis = useTxAnalysis({
    simulation: simulation ?? null,
    simulationId: simulationId ?? "",
    from: from ?? "",
    to: to ?? "",
    txHash,
    deepDiveFetchers,
  });
  const hack = useHackAnalysis({ packet: analysis.packet, invoke: analysis.invokeFn });
  const triage = useHackTriage({ packet: analysis.packet, contractAddress: HACK_TRIAGE_ADDRESS });
  const [deepOpen, setDeepOpen] = useState(false);
  const [deeperScanOpen, setDeeperScanOpen] = useState(false);

  useEffect(() => {
    setDeepOpen(false);
    setDeeperScanOpen(false);
  }, [simulationId, txHash]);

  const triageBusy =
    triage.status === "encrypting" ||
    triage.status === "writing" ||
    triage.status === "waiting-fhe" ||
    triage.status === "decrypting";
  const hackBusy =
    hack.status === "classifying" ||
    hack.status === "retrieving" ||
    hack.status === "llm";

  const handleFetchAndAnalyze = useCallback(async () => {
    const trimmed = formTxHash.trim();
    if (!TX_HASH_RE.test(trimmed)) {
      setFormError("Enter a valid 32-byte transaction hash (0x-prefixed).");
      return;
    }
    if (previewStatus !== "found") {
      setFormError(
        previewError ||
          (previewStatus === "fetching"
            ? "Still validating the transaction on the selected network…"
            : `Transaction not found on ${formNetwork.name}. Confirm the hash and network before analyzing.`),
      );
      return;
    }
    setFormError(null);
    setIsFetching(true);
    try {
      const chainForReplay = mapExtendedToChain(formNetwork);
      const sim = await replayTransactionWithSimulator(chainForReplay, trimmed);
      if (!sim) {
        setFormError(
          "Simulator bridge unavailable. Run `npm run simulator:server` and ensure the edb-simulator binary is built.",
        );
        return;
      }
      if (sim.success === false && sim.error) {
        const classified = classifySimulationError(sim.error);
        setFormError(
          classified.suggestion ? `${classified.message} ${classified.suggestion}` : classified.message,
        );
        return;
      }
      const generatedSimulationId = crypto.randomUUID();
      const enriched = {
        ...sim,
        networkName: formNetwork.name,
        chainId: formNetwork.id,
        transactionHash: trimmed,
        simulationId: generatedSimulationId,
      };
      setAnalysisSubject({
        simulationId: generatedSimulationId,
        from: sim.from ?? "",
        to: sim.to ?? "",
        txHash: trimmed,
        simulation: enriched as unknown as BridgeSimulationResponsePayload,
      });
      setAutoRunPending(true);
    } catch (err: any) {
      const classified = classifySimulationError(err?.message || "Failed to fetch transaction");
      setFormError(classified.message);
    } finally {
      setIsFetching(false);
    }
  }, [formTxHash, formNetwork, setAnalysisSubject, previewStatus, previewError]);

  useEffect(() => {
    if (!autoRunPending || !ready) return;
    if (analysis.status !== "idle" && analysis.status !== "ready") return;
    setAutoRunPending(false);
    analysis.runSimple().catch(() => {});
  }, [autoRunPending, ready, analysis]);

  const hashValid = formTxHash.trim() !== "" && TX_HASH_RE.test(formTxHash.trim());
  const runDisabled = !formTxHash.trim() || isFetching || previewStatus !== "found";

  const busy =
    analysis.status === "extracting" ||
    analysis.status === "llm" ||
    analysis.status === "deep_dive";
  const statusLabel =
    analysis.status === "extracting" || analysis.status === "llm" || analysis.status === "deep_dive"
      ? STATUS_LABEL[analysis.status]
      : null;

  const analysisGridStyle: React.CSSProperties = {
    ...replayGridStyle,
    maxWidth: ready ? "900px" : "600px",
  };

  return (
    <div className="tx-analysis-panel" style={replayGridContainerStyle}>
      <div style={analysisGridStyle}>
        <div style={replayCardStyle}>
          <h3 style={replaySectionTitleStyle}>Analyze a Transaction</h3>
          <section style={replaySectionStyle}>
            <div className="relative flex items-center">
              <Input
                id="analysis-tx-hash"
                name="analysisTransactionHash"
                autoComplete="off"
                spellCheck={false}
                value={formTxHash}
                onChange={(event) => setFormTxHash(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !runDisabled) {
                    event.preventDefault();
                    handleFetchAndAnalyze();
                  }
                }}
                placeholder="0x0000…0000"
                disabled={isFetching}
                className={cn(
                  "h-12 pl-4 pr-[120px] font-mono text-sm tracking-tight transition-all duration-300",
                  "bg-transparent! border-slate-800/50 hover:border-slate-700/60 focus:ring-0 focus:border-white/50",
                  hashValid && "border-white/30 bg-white/[0.02]",
                )}
              />
              <div className="absolute right-1.5 flex items-center h-9 gap-1 px-1">
                <NetworkSelector
                  className="scale-90 opacity-90 hover:opacity-100 transition-opacity"
                  selectedNetwork={formNetwork}
                  onNetworkChange={setFormNetwork}
                  networks={EXTENDED_NETWORKS}
                  showTestnets={true}
                  size="sm"
                  variant="input"
                />
                <Button
                  type="button"
                  variant="icon-borderless"
                  size="icon-inline"
                  onClick={handleFetchAndAnalyze}
                  disabled={runDisabled}
                  className={cn(
                    "p-1.5 rounded-md transition-colors",
                    "text-primary hover:text-primary-foreground hover:bg-primary",
                    "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-primary",
                  )}
                  title="Fetch & Analyze"
                  aria-label="Fetch & Analyze"
                >
                  {isFetching ? (
                    <CircleNotch size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} weight="fill" />
                  )}
                </Button>
              </div>
            </div>
            {!ready ? (
              <p className="text-xs text-muted-foreground pl-1">
                Paste a transaction hash and we'll replay it, then summarize what it did. Or click{" "}
                <strong>Summarize</strong> on an existing simulation result.
              </p>
            ) : null}
            {isFetching ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <CircleNotch size={14} className="animate-spin text-primary" />
                <span>Replaying transaction on {formNetwork.name}…</span>
              </div>
            ) : null}
            {!isFetching && hashValid && previewStatus === "fetching" ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <CircleNotch size={14} className="animate-spin text-primary" />
                <span>Validating transaction on {formNetwork.name}…</span>
              </div>
            ) : null}
            {!isFetching && hashValid && previewStatus === "found" && previewTx ? (
              <p className="text-xs text-muted-foreground pl-1">
                Found in block {previewTx.blockNumber ?? "—"} · from {previewTx.from.slice(0, 6)}…{previewTx.from.slice(-4)}
                {previewTx.to ? ` · to ${previewTx.to.slice(0, 6)}…${previewTx.to.slice(-4)}` : ""}
              </p>
            ) : null}
            {!isFetching && hashValid && (previewStatus === "not_found" || previewStatus === "error") && previewError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {previewError}
              </p>
            ) : null}
            {formError ? (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </p>
            ) : null}
          </section>
        </div>

        {!ready ? null : (
        <div className="tx-analysis-panel__ready flex flex-col gap-4">
          <header className="tx-analysis-panel__toolbar flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => {
            analysis.runSimple().catch(() => {});
          }}
          disabled={busy}
          className="gap-2"
        >
          {busy ? (
            <CircleNotch size={14} className="animate-spin" />
          ) : (
            <Detective size={14} />
          )}
          {analysis.verdict ? "Re-analyze" : "Analyze"}
        </Button>
        {busy ? (
          <Button type="button" variant="outline" size="sm" onClick={analysis.cancel} className="gap-2">
            <StopCircle size={14} />
            Cancel
          </Button>
        ) : null}
        {analysis.verdict && analysis.verdict.deepDive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDeepOpen(true)}
            className="gap-2"
          >
            <MagnifyingGlass size={14} />
            Open Deep Dive
          </Button>
        ) : null}
        {analysis.verdict ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                download(
                  `verdict-${simulationId}.md`,
                  verdictToMarkdown(analysis.verdict!),
                  "text/markdown",
                )
              }
              className="gap-2"
            >
              <DownloadSimple size={14} />
              Markdown
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                download(
                  `verdict-${simulationId}.json`,
                  JSON.stringify(analysis.verdict, null, 2),
                  "application/json",
                )
              }
              className="gap-2"
            >
              <DownloadSimple size={14} />
              JSON
            </Button>
          </>
        ) : null}
      </header>

      {statusLabel ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <CircleNotch size={14} className="animate-spin text-primary" />
          <span>{statusLabel}</span>
        </div>
      ) : null}

      {analysis.verdict && analysis.packet ? (
        <SummaryCard
          verdict={analysis.verdict}
          packet={analysis.packet}
          txHash={txHash}
          chainName={(simulation as any)?.networkName ?? undefined}
          busy={busy}
          onDeepScan={() => setDeeperScanOpen(true)}
          onCopyHash={txHash ? () => void navigator.clipboard?.writeText(txHash) : undefined}
          error={analysis.error ? formatAnalysisError(analysis.error) : null}
        />
      ) : analysis.error ? (
        (() => {
          const friendly = formatAnalysisError(analysis.error);
          return (
            <p
              role="alert"
              className="tx-analysis-panel__error rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <strong>{friendly.title}</strong>
              {friendly.detail ? <span className="ml-1 opacity-90">{friendly.detail}</span> : null}
            </p>
          );
        })()
      ) : null}

      {/* Deeper-scan section: cleartext and private analysts side by side, gated
          behind explicit user opt-in (the SummaryCard's Deep Scan button) so the
          public LLM summary stays the always-on first read. */}
      {analysis.verdict && analysis.packet && deeperScanOpen ? (
        <section
          aria-labelledby="deeper-scan-heading"
          className="rounded-lg border border-slate-800/60 bg-slate-950/40 p-4 flex flex-col gap-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4
                id="deeper-scan-heading"
                className="text-sm font-semibold text-white"
              >
                Deeper scan
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Run cross-references against known hacks, or send the encrypted feature vector to Sepolia for an FHE verdict that downstream contracts can consume.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeeperScanOpen(false)}
              className="text-xs"
            >
              Hide
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Cleartext analog matcher */}
            <div className="rounded-md border border-slate-800/60 bg-black/30 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  Cleartext · LLM
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Matches the evidence packet against a corpus of known exploit patterns. Inputs leave your browser unencrypted.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { void hack.run(); }}
                  disabled={hackBusy}
                  className="gap-2 self-start"
                >
                  {hackBusy ? (
                    <CircleNotch size={14} className="animate-spin" />
                  ) : (
                    <Detective size={14} />
                  )}
                  {hack.analysis ? "Re-analyze as hack" : "Analyze as hack"}
                </Button>
                {hackBusy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={hack.cancel}
                    className="gap-2 text-xs"
                  >
                    <StopCircle size={14} />
                    Cancel
                  </Button>
                ) : null}
              </div>
              {hack.analysis ? (
                <HackAnalysisPanel analysis={hack.analysis} analogs={hack.analogs} />
              ) : null}
            </div>

            {/* Encrypted (FHE) classification on Sepolia */}
            <div className="rounded-md border border-purple-500/30 bg-purple-500/5 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-purple-300">
                  🔒 Encrypted · Sepolia FHE
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Encrypts a 12-bit feature vector in-browser, classifies on Sepolia under FHE, decrypts the verdict locally under your permit. The chain never sees the inputs.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => { void triage.run(); }}
                  disabled={!analysis.packet || triageBusy}
                  className="gap-2 self-start"
                >
                  {triageBusy ? <CircleNotch size={14} className="animate-spin" /> : null}
                  {triage.verdict ? "Re-run encrypted triage" : "Run encrypted triage"}
                </Button>
                {triageBusy ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={triage.cancel}
                    className="gap-2 text-xs"
                  >
                    <StopCircle size={14} />
                    Cancel
                  </Button>
                ) : null}
              </div>
              {triageBusy ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <CircleNotch size={14} className="animate-spin text-primary" />
                  <span>
                    {triage.status === "encrypting" && "Encrypting…"}
                    {triage.status === "writing" && "Writing to Sepolia…"}
                    {triage.status === "waiting-fhe" && "Waiting for CoFHE coprocessor… (~30s)"}
                    {triage.status === "decrypting" && "Decrypting verdict…"}
                  </span>
                </div>
              ) : null}
              {triage.status === "error" && triage.error ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
                >
                  {triage.error}
                </p>
              ) : null}
              {triage.status === "ready" && triage.verdict ? (
                <HackTriagePanel
                  verdict={triage.verdict}
                  txHash={triage.txHash}
                  handles={triage.handles}
                  contractAddress={triage.contractAddress}
                />
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {analysis.verdict ? (
        <DeepDiveDrawer
          open={deepOpen}
          onClose={() => setDeepOpen(false)}
          verdict={analysis.verdict}
        />
      ) : null}
        </div>
        )}
      </div>
    </div>
  );
};

export default TxAnalysisPanel;
