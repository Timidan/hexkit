import { useEffect, useRef, useState } from "react";
import type { SimulationContractContext, DecodedTraceMeta } from "../contexts/SimulationContext";
import type { SimulationResult } from "../types/transaction";
import { decodeTrace, consumeRenderedTrace } from "../utils/traceDecoder";
import type { DecodedTraceRow } from "../utils/traceDecoder";
import { createLiteDecodedTrace, recomputeHierarchy } from "../services/TraceVaultService";
import {
  getCachedRawTraceText,
  clearCachedRawTraceText,
} from "../utils/traceRawTextCache";

type DecodedTrace = ReturnType<typeof decodeTrace>;

interface UseDecodedTraceParams {
  result: SimulationResult | null;
  id?: string;
  contextDecodedTraceRows?: DecodedTraceRow[] | null;
  contractContext?: SimulationContractContext | null;
  /** Trace metadata from OPFS - contains sourceLines, callMeta, rawEvents, etc. */
  traceMeta?: DecodedTraceMeta | null;
  onDecoded?: (decoded: DecodedTrace, simulationId: string) => void | Promise<void>;
  decodeMode?: "full" | "lite";
}

interface UseDecodedTraceResult {
  decodedTrace: DecodedTrace | null;
  isDecoding: boolean;
  error: string | null;
}

const MAX_DECODE_CACHE = 3;

const updateCache = (cache: Map<string, DecodedTrace>, key: string, value: DecodedTrace) => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > MAX_DECODE_CACHE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) {
      cache.delete(firstKey);
    }
  }
};

const parseJson = (rawText: string) => {
  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error("Failed to parse trace JSON");
  }
};

const normalizeRawTrace = (rawInput: any, fallbackRawText?: string) => {
  let raw = rawInput;
  let originalRawText: string | undefined;

  if (typeof raw === "string") {
    originalRawText = raw;
    raw = parseJson(raw);
  }

  if (raw && typeof raw === "object" && (raw as any).rawTrace) {
    const inner = (raw as any).rawTrace;
    if (typeof inner === "string") {
      originalRawText = inner;
      raw = parseJson(inner);
    } else {
      raw = inner;
    }
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid trace payload");
  }

  const normalized = { ...raw };
  if (originalRawText) {
    normalized.__rawText = originalRawText;
  } else if (typeof fallbackRawText === "string") {
    normalized.__rawText = fallbackRawText;
  }

  return normalized;
};

