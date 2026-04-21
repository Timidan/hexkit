import { useCallback, useMemo, useRef, useState } from "react";
import { extractEvidence } from "../../utils/tx-analysis/extractor";
import { applyHeuristics } from "../../utils/tx-analysis/sieve";
import {
  runSimpleAnalysis,
  runComplexAnalysis,
  type LlmInvokeFn,
} from "../../utils/tx-analysis/llm";
import { parseAndNormalizeVerdict } from "../../utils/tx-analysis/normalizeVerdict";
import { runDeepDive } from "../../utils/tx-analysis/deepDive";
import { txAnalysisStore } from "../../services/TxAnalysisStore";
import type { EvidencePacket, Verdict } from "../../utils/tx-analysis/types";
import type { BridgeSimulationResponsePayload } from "../../utils/transaction-simulation/types";
import type { DeepDiveDependencies } from "../../utils/tx-analysis/deepDive";
import { useLlmInvocation } from "../../hooks/useLlmInvocation";
import { useLlmConfig } from "../../contexts/LlmConfigContext";

export interface UseTxAnalysisParams {
  simulationId: string;
  from: string;
  to: string;
  simulation: BridgeSimulationResponsePayload | null;
  txHash: string | null;
  deepDiveFetchers?: {
    fetchVerifiedSource: DeepDiveDependencies["fetchVerifiedSource"];
    fetchHeimdallDecompile?: DeepDiveDependencies["fetchHeimdallDecompile"];
  };
}

export type AnalysisStatus = "idle" | "extracting" | "llm" | "deep_dive" | "ready" | "error";

export function useTxAnalysis(params: UseTxAnalysisParams) {
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [packet, setPacket] = useState<EvidencePacket | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { invoke } = useLlmInvocation();
  const { config } = useLlmConfig();

  const invokeFn: LlmInvokeFn = useMemo(() => async ({ system, user, responseSchema, signal }) => {
    const provider = config.defaultProvider;
    const model = config.providers[provider]?.model ?? "gemini-2.5-pro";
    const res = await invoke({
      task: "tx-analysis",
      provider,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      responseFormat: "json",
      schema: responseSchema,
      signal,
      maxRetries: 1,
    });
    return res.parsed ?? res.text;
  }, [invoke, config.defaultProvider, config.providers]);

  const verdictInvokeFn: LlmInvokeFn = useMemo(() => async ({ system, user, signal }) => {
    const provider = config.defaultProvider;
    const model = config.providers[provider]?.model ?? "gemini-2.5-pro";
    // Skip schema validation inside useLlmInvocation; we normalize first then
    // let runSimpleAnalysis/runComplexAnalysis run verdictSchema.parse on the
    // normalized payload. This prevents schema_invalid errors on benign txs
    // where the model returns synonyms ("BENIGN", "SAFE") or a confidence in
    // 0-100 instead of 0-1.
    const res = await invoke({
      task: "tx-analysis",
      provider,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      responseFormat: "json",
      signal,
      maxRetries: 1,
    });
    const raw = res.parsed ?? res.text;
    return parseAndNormalizeVerdict(raw);
  }, [invoke, config.defaultProvider, config.providers]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const runSimple = useCallback(async () => {
    if (!params.simulation) throw new Error("No simulation attached to analysis");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStatus("extracting");
      setError(null);
      const raw = extractEvidence({
        simulationId: params.simulationId,
        from: params.from,
        to: params.to,
        simulation: params.simulation,
        txHash: params.txHash,
      });
      const sieved = applyHeuristics(raw);
      setPacket(sieved);
      setStatus("llm");
      const result = await runSimpleAnalysis({ packet: sieved, signal: controller.signal, invoke: verdictInvokeFn });
      setVerdict(result);
      setStatus("ready");
      const id = await txAnalysisStore.save({
        packet: sieved,
        verdict: result,
        depth: "simple",
        rawPromptHash: result.promptHash,
      });
      setRecordId(id);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === "AbortError" || controller.signal.aborted) {
        setStatus("idle");
        throw err;
      }
      setError(err);
      setStatus("error");
      throw err;
    }
  }, [params.simulation, params.simulationId, params.from, params.to, params.txHash, verdictInvokeFn]);

  const runComplex = useCallback(async () => {
    if (!packet) throw new Error("Run simple analysis first");
    if (!params.deepDiveFetchers) throw new Error("Deep-dive fetchers not configured");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setStatus("deep_dive");
      const ctx = await runDeepDive({
        packet,
        fetchVerifiedSource: params.deepDiveFetchers.fetchVerifiedSource,
        fetchHeimdallDecompile: params.deepDiveFetchers.fetchHeimdallDecompile,
      });
      setStatus("llm");
      const result = await runComplexAnalysis({
        packet,
        signal: controller.signal,
        deepDiveContext: ctx.sources,
        invoke: verdictInvokeFn,
      });
      setVerdict(result);
      setStatus("ready");
      const id = await txAnalysisStore.save({
        packet,
        verdict: result,
        depth: "complex",
        rawPromptHash: result.promptHash,
      });
      setRecordId(id);
      return result;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === "AbortError" || controller.signal.aborted) {
        setStatus("ready");
        throw err;
      }
      setError(err);
      setStatus("error");
      throw err;
    }
  }, [packet, params.deepDiveFetchers, verdictInvokeFn]);

  return { status, error, packet, verdict, recordId, runSimple, runComplex, cancel, invokeFn };
}
