import { useCallback, useEffect, useRef, useState } from "react";
import { classify, type ClassifierLabel } from "../../utils/hack-analysis/classifier";
import { retrieveAnalogs } from "../../utils/hack-analysis/retrieval";
import { loadIncidents } from "../../utils/hack-analysis/incidents";
import { runHackAnalysis } from "../../utils/hack-analysis/llm";
import type { EvidencePacket } from "../../utils/tx-analysis/types";
import type { HackAnalysis, Incident } from "../../utils/hack-analysis/types";
import type { LlmInvokeFn } from "../../utils/tx-analysis/llm";

export type HackStatus = "idle" | "classifying" | "retrieving" | "llm" | "ready" | "error";

export interface UseHackAnalysisParams {
  packet: EvidencePacket | null;
  invoke: LlmInvokeFn;
}

export function useHackAnalysis(params: UseHackAnalysisParams) {
  const [status, setStatus] = useState<HackStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [labels, setLabels] = useState<ClassifierLabel[]>([]);
  const [analogs, setAnalogs] = useState<Incident[]>([]);
  const [analysis, setAnalysis] = useState<HackAnalysis | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setError(null);
    setLabels([]);
    setAnalogs([]);
    setAnalysis(null);
  }, [params.packet]);

  const run = useCallback(async () => {
    if (!params.packet) throw new Error("No evidence packet");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setError(null);
      setStatus("classifying");
      const l = classify(params.packet);
      setLabels(l);
      setStatus("retrieving");
      const chainHint = params.packet.chainId === 1 ? "ethereum" : String(params.packet.chainId);
      const a = retrieveAnalogs({ labels: l, corpus: loadIncidents(), chainHint, k: 3 });
      setAnalogs(a);
      setStatus("llm");
      const result = await runHackAnalysis({
        packet: params.packet,
        labels: l,
        analogs: a,
        invoke: params.invoke,
        signal: controller.signal,
      });
      setAnalysis(result);
      setStatus("ready");
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
  }, [params.packet, params.invoke]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  return { status, error, labels, analogs, analysis, run, cancel };
}