export const useDecodedTrace = ({
  result,
  id,
  contextDecodedTraceRows,
  contractContext,
  traceMeta,
  onDecoded,
  decodeMode = "full",
}: UseDecodedTraceParams): UseDecodedTraceResult => {
  const cacheRef = useRef<Map<string, DecodedTrace>>(new Map());
  const resultRef = useRef<SimulationResult | null>(null);
  const idRef = useRef<string | undefined>(undefined);
  const onDecodedRef = useRef<typeof onDecoded>(onDecoded);
  const decodeModeRef = useRef<typeof decodeMode>(decodeMode);
  const workerRef = useRef<Worker | null>(null);
  const pendingRequestRef = useRef<string | null>(null);
  const decodeTimeoutRef = useRef<number | null>(null);
  const pendingRawRef = useRef<unknown>(null);
  const [decodedTrace, setDecodedTrace] = useState<DecodedTrace | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  resultRef.current = result;
  idRef.current = id;
  onDecodedRef.current = onDecoded;
  decodeModeRef.current = decodeMode;

  useEffect(() => {
    if (typeof Worker === "undefined") return;

    const worker = new Worker(
      new URL("../workers/traceDecoderWorker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    const clearDecodeTimeout = () => {
      if (decodeTimeoutRef.current !== null) {
        window.clearTimeout(decodeTimeoutRef.current);
        decodeTimeoutRef.current = null;
      }
    };

    const handleMessage = (event: MessageEvent<{ id: string; decoded?: DecodedTrace; error?: string }>) => {
      if (pendingRequestRef.current !== event.data.id) {
        return;
      }
      clearDecodeTimeout();
      pendingRequestRef.current = null;
      if (pendingRawRef.current) {
        clearCachedRawTraceText(pendingRawRef.current);
        pendingRawRef.current = null;
      }
      if (event.data.error) {
        setError(event.data.error);
        setDecodedTrace(null);
        setIsDecoding(false);
        return;
      }
      if (event.data.decoded) {
        const currentSimId = (resultRef.current as any)?.simulationId || idRef.current;
        const mode = decodeModeRef.current || "full";
        if (onDecodedRef.current && currentSimId) {
          Promise.resolve(onDecodedRef.current(event.data.decoded, currentSimId)).catch((err) => {
            console.warn("[useDecodedTrace] Failed to persist decoded trace:", err);
          });
        }
        const finalDecoded =
          mode === "lite"
            ? (createLiteDecodedTrace(event.data.decoded as any) as DecodedTrace)
            : event.data.decoded;
        if (currentSimId) {
          updateCache(cacheRef.current, currentSimId, finalDecoded);
        }
        setDecodedTrace(finalDecoded);
      }
      setIsDecoding(false);
    };

    worker.addEventListener("message", handleMessage);

    return () => {
      clearDecodeTimeout();
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const currentSimId = (result as any)?.simulationId || id;
    setError(null);

    if (!currentSimId) {
      setDecodedTrace(null);
      setIsDecoding(false);
      return;
    }

    const raw = (result as any)?.rawTrace;
    const cached = cacheRef.current.get(currentSimId);
    if (cached) {
      clearCachedRawTraceText(raw);
      pendingRawRef.current = null;
      setDecodedTrace(cached);
      setIsDecoding(false);
      return;
    }
    // ── V3 FAST PATH — Rust EDB Rendered Trace ──────────────────────
    // When the Rust engine provides fully-decoded rows (schema version 3),
    // skip all TypeScript decode logic and use the pre-rendered output directly.
    const hasV3 = (result?.traceSchemaVersion ?? 0) >= 3 &&
      result?.renderedTrace &&
      Array.isArray(result.renderedTrace.rows) &&
      result.renderedTrace.rows.length > 0;

    if (hasV3) {
      // Cancel any pending worker request to prevent overwrite
      pendingRequestRef.current = null;
      if (decodeTimeoutRef.current !== null) {
        window.clearTimeout(decodeTimeoutRef.current);
        decodeTimeoutRef.current = null;
      }
      try {
        const consumed = consumeRenderedTrace(result!.renderedTrace!);
        const mode = decodeModeRef.current || "full";
        if (onDecodedRef.current) {
          Promise.resolve(onDecodedRef.current(consumed, currentSimId)).catch((err) => {
            console.warn("[useDecodedTrace] Failed to persist V3 decoded trace:", err);
          });
        }
        const finalDecoded =
          mode === "lite"
            ? (createLiteDecodedTrace(consumed as any) as DecodedTrace)
            : consumed;
        // Only clear raw cache after successful consume (preserve for fallback)
        clearCachedRawTraceText(raw);
        pendingRawRef.current = null;
        updateCache(cacheRef.current, currentSimId, finalDecoded);
        setDecodedTrace(finalDecoded);
        setIsDecoding(false);
        return;
      } catch (err) {
        console.warn("[useDecodedTrace] V3 consumeRenderedTrace failed, falling back to legacy:", err);
        // Fall through to legacy decode — raw cache still available for fallback.
        // NOTE: If bridge stripped heavy rawTrace fields for V3 (snapshots, sources, opcodeTrace),
        // legacy decode may produce degraded output since it depends on these fields.
        // This is acceptable: V3 failures should be exceedingly rare (schema mismatch only).
      }
    }
    // ── END V3 FAST PATH ────────────────────────────────────────────

    // V2 FAST PATH is disabled — the V2 lightweight enrichment (enrichV2Rows)
    // cannot produce equivalent quality to the legacy 3-phase decode.
    // Until Stage 2 (Rust EDB) produces fully-rich rows, we always
    // use the legacy decode when rawTrace is available.

    pendingRawRef.current = raw;
    const hasSnapshots =
      raw &&
      typeof raw === "object" &&
      (Array.isArray((raw as any)?.snapshots) ||
        Array.isArray((raw as any)?.trace) ||
        Array.isArray((raw as any)?.inner?.snapshots));
    const opcodeTraceCount =
      raw &&
      typeof raw === "object" &&
      Array.isArray((raw as any)?.opcodeTrace)
        ? (raw as any).opcodeTrace.length
        : 0;
    const hasOpcodeRows = (rows?: DecodedTraceRow[] | null) =>
      Array.isArray(rows) &&
      rows.some(
        (row) =>
          typeof row?.id === "number" &&
          row.id >= 0 &&
          ((row as any).name || (row as any).pc !== undefined)
      );
    const hasOpaqueTupleOutputs = (rows?: DecodedTraceRow[] | null) =>
      Array.isArray(rows) &&
      rows.some((row: any) =>
        Array.isArray(row?.entryMeta?.outputs) &&
        row.entryMeta.outputs.some((output: any) => {
          const outputType = String(output?.type || "");
          if (!outputType.startsWith("tuple")) return false;
          return !Array.isArray(output?.components) || output.components.length === 0;
        })
      );
    const shouldPreferDecodeFromOpcodeTrace =
      !hasSnapshots &&
      opcodeTraceCount > 0 &&
      (!contextDecodedTraceRows ||
        contextDecodedTraceRows.length === 0 ||
        !hasOpcodeRows(contextDecodedTraceRows));
    const shouldUpgradeTupleMetadata =
      !hasSnapshots &&
      !!raw &&
      hasOpaqueTupleOutputs(contextDecodedTraceRows);

    if (
      !hasSnapshots &&
      contextDecodedTraceRows &&
      contextDecodedTraceRows.length > 0 &&
      !shouldPreferDecodeFromOpcodeTrace &&
      !shouldUpgradeTupleMetadata
    ) {
      // Recompute hierarchy from depth relationships to fix traces where
      // hasChildren wasn't computed correctly for nested call frames
      const fixedRows = recomputeHierarchy(contextDecodedTraceRows);
      clearCachedRawTraceText(raw);
      pendingRawRef.current = null;
      // Cancel any pending worker request to prevent it from overwriting
      // the good trace with a stripped version when it completes later
      pendingRequestRef.current = null;
      if (decodeTimeoutRef.current !== null) {
        window.clearTimeout(decodeTimeoutRef.current);
        decodeTimeoutRef.current = null;
      }
      // Use traceMeta from OPFS to preserve internal calls, events, source mappings
      const fromHistory = {
        rows: fixedRows,
        sourceLines: traceMeta?.sourceLines ?? [],
        sourceTexts: contractContext?.sourceTexts || {},
        rawEvents: traceMeta?.rawEvents ?? [],
        callMeta: traceMeta?.callMeta,
        implementationToProxy: traceMeta?.implementationToProxy ?? new Map<string, string>(),
      };
      updateCache(cacheRef.current, currentSimId, fromHistory);
      setDecodedTrace(fromHistory);
      setIsDecoding(false);
      return;
    }

    if (!raw) {
      clearCachedRawTraceText(raw);
      pendingRawRef.current = null;
      setDecodedTrace(null);
      setIsDecoding(false);
      return;
    }

    const fallbackRawText =
      typeof (result as any)?.rawTrace === "string" ? (result as any).rawTrace : undefined;
    const cachedRawText = getCachedRawTraceText(raw);

    const decodeOnMain = () => {
      setIsDecoding(true);
      setDecodedTrace(null);
      try {
        const normalized = normalizeRawTrace(
          raw,
          cachedRawText || fallbackRawText
        );
        const decoded = decodeTrace(normalized);
        const mode = decodeModeRef.current || "full";
        if (onDecodedRef.current) {
          Promise.resolve(onDecodedRef.current(decoded, currentSimId)).catch((err) => {
            console.warn("[useDecodedTrace] Failed to persist decoded trace:", err);
          });
        }
        const finalDecoded =
          mode === "lite"
            ? (createLiteDecodedTrace(decoded as any) as DecodedTrace)
            : decoded;
        updateCache(cacheRef.current, currentSimId, finalDecoded);
        setDecodedTrace(finalDecoded);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to decode trace";
        setError(message);
        setDecodedTrace(null);
      } finally {
        if (pendingRawRef.current) {
          clearCachedRawTraceText(pendingRawRef.current);
          pendingRawRef.current = null;
        }
        setIsDecoding(false);
      }
    };

    if (workerRef.current) {
      const requestId = `${currentSimId}-${crypto.randomUUID()}`;
      pendingRequestRef.current = requestId;
      setDecodedTrace(null);
      setIsDecoding(true);

      if (decodeTimeoutRef.current !== null) {
        window.clearTimeout(decodeTimeoutRef.current);
      }
      decodeTimeoutRef.current = window.setTimeout(() => {
        if (pendingRequestRef.current !== requestId) return;
        pendingRequestRef.current = null;
        decodeTimeoutRef.current = null;
        workerRef.current?.terminate();
        workerRef.current = null;
        decodeOnMain();
        try {
          workerRef.current = new Worker(
            new URL("../workers/traceDecoderWorker.ts", import.meta.url),
            { type: "module" }
          );
        } catch {}
      }, 15000);

      workerRef.current.postMessage({
        id: requestId,
        raw,
        rawText: cachedRawText || fallbackRawText,
      });
      return;
    }

    decodeOnMain();
  }, [result, id, contextDecodedTraceRows, contractContext?.sourceTexts, traceMeta]);

  return { decodedTrace, isDecoding, error };
};
