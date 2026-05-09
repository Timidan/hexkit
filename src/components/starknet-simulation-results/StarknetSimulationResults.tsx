// Top-level Starknet simulation result view.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, CaretDown, Square } from "@phosphor-icons/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import UniversalSearchBar from "@/components/UniversalSearchBar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  contractExplorerLinks,
  networkLabel,
} from "@/components/starknet/explorerLinks";
import type {
  AbiTypeDef,
  FunctionFrame,
  FunctionInvocation,
  SimulateResponse,
  SimulationResult,
  TraceStep,
} from "@/chains/starknet/simulatorTypes";
import type { StarknetNetwork } from "@/config/networkConfig";
import { getStarknetDebugReady } from "@/chains/starknet/debug/starknetDebugTypes";
import { resolveBridgeError } from "@/chains/starknet/simulatorErrorCopy";
import "@/styles/SimulationResultsPage.css";
import "@/components/debug/DebugWindow.css";
import "./StarknetSimulationResults.css";
import { classExplorerVoyager } from "./CallTreeTab";
import { ResourcesTab } from "./ResourcesTab";
import { MessagesTab } from "./MessagesTab";
import { DebuggerPane } from "./DebuggerPane";
import { SummaryPanel } from "./SummaryPanel";
import { ContractAddress } from "./ContractAddress";
import { ResultsHeader } from "@/components/simulation-results/ResultsHeader";
import { TransactionSummary } from "@/components/simulation-results/TransactionSummary";
import { StateTab } from "@/components/simulation-results/StateTab";
import { ContractsTab as EdbContractsTab } from "@/components/simulation-results/ContractsTab";
import { EventsTab as EdbEventsTab } from "@/components/simulation-results/EventsTab";
import {
  adaptStarknetEventsForEdb,
  type EvmShapeEvent,
} from "./starknetEventsAdapter";
import type { JsonTree } from "./buildFrameDetailJson";
import { adaptStarknetStateForEdb } from "./starknetStateAdapter";
import {
  adaptStarknetClasses,
  buildEdbContractsResult,
} from "./starknetClassesAdapter";
import { useLocation, useNavigate } from "react-router-dom";
import ExecutionStackTrace from "@/components/ExecutionStackTrace";
import type { TraceFilters } from "@/components/execution-trace";
import { adaptStarknetForEvmTrace } from "./starknetTraceAdapter";
import {
  fetchCairoSource,
  type CairoSourceResponse,
} from "@/chains/starknet/cairoSourceClient";
import {
  findStatementLocation,
  sourceMapStatementCountMatches,
  useSierraSourceMap,
  type SourceMapResponse,
} from "@/chains/starknet/sierraSourceMapClient";
import {
  useSierraDebug,
  type SierraDebugInfo,
} from "@/chains/starknet/sierraDebugClient";
import { fetchContractName } from "@/chains/starknet/contractNameClient";
import {
  resolveCairoSourceTarget,
  chainIdToStarknetNetwork,
} from "./CallTreeTab";
import { StarknetArgDetailModal } from "./StarknetFrameDetailModal";
import { buildAllArgsForFrame } from "./buildFrameDetailJson";
import { CopyButton } from "@/components/ui/copy-button";
import type { DebugPrepState } from "@/types/debug";
import {
  buildAddressLabels,
  collectL2ToL1Messages,
  contractLabel,
  formatFriAmount,
  selectorName,
  shortHex,
  walkInvocations,
} from "./decoders";
import { useStarknetTokenPriceRegistry } from "@/lib/starknet-token-prices";
import {
  Stepper,
  StepperIndicator,
  StepperItem,
  StepperNav,
  StepperSeparator,
  StepperTitle,
  StepperTrigger,
} from "@/components/reui/stepper";

export type TabKey =
  | "summary"
  | "contracts"
  | "events"
  | "state"
  | "messages"
  | "resources";

const PRIMARY_TABS: { value: TabKey; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "contracts", label: "Classes" },
  { value: "events", label: "Events" },
  { value: "state", label: "State" },
];

const SECONDARY_TABS_BASE: { value: TabKey; label: string }[] = [
  { value: "resources", label: "Resources" },
];

interface SierraBridgeClassLookup {
  sourceMap: SourceMapResponse | null;
  sourceMapLoading: boolean;
  sourceMapError: string | null;
  debug: SierraDebugInfo | null;
  debugLoading: boolean;
  debugError: string | null;
}

type CairoFrameSourceKind =
  | "revert-observation"
  | "frame-entry"
  | "regex-fallback";

interface CairoFrameSourceTarget {
  file: string;
  line: number;
  kind: CairoFrameSourceKind;
}

interface CairoFunctionRange {
  file: string;
  lineStart: number;
  lineEnd: number;
}

function normalizedClassHash(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
}

function sierraBridgeLookupKey(
  classHash: string,
  network: StarknetNetwork,
): string {
  return `${network}:${classHash}`;
}

function cairoSourceLookupKey(
  classHash: string,
  network: StarknetNetwork,
): string {
  return `${network}:${classHash}`;
}

function pcToStatement(
  table: ReadonlyArray<{ pc: number; statementIdx: number }>,
  pc: number,
): number | null {
  if (table.length === 0) return null;
  let lo = 0;
  let hi = table.length - 1;
  let best: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const midPc = table[mid].pc;
    if (midPc <= pc) {
      best = table[mid].statementIdx;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function bridgeLookupPending(
  lookup: SierraBridgeClassLookup | undefined,
): boolean {
  if (!lookup) return true;
  return lookup.sourceMapLoading || lookup.debugLoading;
}

function resolveBridgeCairoLocation(
  lookup: SierraBridgeClassLookup | undefined,
  pc: number | null | undefined,
): { file: string; line: number } | null {
  if (typeof pc !== "number" || !Number.isFinite(pc)) return null;
  const sourceMap = lookup?.sourceMap;
  const debug = lookup?.debug;
  if (
    !sourceMapStatementCountMatches(sourceMap, debug?.sierra?.statementCount)
  ) {
    return null;
  }
  if (sourceMap.mappedStatementCount === 0) return null;
  if (!debug || debug.pcToStatement.length === 0) return null;

  const statementIdx = pcToStatement(debug.pcToStatement, pc);
  if (statementIdx === null) return null;
  const location = findStatementLocation(
    sourceMap.statementToSource,
    statementIdx,
  );
  if (!location || location.lineStart <= 0) return null;
  return { file: location.file, line: location.lineStart };
}

function resolveBridgeCairoLocationMatchingLine(
  lookup: SierraBridgeClassLookup | undefined,
  steps: ReadonlyArray<TraceStep> | undefined,
  line: number | null | undefined,
  file?: string | null,
): { file: string; line: number } | null {
  if (!steps || steps.length === 0) return null;
  if (typeof line !== "number" || !Number.isFinite(line) || line <= 0) {
    return null;
  }
  for (const step of steps) {
    const location = resolveBridgeCairoLocation(lookup, step.pc);
    if (location?.line === line && (!file || location.file === file)) {
      return location;
    }
  }
  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCairoFunctionRangeInFile(
  src: CairoSourceResponse,
  filePath: string,
  fnName: string | null | undefined,
): CairoFunctionRange | null {
  const shortName = fnName?.split("::").pop()?.trim();
  if (!shortName) return null;
  const file = src.files.find((f) => f.path === filePath);
  if (!file) return null;

  const lines = file.content.split("\n");
  const fnRegex = new RegExp(`\\b(?:fn|func)\\s+${escapeRegex(shortName)}\\b`);
  const startIdx = lines.findIndex((line) => fnRegex.test(line));
  if (startIdx < 0) return null;

  let braceDepth = 0;
  let started = false;
  for (let i = startIdx; i < lines.length; i += 1) {
    for (const c of lines[i]) {
      if (c === "{") {
        braceDepth += 1;
        started = true;
      } else if (c === "}") {
        braceDepth -= 1;
        if (started && braceDepth <= 0) {
          return {
            file: file.path,
            lineStart: startIdx + 1,
            lineEnd: i + 1,
          };
        }
      }
    }
  }

  return {
    file: file.path,
    lineStart: startIdx + 1,
    lineEnd: startIdx + 1,
  };
}

function resolveBridgeCairoLocationInFunction(
  lookup: SierraBridgeClassLookup | undefined,
  steps: ReadonlyArray<TraceStep> | undefined,
  src: CairoSourceResponse | undefined,
  fnName: string | null | undefined,
): { file: string; line: number } | null {
  if (!steps || steps.length === 0 || !src?.verified) return null;
  const rangeCache = new Map<string, CairoFunctionRange | null>();
  for (const step of steps) {
    const location = resolveBridgeCairoLocation(lookup, step.pc);
    if (!location) continue;
    const key = `${location.file}:${fnName ?? ""}`;
    let range = rangeCache.get(key);
    if (!rangeCache.has(key)) {
      range = findCairoFunctionRangeInFile(src, location.file, fnName);
      rangeCache.set(key, range ?? null);
    }
    if (
      range &&
      location.line >= range.lineStart &&
      location.line <= range.lineEnd
    ) {
      return location;
    }
  }
  return null;
}

function selectEntryFunctionFrame(
  current: FunctionFrame | undefined,
  candidate: FunctionFrame,
): FunctionFrame {
  if (!current) return candidate;
  if (candidate.parentFrameId === null && current.parentFrameId !== null) {
    return candidate;
  }
  if (candidate.parentFrameId !== null && current.parentFrameId === null) {
    return current;
  }
  return candidate.stepIndexStart < current.stepIndexStart
    ? candidate
    : current;
}

function frameRevertReason(frame: FunctionInvocation): string | null {
  const reason = frame.revertReason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason : null;
}

function hasDirectRevertedDescendant(
  frame: FunctionInvocation,
  directlyReverted: Set<FunctionInvocation>,
): boolean {
  const stack = [...(frame.calls || [])];
  while (stack.length) {
    const cur = stack.pop()!;
    if (directlyReverted.has(cur)) return true;
    for (const child of cur.calls || []) stack.push(child);
  }
  return false;
}

function addRevertPath(
  leaf: FunctionInvocation,
  parentMap: Map<FunctionInvocation, FunctionInvocation | null>,
  out: Set<FunctionInvocation>,
): void {
  let cursor: FunctionInvocation | null | undefined = leaf;
  while (cursor) {
    out.add(cursor);
    cursor = parentMap.get(cursor) ?? null;
  }
}

function buildRevertedFrameSet(
  result: SimulationResult,
  frames: FunctionInvocation[],
  parentMap: Map<FunctionInvocation, FunctionInvocation | null>,
  frameCallIds: Map<FunctionInvocation, number>,
): Set<FunctionInvocation> {
  const out = new Set<FunctionInvocation>();
  const directlyReverted = new Set(
    frames.filter((frame) => frameRevertReason(frame) !== null),
  );
  for (const frame of directlyReverted) out.add(frame);

  if (!result.revertReason) return out;

  const revertedLeaves = [...directlyReverted].filter(
    (frame) => !hasDirectRevertedDescendant(frame, directlyReverted),
  );

  if (revertedLeaves.length > 0) {
    for (const leaf of revertedLeaves) addRevertPath(leaf, parentMap, out);
    return out;
  }

  const txLevelFallback =
    result.executeInvocation ??
    result.validateInvocation ??
    result.feeTransferInvocation;
  if (txLevelFallback) {
    addRevertPath(txLevelFallback, parentMap, out);
    return out;
  }

  const lastStep = result.traceSteps?.[result.traceSteps.length - 1];
  if (!lastStep) return out;
  for (const [frame, callId] of frameCallIds) {
    if (callId === lastStep.callId) {
      addRevertPath(frame, parentMap, out);
      break;
    }
  }
  return out;
}

function collectInvocationsPostorder(
  result: SimulationResult,
): FunctionInvocation[] {
  const out: FunctionInvocation[] = [];
  const visit = (frame: FunctionInvocation) => {
    for (const child of frame.calls || []) visit(child);
    out.push(frame);
  };
  for (const top of [
    result.validateInvocation,
    result.executeInvocation,
    result.feeTransferInvocation,
  ]) {
    if (top) visit(top);
  }
  return out;
}

function sameSierraBridgeLookup(
  a: SierraBridgeClassLookup | undefined,
  b: SierraBridgeClassLookup,
): boolean {
  return (
    a?.sourceMap === b.sourceMap &&
    a?.sourceMapLoading === b.sourceMapLoading &&
    a?.sourceMapError === b.sourceMapError &&
    a?.debug === b.debug &&
    a?.debugLoading === b.debugLoading &&
    a?.debugError === b.debugError
  );
}

export interface StarknetSimulationResultsProps {
  response: SimulateResponse;
  resultIndex?: number;
  onExplainTransaction?: (result: SimulationResult) => void;
  onExplainFrame?: (frame: FunctionInvocation) => void;
  onResimulate?: () => void | Promise<void>;
  isResimulating?: boolean;
  source?: string;
  txHash?: string;
  chainId?: string | null;
  bridgeGitSha?: string | null;
  stateReplayPending?: boolean;
  stateReplayError?: Error | null;
}

export function StarknetSimulationResults({
  response,
  resultIndex = 0,
  ...rest
}: StarknetSimulationResultsProps) {
  const result = response.results?.[resultIndex];
  if (!result) {
    return (
      <Card className="p-6 text-muted-foreground">
        No simulation result at index {resultIndex}.
      </Card>
    );
  }
  return (
    <StarknetSimulationResultsBody
      response={response}
      resultIndex={resultIndex}
      result={result}
      {...rest}
    />
  );
}

function SierraBridgeClassLoader({
  classHash,
  network,
  onUpdate,
}: {
  classHash: string;
  network: StarknetNetwork;
  onUpdate: (key: string, value: SierraBridgeClassLookup) => void;
}) {
  const sourceMap = useSierraSourceMap(classHash, network);
  const debug = useSierraDebug(classHash, network);

  useEffect(() => {
    onUpdate(sierraBridgeLookupKey(classHash, network), {
      sourceMap: sourceMap.data,
      sourceMapLoading: sourceMap.loading,
      sourceMapError: sourceMap.error,
      debug: debug.data,
      debugLoading: debug.loading,
      debugError: debug.error,
    });
  }, [
    classHash,
    debug.data,
    debug.error,
    debug.loading,
    network,
    onUpdate,
    sourceMap.data,
    sourceMap.error,
    sourceMap.loading,
  ]);

  return null;
}

function StarknetSimulationResultsBody({
  response,
  result,
  onExplainTransaction: _onExplainTransaction,
  onExplainFrame: _onExplainFrame,
  onResimulate,
  isResimulating,
  txHash,
  chainId,
  stateReplayPending,
  stateReplayError,
}: StarknetSimulationResultsProps & { result: SimulationResult }) {
  useStarknetTokenPriceRegistry();
  const resolvedChainId =
    chainId ?? response.chainId ?? response.blockContext.chainId ?? null;
  const [tab, setTab] = useState<TabKey>(loadStoredTab);
  const l2ToL1MessageCount = useMemo(
    () => collectL2ToL1Messages(result).length,
    [result],
  );
  const secondaryTabs = useMemo(() => {
    const tabs = [...SECONDARY_TABS_BASE];
    if (l2ToL1MessageCount > 0) {
      tabs.unshift({ value: "messages", label: "Messages" });
    }
    return tabs;
  }, [l2ToL1MessageCount]);
  const [isDebugging, setIsDebugging] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const visibleTabs = new Set([
      ...PRIMARY_TABS.map((t) => t.value),
      ...secondaryTabs.map((t) => t.value),
    ]);
    if (!visibleTabs.has(tab)) setTab("summary");
  }, [secondaryTabs, tab]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(RESULT_TAB_KEY, tab);
    } catch {
      /* storage unavailable */
    }
  }, [tab]);
  const [selectedFrame, setSelectedFrame] = useState<FunctionInvocation | null>(
    null,
  );
  const openDebugger = useCallback(() => {
    setIsDebugging(true);
    const params = new URLSearchParams(location.search);
    params.set("debug", "1");
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);
  const closeDebugger = useCallback(() => {
    setIsDebugging(false);
    const params = new URLSearchParams(location.search);
    params.delete("debug");
    const search = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: search ? `?${search}` : "",
        hash: location.hash,
      },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  const frames = useMemo(
    () => (result ? Array.from(walkInvocations(result)) : []),
    [result],
  );

  const addressLabels = useMemo(
    () => (result ? buildAddressLabels(result) : {}),
    [result],
  );

  const parentMap = useMemo(() => {
    const map = new Map<FunctionInvocation, FunctionInvocation | null>();
    if (!result) return map;
    const tops = [
      result.validateInvocation,
      result.executeInvocation,
      result.feeTransferInvocation,
    ].filter((f): f is FunctionInvocation => Boolean(f));
    for (const top of tops) {
      map.set(top, null);
      const stack: FunctionInvocation[] = [top];
      while (stack.length) {
        const cur = stack.pop()!;
        for (const child of cur.calls || []) {
          map.set(child, cur);
          stack.push(child);
        }
      }
    }
    return map;
  }, [result]);

  const frameCallIds = useMemo(() => {
    const map = new Map<FunctionInvocation, number>();
    const usedCallIds = new Set<number>();
    for (const frame of frames) {
      const explicit = frame.traceCallId;
      if (
        typeof explicit === "number" &&
        Number.isInteger(explicit) &&
        explicit >= 0
      ) {
        map.set(frame, explicit);
        usedCallIds.add(explicit);
      }
    }

    const rootFrames = (result.functionFrames || [])
      .filter((f) => f.parentFrameId === null)
      .sort((a, b) => a.stepIndexStart - b.stepIndexStart);
    if (rootFrames.length === 0) {
      frames.forEach((frame, idx) => {
        if (!map.has(frame)) map.set(frame, idx);
      });
      return map;
    }
    const availableRoots = rootFrames.filter((f) => !usedCallIds.has(f.callId));
    let rootIdx = 0;
    for (const frame of collectInvocationsPostorder(result)) {
      if (map.has(frame)) continue;
      const root = availableRoots[rootIdx];
      rootIdx += 1;
      if (root) {
        map.set(frame, root.callId);
      }
    }
    return map;
  }, [frames, result]);

  const entryFunctionFrameByCallId = useMemo(() => {
    const map = new Map<number, FunctionFrame>();
    for (const frame of result.functionFrames || []) {
      map.set(
        frame.callId,
        selectEntryFunctionFrame(map.get(frame.callId), frame),
      );
    }
    return map;
  }, [result.functionFrames]);

  const traceStepsByCallId = useMemo(() => {
    const map = new Map<number, TraceStep[]>();
    for (const step of result.traceSteps || []) {
      const steps = map.get(step.callId);
      if (steps) {
        steps.push(step);
      } else {
        map.set(step.callId, [step]);
      }
    }
    return map;
  }, [result.traceSteps]);

  const lastTraceStepByCallId = useMemo(() => {
    const map = new Map<number, TraceStep>();
    for (const [callId, steps] of traceStepsByCallId) {
      const last = steps[steps.length - 1];
      if (last) map.set(callId, last);
    }
    return map;
  }, [traceStepsByCallId]);

  const revertedFrames = useMemo(
    () => buildRevertedFrameSet(result, frames, parentMap, frameCallIds),
    [result, frames, parentMap, frameCallIds],
  );

  useEffect(() => {
    if (!result || selectedFrame) return;
    const candidate =
      frames.find((f) => (f.events || []).length > 0) ||
      result.executeInvocation;
    if (candidate) setSelectedFrame(candidate);
  }, [result, frames, selectedFrame]);

  const stateDiffMissing =
    !result?.stateDiff ||
    ((result.stateDiff.storageDiffs?.length ?? 0) === 0 &&
      (result.stateDiff.nonceUpdates?.length ?? 0) === 0 &&
      (result.stateDiff.classHashUpdates?.length ?? 0) === 0);

  useEffect(() => {
    const sync = () => {
      const m = window.location.hash.match(/frame=(\d+)/);
      if (!m) return;
      const idx = parseInt(m[1], 10);
      if (frames[idx]) setSelectedFrame(frames[idx]);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [frames]);

  const setSelectedFrameWithHash = useCallback(
    (f: FunctionInvocation | null) => {
      setSelectedFrame(f);
      if (f) {
        const idx = frames.indexOf(f);
        if (idx >= 0) {
          const url = new URL(window.location.href);
          url.hash = `frame=${idx}`;
          window.history.replaceState(null, "", url.toString());
        }
      }
    },
    [frames],
  );

  useEffect(() => {
    if (isDebugging) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = selectedFrame ? frames.indexOf(selectedFrame) : 0;
      const wrap = (i: number) =>
        ((i % frames.length) + frames.length) % frames.length;
      if (e.key === "b" || e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        if (frames[wrap(idx - 1)])
          setSelectedFrameWithHash(frames[wrap(idx - 1)]);
      } else if (e.key === " " || e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        if (frames[wrap(idx + 1)])
          setSelectedFrameWithHash(frames[wrap(idx + 1)]);
      } else if (e.key === "n" && selectedFrame?.calls?.[0]) {
        e.preventDefault();
        setSelectedFrameWithHash(selectedFrame.calls[0]);
      } else if (e.key === "o" && selectedFrame) {
        e.preventDefault();
        const me = selectedFrame;
        const parent = frames.find((c) => (c.calls || []).includes(me));
        if (parent) setSelectedFrameWithHash(parent);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [frames, isDebugging, selectedFrame, setSelectedFrameWithHash]);

  const sender = (result.executeInvocation || result.validateInvocation)
    ?.contractAddress;
  const userIntentTarget = useMemo(() => {
    const exec = result.executeInvocation;
    if (!exec) return null;
    const inner = exec.calls?.[0];
    return inner?.contractAddress || exec.contractAddress || null;
  }, [result]);
  const userIntentSelector = useMemo(() => {
    const exec = result.executeInvocation;
    if (!exec) return null;
    const inner = exec.calls?.[0];
    return inner
      ? selectorName(inner) || shortHex(inner.entryPointSelector, 8, 6)
      : null;
  }, [result]);
  const senderLabel = sender ? contractLabel(sender) : null;
  const targetLabel = userIntentTarget ? contractLabel(userIntentTarget) : null;

  const isMetaTx = useMemo(() => {
    return frames.some((f) => {
      const sel = selectorName(f);
      return (
        sel === "execute_from_outside_v2" ||
        sel === "execute_from_outside" ||
        sel === "execute_sponsored"
      );
    });
  }, [frames]);
  const sponsorAddress = useMemo(() => {
    if (!isMetaTx) return null;
    for (const f of frames) {
      const sel = selectorName(f);
      if (
        sel === "execute_from_outside_v2" ||
        sel === "execute_from_outside" ||
        sel === "execute_sponsored"
      ) {
        return f.callerAddress || null;
      }
    }
    return null;
  }, [isMetaTx, frames]);

  const statusOk = result.status === "SUCCEEDED";
  const statusReverted = result.status === "REVERTED";
  const statusColor = statusOk
    ? "var(--sim-success, #22c55e)"
    : statusReverted
      ? "#fbbf24"
      : "var(--sim-error, #ef4444)";
  const statusLabel = statusOk
    ? "Success"
    : statusReverted
      ? "Reverted"
      : "Failed";
  const statusIconGlyph = statusOk ? "✓" : statusReverted ? "⚠" : "✗";

  const summaryAdapter = useMemo(() => {
    const senderAddrFinal = sender || "—";
    const targetAddrFinal = userIntentTarget || "—";
    const knownLabels = new Map<string, string>();
    if (senderAddrFinal !== "—" && senderLabel) {
      knownLabels.set(senderAddrFinal.toLowerCase(), senderLabel);
    }
    if (targetAddrFinal !== "—" && targetLabel) {
      knownLabels.set(targetAddrFinal.toLowerCase(), targetLabel);
    }
    const formatAddressWithName = (address: string) => {
      const lbl =
        knownLabels.get(address.toLowerCase()) || contractLabel(address);
      return {
        display: lbl ? `${lbl} (${shortHex(address, 6, 4)})` : address,
        hasName: Boolean(lbl),
      };
    };
    const normalizeValue = (v: string | undefined | null): string | null => {
      if (!v) return null;
      const lower = v.trim().toLowerCase();
      return lower.startsWith("0x") ? lower : null;
    };
    const fee = result.feeEstimate;
    const formatGas = (v: unknown): string => {
      if (v === null || v === undefined) return "—";
      try {
        const big = typeof v === "string" ? BigInt(v) : BigInt(v as number);
        if (big === 0n) return "0";
        return big.toLocaleString("en-US");
      } catch {
        return "—";
      }
    };
    const l1GasValue = formatGas(fee.l1GasConsumed);
    const l1DataGasValue = formatGas(fee.l1DataGasConsumed);
    const traceStepCount = result.traceSteps?.length ?? 0;
    const stepsValue =
      result.executionResources.steps && result.executionResources.steps > 0
        ? result.executionResources.steps.toLocaleString()
        : traceStepCount > 0
          ? traceStepCount.toLocaleString()
          : "—";
    return {
      hash: txHash || `speculative · ${response.simId}`,
      network: networkLabel(resolvedChainId),
      blockNumber: response.blockContext.blockNumber.toLocaleString(),
      result: { timestamp: response.blockContext.timestamp },
      from: senderAddrFinal,
      to: targetAddrFinal,
      functionName: userIntentSelector || "—",
      value: "—",
      txFee: formatFriAmount(
        response.txReceipt?.actual_fee?.amount ?? result.feeEstimate.overallFee,
      ),
      gasUsed: result.executionResources.l2Gas.toLocaleString(),
      gasLimit: "—",
      gasPrice: "—",
      gasPriceLabel: "L1 Gas",
      gasPriceRaw: l1GasValue,
      txType: isMetaTx ? "INVOKE v3 · META-TX" : "INVOKE v3",
      nonce: (response.txBody as { nonce?: string } | undefined)?.nonce ?? "—",
      l1DataGasValue,
      stepsValue,
      formatAddressWithName,
      normalizeValue,
    };
  }, [
    isMetaTx,
    response,
    result,
    resolvedChainId,
    sender,
    senderLabel,
    targetLabel,
    txHash,
    userIntentSelector,
    userIntentTarget,
  ]);

  const [highlightedValue, setHighlightedValue] = useState<string | null>(null);

  const [selectedFrameDetail, setSelectedFrameDetail] = useState<{
    title: string;
    value: string;
  } | null>(null);

  const [showProtocolFrames, setShowProtocolFrames] = useState(false);

  const [cairoSourceMap, setCairoSourceMap] = useState<
    Map<string, CairoSourceResponse>
  >(new Map());
  const network = useMemo(
    () => chainIdToStarknetNetwork(resolvedChainId),
    [resolvedChainId],
  );
  const traceClassHashes = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const frame of frames) {
      const classHash = normalizedClassHash(frame.classHash);
      if (!classHash || seen.has(classHash)) continue;
      seen.add(classHash);
      out.push(classHash);
    }
    return out;
  }, [frames]);
  const [sierraBridgeMap, setSierraBridgeMap] = useState<
    Map<string, SierraBridgeClassLookup>
  >(new Map());
  const handleSierraBridgeUpdate = useCallback(
    (key: string, value: SierraBridgeClassLookup) => {
      setSierraBridgeMap((prev) => {
        if (sameSierraBridgeLookup(prev.get(key), value)) return prev;
        const next = new Map(prev);
        next.set(key, value);
        return next;
      });
    },
    [],
  );
  useEffect(() => {
    if (traceClassHashes.length === 0) return;
    let cancelled = false;
    const next = new Map(cairoSourceMap);
    Promise.all(
      traceClassHashes.map(async (ch) => {
        const key = cairoSourceLookupKey(ch, network);
        if (next.has(key)) return null;
        try {
          const resp = await fetchCairoSource(ch, network);
          return [key, resp] as const;
        } catch {
          return null;
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      let dirty = false;
      for (const r of results) {
        if (!r) continue;
        const [key, resp] = r;
        next.set(key, resp);
        dirty = true;
      }
      if (dirty) setCairoSourceMap(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceClassHashes, network]);

  const failureStrings = useMemo(() => {
    const reason = result?.revertReason;
    if (!reason) return [] as string[];
    const out = new Set<string>();
    for (const m of reason.matchAll(/'([^'"(),]{2,})'|"([^'"(),]{2,})"/g)) {
      const s = (m[1] ?? m[2] ?? "").trim();
      if (s.length >= 3 && /[A-Za-z]/.test(s)) {
        out.add(s);
      }
    }
    return Array.from(out);
  }, [result?.revertReason]);

  const resolveFailureHint = useMemo(() => {
    return (
      frame: (typeof frames)[number],
    ): {
      file: string;
      line: number;
      tag: string;
      source: "panic-string" | "identifier-shape";
    } | null => {
      if (failureStrings.length === 0) return null;
      const ch = normalizedClassHash(frame.classHash);
      if (!ch) return null;
      const src = cairoSourceMap.get(cairoSourceLookupKey(ch, network));
      if (!src || !src.verified || src.files.length === 0) return null;
      const fnName = selectorName(frame);
      const entryTarget = resolveCairoSourceTarget(src, fnName);
      if (!entryTarget.functionFound) return null;

      const lines = entryTarget.file.content.split("\n");
      const startIdx = entryTarget.line - 1;
      let endIdx = lines.length;
      let braceDepth = 0;
      let started = false;
      for (let i = startIdx; i < lines.length; i += 1) {
        for (const c of lines[i]) {
          if (c === "{") {
            braceDepth += 1;
            started = true;
          } else if (c === "}") {
            braceDepth -= 1;
            if (started && braceDepth <= 0) {
              endIdx = i + 1;
              break;
            }
          }
        }
        if (endIdx !== lines.length) break;
      }

      const body = lines.slice(startIdx, endIdx);
      for (const tag of failureStrings) {
        const exact = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const exactRe = new RegExp(exact);
        for (let i = 0; i < body.length; i += 1) {
          if (exactRe.test(body[i])) {
            return {
              file: entryTarget.file.path,
              line: startIdx + i + 1,
              tag,
              source: "panic-string",
            };
          }
        }

        if (/^[A-Z0-9_]+$/.test(tag)) {
          const lowered = tag.toLowerCase();
          const variants = new Set<string>();
          variants.add(lowered);
          if (lowered.startsWith("only_")) variants.add(lowered);
          for (const variant of variants) {
            const re = new RegExp(`\\b${variant}\\s*\\(`);
            for (let i = 0; i < body.length; i += 1) {
              if (re.test(body[i])) {
                return {
                  file: entryTarget.file.path,
                  line: startIdx + i + 1,
                  tag,
                  source: "identifier-shape",
                };
              }
            }
          }
        }
      }
      return null;
    };
  }, [cairoSourceMap, failureStrings, network]);

  const frameSourceTargets = useMemo(() => {
    const out = new Map<FunctionInvocation, CairoFrameSourceTarget | null>();
    for (const frame of frames) {
      const ch = normalizedClassHash(frame.classHash);
      if (!ch) {
        out.set(frame, null);
        continue;
      }

      const bridgeLookup = sierraBridgeMap.get(
        sierraBridgeLookupKey(ch, network),
      );
      const callId = frameCallIds.get(frame);
      const entryFunctionFrame =
        callId !== undefined
          ? entryFunctionFrameByCallId.get(callId)
          : undefined;

      if (bridgeLookupPending(bridgeLookup)) {
        out.set(frame, null);
        continue;
      }

      if (
        callId !== undefined &&
        entryFunctionFrame &&
        revertedFrames.has(frame) &&
        (result.traceSteps?.length ?? 0) > 0
      ) {
        const failureHint = resolveFailureHint(frame);
        const hintedLocationForCall = resolveBridgeCairoLocationMatchingLine(
          bridgeLookup,
          traceStepsByCallId.get(callId),
          failureHint?.line,
          failureHint?.file,
        );
        const hintedLocation =
          hintedLocationForCall ??
          resolveBridgeCairoLocationMatchingLine(
            bridgeLookup,
            result.traceSteps,
            failureHint?.line,
            failureHint?.file,
          );
        if (hintedLocation) {
          out.set(frame, {
            ...hintedLocation,
            kind: "revert-observation",
          });
          continue;
        }

        const observedRevertStep = lastTraceStepByCallId.get(callId);
        const observedLocation = resolveBridgeCairoLocation(
          bridgeLookup,
          observedRevertStep?.pc,
        );
        if (observedLocation) {
          out.set(frame, {
            ...observedLocation,
            kind: "revert-observation",
          });
          continue;
        }
      }

      const src = cairoSourceMap.get(cairoSourceLookupKey(ch, network));
      const fnName = selectorName(frame);
      if (
        callId !== undefined &&
        src?.verified &&
        (result.traceSteps?.length ?? 0) > 0
      ) {
        const inFunctionLocation = resolveBridgeCairoLocationInFunction(
          bridgeLookup,
          traceStepsByCallId.get(callId),
          src,
          fnName,
        );
        if (inFunctionLocation) {
          out.set(frame, {
            ...inFunctionLocation,
            kind: "frame-entry",
          });
          continue;
        }
      }

      if (entryFunctionFrame) {
        const entryLocation = resolveBridgeCairoLocation(
          bridgeLookup,
          entryFunctionFrame.pcStart,
        );
        if (entryLocation) {
          out.set(frame, { ...entryLocation, kind: "frame-entry" });
          continue;
        }
      }

      if (!src || !src.verified || src.files.length === 0) {
        out.set(frame, null);
        continue;
      }
      const entryTarget = resolveCairoSourceTarget(src, fnName);
      out.set(
        frame,
        entryTarget.functionFound
          ? {
              file: entryTarget.file.path,
              line: entryTarget.line,
              kind: "regex-fallback",
            }
          : null,
      );
    }
    return out;
  }, [
    cairoSourceMap,
    entryFunctionFrameByCallId,
    frameCallIds,
    frames,
    lastTraceStepByCallId,
    network,
    resolveFailureHint,
    result.traceSteps,
    revertedFrames,
    sierraBridgeMap,
    traceStepsByCallId,
  ]);

  const resolveCairoSource = useMemo(() => {
    return (frame: (typeof frames)[number]) => {
      const target = frameSourceTargets.get(frame);
      return target ? { file: target.file, line: target.line } : null;
    };
  }, [frameSourceTargets]);

  const resolveFallbackFailureHint = useMemo(() => {
    return (
      frame: (typeof frames)[number],
    ): {
      line: number;
      tag: string;
      source: "panic-string" | "identifier-shape";
    } | null => {
      const target = frameSourceTargets.get(frame);
      if (target?.kind !== "regex-fallback") return null;
      return resolveFailureHint(frame);
    };
  }, [frameSourceTargets, resolveFailureHint]);

  const cairoSourceTexts = useMemo(() => {
    const out: Record<string, string> = {};
    for (const src of cairoSourceMap.values()) {
      if (!src.verified) continue;
      for (const f of src.files) {
        out[f.path] = f.content;
      }
    }
    return out;
  }, [cairoSourceMap]);

  const traceAdapter = useMemo(
    () =>
      result
        ? adaptStarknetForEvmTrace(result, frames, {
            includeProtocolFrames: showProtocolFrames,
            types: response.types,
            resolveCairoSource,
            resolveFailureHint: resolveFallbackFailureHint,
          })
        : null,
    [
      result,
      frames,
      showProtocolFrames,
      response.types,
      resolveCairoSource,
      resolveFallbackFailureHint,
    ],
  );
  const [traceSearchQuery, setTraceSearchQuery] = useState("");
  const [traceFilters, setTraceFilters] = useState<TraceFilters>({
    gas: true,
    full: true,
    storage: true,
    events: true,
  });
  const handleTraceFilterChange = useCallback((key: keyof TraceFilters) => {
    setTraceFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);
  void traceAdapter?.frameToRowId;

  const eventsAdapter = useMemo(() => {
    if (!result || !traceAdapter) {
      return { events: [] as EvmShapeEvent[], eventsByEdbId: new Map() };
    }
    return adaptStarknetEventsForEdb(
      result,
      frames,
      traceAdapter.frameToRowId,
      response.types,
    );
  }, [result, frames, traceAdapter, response.types]);
  const [eventNameFilter, setEventNameFilter] = useState("");
  const [eventContractFilter, setEventContractFilter] = useState("");

  const [selectedEventDetail, setSelectedEventDetail] = useState<{
    title: string;
    value: string;
  } | null>(null);

  const idleDebugPrep: DebugPrepState = {
    prepareId: null,
    status: "idle",
    stage: null,
    progressPct: 0,
    message: null,
    sessionId: null,
    simulationId: null,
    snapshotCount: null,
    sourceFiles: null,
    error: null,
  };
  const debugPrepState: DebugPrepState = result.debugTraceError
    ? {
        ...idleDebugPrep,
        status: "failed",
        error: result.debugTraceError,
      }
    : idleDebugPrep;
  const debugReadiness = getStarknetDebugReady(result.debugTrace);
  const legacyDebugAvailable =
    (result.traceSteps?.length ?? 0) > 0 ||
    (result.functionFrames?.length ?? 0) > 0;
  const debugAvailable = debugReadiness.ready || legacyDebugAvailable;

  useEffect(() => {
    if (!debugAvailable || isDebugging) return;
    const params = new URLSearchParams(location.search);
    if (params.get("debug") === "1") openDebugger();
  }, [debugAvailable, isDebugging, location.search, openDebugger]);

  if (isDebugging) {
    const debugStepCount =
      result.debugTrace?.steps.length ?? result.traceSteps?.length ?? 0;
    const debugFrameLabel = selectedFrame
      ? (selectorName(selectedFrame) ??
        shortHex(selectedFrame.entryPointSelector, 8, 6) ??
        "Selected frame")
      : "No frame selected";

    return (
      <TooltipProvider delayDuration={200}>
        <div className="debug-window starknet-debug-window">
          <div className="debug-window__header">
            <div className="debug-window__title">
              <Bug className="h-5 w-5 text-cyan-400" />
              <span>Starknet Debugger</span>
              <span className="debug-window__contract">{debugFrameLabel}</span>
            </div>
            <UniversalSearchBar className="max-w-sm" />
            <div className="debug-window__header-actions">
              <span className="debug-window__snapshot-info">
                {debugReadiness.ready
                  ? `Offline trace · ${debugStepCount.toLocaleString()} steps`
                  : "Legacy trace debugger"}
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={closeDebugger}
                className="gap-2"
              >
                <Square className="h-3 w-3" />
                Stop debugging
              </Button>
            </div>
          </div>
          <DebuggerPane
            selectedFrame={selectedFrame}
            simulationResult={result}
            invocations={frames}
            invocationCallIds={frameCallIds}
            types={response.types}
            onSelectFrame={setSelectedFrameWithHash}
            traceSteps={result.debugTrace?.steps ?? result.traceSteps}
            functionFrames={result.debugTrace?.frames ?? result.functionFrames}
            initialStepIndex={result.debugTrace?.initialStepIndex}
            chainId={resolvedChainId}
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="starknet-sim-results">
        {traceClassHashes.map((classHash) => (
          <SierraBridgeClassLoader
            key={`${network}:${classHash}`}
            classHash={classHash}
            network={network}
            onUpdate={handleSierraBridgeUpdate}
          />
        ))}
        <ResultsHeader
          statusColor={statusColor}
          statusLabel={statusLabel}
          statusIcon={statusIconGlyph}
          showBackButton={false}
          handleBack={() => window.history.back()}
          handleExportTestData={() => downloadResponseJson(response, txHash)}
          handleShare={() => {
            if (typeof window !== "undefined") {
              try {
                void navigator.clipboard?.writeText(window.location.href);
              } catch {
                /* clipboard blocked — share button is best-effort */
              }
            }
          }}
          handleOpenDebug={openDebugger}
          handleReSimulate={() => {
            if (onResimulate) void onResimulate();
          }}
          closeDebugWindow={() => {}}
          isDebugging={isDebugging}
          isDebugLoading={Boolean(isResimulating)}
          debugEnabled={debugAvailable}
          hasLiveDebugSession={false}
          debugPrepState={debugPrepState}
          cancelDebugPrep={() => {}}
        />

        <TxLifecycleStepper response={response} />

        <TransactionSummary
          hash={summaryAdapter.hash}
          network={summaryAdapter.network}
          statusColor={statusColor}
          statusIcon={statusIconGlyph}
          statusLabel={statusLabel}
          blockNumber={summaryAdapter.blockNumber}
          result={summaryAdapter.result}
          from={summaryAdapter.from}
          to={summaryAdapter.to}
          functionName={summaryAdapter.functionName}
          value={summaryAdapter.value}
          txFee={summaryAdapter.txFee}
          gasUsed={summaryAdapter.gasUsed}
          gasLimit={summaryAdapter.gasLimit}
          gasPrice={summaryAdapter.gasPrice}
          gasPriceLabel={summaryAdapter.gasPriceLabel}
          gasPriceRaw={summaryAdapter.gasPriceRaw}
          txType={summaryAdapter.txType}
          nonce={summaryAdapter.nonce}
          chainId={null}
          networkIcon={<StarknetNetworkIcon />}
          formatAddressWithName={summaryAdapter.formatAddressWithName}
          normalizeValue={summaryAdapter.normalizeValue}
          highlightedValue={highlightedValue}
          setHighlightedValue={setHighlightedValue}
          omitValue
          extraLeftRows={<StarknetExtraLeftRows response={response} />}
          extraRightRows={
            <StarknetExtraRightRows
              l1DataGasValue={summaryAdapter.l1DataGasValue}
              stepsValue={summaryAdapter.stepsValue}
              isMetaTx={isMetaTx}
              sponsorAddress={sponsorAddress}
            />
          }
        />

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabKey)}
          className="sim-tabs-container"
        >
          <div className="starknet-sim-tabs-scroll overflow-x-auto sm:overflow-x-hidden -mx-2 px-2 sm:mx-0 sm:px-0">
            <nav className="sim-tabs-wrapper sim-tabs-wrapper--centered flex-nowrap min-w-max sm:min-w-0">
              <TabsList className="sim-tabs-list">
                {PRIMARY_TABS.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="sim-tab-trigger"
                    data-testid={`tab-${t.value}`}
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="starknet-sim-secondary-tabs">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="starknet-sim-secondary-tab"
                      data-state={
                        secondaryTabs.some((t) => t.value === tab)
                          ? "active"
                          : "inactive"
                      }
                      data-testid="tab-more-menu"
                    >
                      More
                      <CaretDown size={11} className="ml-1 inline" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[160px]">
                    {secondaryTabs.map((t) => (
                      <DropdownMenuItem
                        key={t.value}
                        onClick={() => setTab(t.value)}
                        data-active={tab === t.value ? "true" : "false"}
                        data-testid={`tab-${t.value}`}
                      >
                        {t.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </nav>
          </div>

          <div className="sim-tab-content">
            <TabsContent value="summary" className="m-0 space-y-6">
              <SummaryPanel
                result={result}
                frames={frames}
                types={response.types}
                network={network}
                onJumpToFrame={(f) => {
                  setTab("contracts");
                  setSelectedFrameWithHash(f);
                }}
              />
              {traceAdapter && (
                <>
                  <ProtocolFramesToggle
                    enabled={showProtocolFrames}
                    onToggle={() => setShowProtocolFrames((v) => !v)}
                  />
                  <TraceClickWrapper
                    traceAdapter={traceAdapter}
                    types={response.types}
                    onOpenDetail={setSelectedFrameDetail}
                    onSelectFrame={(frame) => {
                      setSelectedFrameWithHash(frame);
                    }}
                  >
                    <ExecutionStackTrace
                      traceRows={traceAdapter.traceRows}
                      traceEvents={traceAdapter.traceEvents}
                      searchQuery={traceSearchQuery}
                      onSearchChange={setTraceSearchQuery}
                      filters={traceFilters}
                      onFilterChange={handleTraceFilterChange}
                      senderAddress={sender ?? undefined}
                      highlightedValue={highlightedValue}
                      onHighlightChange={setHighlightedValue}
                      sourceTexts={cairoSourceTexts}
                      hideIO
                    />
                  </TraceClickWrapper>
                </>
              )}
            </TabsContent>

            <TabsContent value="contracts" className="m-0">
              <StarknetClassesPanel
                result={result}
                chainId={resolvedChainId}
                addressLabels={addressLabels}
              />
            </TabsContent>

            <TabsContent value="events" className="m-0">
              <EventClickWrapper
                eventsByEdbId={eventsAdapter.eventsByEdbId}
                onOpenDetail={setSelectedEventDetail}
              >
                <EdbEventsTab
                  result={
                    result as unknown as import("@/types/transaction").SimulationResult
                  }
                  artifacts={{ events: eventsAdapter.events }}
                  contractContext={null}
                  decodedTrace={{ rawEvents: eventsAdapter.events }}
                  lookedUpEventNames={{}}
                  eventNameFilter={eventNameFilter}
                  setEventNameFilter={setEventNameFilter}
                  eventContractFilter={eventContractFilter}
                  setEventContractFilter={setEventContractFilter}
                />
              </EventClickWrapper>
            </TabsContent>

            <TabsContent value="state" className="m-0">
              <StarknetStateTabPanel
                result={result}
                addressLabels={addressLabels}
                chainId={resolvedChainId}
                stateReplayPending={Boolean(stateReplayPending)}
                stateReplayError={stateReplayError ?? null}
                stateDiffMissing={stateDiffMissing}
              />
            </TabsContent>

            {l2ToL1MessageCount > 0 && (
              <TabsContent value="messages" className="m-0">
                <MessagesTab
                  result={result}
                  frames={frames}
                  onJumpToFrame={(f) => {
                    setTab("contracts");
                    setSelectedFrameWithHash(f);
                  }}
                />
              </TabsContent>
            )}

            <TabsContent value="resources" className="m-0">
              <ResourcesTab
                result={result}
                frames={frames}
                onJumpToFrame={(f) => {
                  setTab("contracts");
                  setSelectedFrameWithHash(f);
                }}
              />
            </TabsContent>

          </div>
        </Tabs>

        <StarknetArgDetailModal
          detail={selectedFrameDetail}
          onClose={() => setSelectedFrameDetail(null)}
        />

        <StarknetArgDetailModal
          detail={selectedEventDetail}
          onClose={() => setSelectedEventDetail(null)}
        />
      </div>
    </TooltipProvider>
  );
}

function TraceClickWrapper({
  traceAdapter,
  types,
  onOpenDetail,
  onSelectFrame,
  children,
}: {
  traceAdapter: {
    traceRows: Array<{ id: string }>;
    rowIdToFrame: Map<string, FunctionInvocation>;
  };
  types: Record<string, AbiTypeDef> | undefined;
  onOpenDetail: (detail: { title: string; value: string } | null) => void;
  onSelectFrame?: (frame: FunctionInvocation) => void;
  children: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const detailHit = target.closest<HTMLElement>(
      ".starknet-row-click[data-row-id], [data-arg-name][data-row-id]",
    );
    const rowHit =
      detailHit ?? target.closest<HTMLElement>(".exec-trace-row[data-row-id]");
    if (!rowHit) return;
    const rowId = rowHit.dataset.rowId;
    if (!rowId) return;
    const frame = traceAdapter.rowIdToFrame.get(rowId);
    if (!frame) return;
    onSelectFrame?.(frame);
    if (!detailHit) return;

    const body = buildAllArgsForFrame(frame, types);
    if (Object.keys(body).length === 0) return;
    e.stopPropagation();
    e.preventDefault();
    const fnLabel =
      selectorName(frame) || `unknown(${frame.entryPointSelector})`;
    const frameIdx = traceAdapter.traceRows.findIndex((r) => r.id === rowId);
    onOpenDetail({
      title: `${fnLabel} · frame ${frameIdx >= 0 ? frameIdx : "?"}`,
      value: JSON.stringify(body, null, 2),
    });
  };

  return (
    <div
      onClick={handleClick}
      data-testid="starknet-trace-click-wrapper"
    >
      {children}
    </div>
  );
}

function EventClickWrapper({
  eventsByEdbId,
  onOpenDetail,
  children,
}: {
  eventsByEdbId: Map<
    string,
    EvmShapeEvent & { decodedTree?: Record<string, JsonTree> }
  >;
  onOpenDetail: (detail: { title: string; value: string } | null) => void;
  children: React.ReactNode;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let scheduled = false;

    const stamp = () => {
      scheduled = false;
      const lists = wrapper.querySelectorAll<HTMLElement>(
        'div[style*="flex-direction: column"][style*="gap: 12px"]',
      );
      lists.forEach((list) => {
        const cards = Array.from(list.children).filter(
          (el): el is HTMLElement =>
            el instanceof HTMLElement &&
            el.style.borderRadius === "8px" &&
            el.style.overflow === "hidden",
        );
        cards.forEach((card, i) => {
          const id = `evt-${i}`;
          if (card.dataset.eventId !== id) card.dataset.eventId = id;
          const argsBlock = card.querySelector<HTMLElement>(
            'div[style*="font-family: monospace"][style*="font-size: 0.8rem"]',
          );
          if (argsBlock) wrapEventArgsBlock(argsBlock, id);
        });
      });
    };

    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(stamp);
    };

    stamp();
    const obs = new MutationObserver(schedule);
    obs.observe(wrapper, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => obs.disconnect();
  }, [eventsByEdbId]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const span = target.closest<HTMLElement>(
      ".starknet-event-click[data-event-id]",
    );
    const eventId = span?.dataset.eventId;
    if (!eventId) return;
    const entry = eventsByEdbId.get(eventId);
    if (!entry) return;
    e.stopPropagation();
    e.preventDefault();
    const tree = entry.decodedTree ?? buildFallbackTree(entry);
    if (Object.keys(tree).length === 0) return;
    const fullAddr = entry.starknetAddress ?? entry.address;
    const fromLabel = entry.contractName
      ? `${entry.contractName}`
      : `${fullAddr.slice(0, 10)}…${fullAddr.slice(-6)}`;
    onOpenDetail({
      title: `${entry.eventName} · ${fromLabel}`,
      value: JSON.stringify(tree, null, 2),
    });
  };

  return (
    <div
      ref={wrapperRef}
      onClick={handleClick}
      data-testid="starknet-event-click-wrapper"
    >
      {children}
    </div>
  );
}

function wrapEventArgsBlock(block: HTMLElement, eventId: string): void {
  const existing = block.querySelector<HTMLElement>(
    ":scope > .starknet-event-click",
  );
  if (existing) {
    if (existing.dataset.eventId !== eventId) {
      existing.dataset.eventId = eventId;
    }
    return;
  }
  const doc = block.ownerDocument;
  if (!doc) return;
  const span = doc.createElement("span");
  span.className = "starknet-event-click";
  span.dataset.eventId = eventId;
  span.tabIndex = 0;
  span.setAttribute("role", "button");
  span.setAttribute("aria-label", "Open event argument detail");
  while (block.firstChild) span.appendChild(block.firstChild);
  block.appendChild(span);
}

function buildFallbackTree(entry: EvmShapeEvent): Record<string, JsonTree> {
  const out: Record<string, JsonTree> = {};
  for (const a of entry.eventArgs ?? []) {
    out[a.name] = { value: a.value, type: a.type ?? "felt252" };
  }
  return out;
}

function ProtocolFramesToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex justify-end mb-2">
      <button
        type="button"
        onClick={onToggle}
        data-state={enabled ? "active" : "inactive"}
        data-testid="toggle-protocol-frames"
        className={
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] " +
          "uppercase tracking-wide font-medium border transition-colors " +
          (enabled
            ? "border-[var(--sim-accent,#a069ff)] text-white bg-[rgba(160,105,255,0.12)]"
            : "border-[var(--sim-border,rgba(255,255,255,0.08))] text-[var(--sim-text-muted,#6b6b7b)] bg-transparent hover:text-[var(--sim-text,#e5e5e5)] hover:bg-[rgba(255,255,255,0.04)]")
        }
        aria-pressed={enabled}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{
            background: enabled
              ? "var(--sim-accent, #a069ff)"
              : "rgba(255,255,255,0.25)",
          }}
        />
        Protocol frames
      </button>
    </div>
  );
}

function TxLifecycleStepper({ response }: { response: SimulateResponse }) {
  const finality = response.txReceipt?.finality_status ?? null;
  if (!finality) return null;

  const onL2 = finality === "ACCEPTED_ON_L2" || finality === "ACCEPTED_ON_L1";
  const onL1 = finality === "ACCEPTED_ON_L1";

  const checkIcon = (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );

  return (
    <div className="starknet-sim-lifecycle">
      <div className="starknet-sim-lifecycle__phase">
        <span className="starknet-sim-lifecycle__phase-label">
          Transaction Executed
        </span>
        <Stepper
          defaultValue={onL2 ? 3 : 2}
          indicators={{ completed: checkIcon }}
        >
          <StepperNav className="gap-1">
            <StepperItem step={1} completed>
              <StepperTrigger className="flex-row gap-2">
                <StepperIndicator />
                <StepperTitle>Received</StepperTitle>
              </StepperTrigger>
              <StepperSeparator />
            </StepperItem>
            <StepperItem step={2} completed={onL2}>
              <StepperTrigger className="flex-row gap-2">
                <StepperIndicator />
                <StepperTitle>Accepted on L2</StepperTitle>
              </StepperTrigger>
            </StepperItem>
          </StepperNav>
        </Stepper>
      </div>

      <span className="starknet-sim-lifecycle__connector" aria-hidden>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </span>

      <div className="starknet-sim-lifecycle__phase">
        <span className="starknet-sim-lifecycle__phase-label">Settled</span>
        <Stepper
          defaultValue={onL1 ? 2 : 1}
          indicators={{ completed: checkIcon }}
        >
          <StepperNav className="gap-1">
            <StepperItem step={1} completed={onL1}>
              <StepperTrigger className="flex-row gap-2">
                <StepperIndicator />
                <StepperTitle>Accepted on L1</StepperTitle>
              </StepperTrigger>
            </StepperItem>
          </StepperNav>
        </Stepper>
      </div>
    </div>
  );
}

function StarknetNetworkIcon() {
  return (
    <img
      src="/logos/starknet.png"
      alt="Starknet"
      width={18}
      height={18}
      className="starknet-sim-network-icon"
      loading="lazy"
    />
  );
}

function StarknetExtraLeftRows({ response }: { response: SimulateResponse }) {
  const blockCtx = response.blockContext;
  return (
    <div className="sim-summary-row" data-summary-row="starknet-version">
      <span className="sim-summary-label">Starknet Version</span>
      <span className="sim-summary-value sim-summary-mono">
        {blockCtx.starknetVersion && blockCtx.starknetVersion !== "upstream"
          ? blockCtx.starknetVersion
          : "—"}
      </span>
    </div>
  );
}

function StarknetExtraRightRows({
  l1DataGasValue,
  stepsValue,
  isMetaTx,
  sponsorAddress,
}: {
  l1DataGasValue: string;
  stepsValue: string;
  isMetaTx: boolean;
  sponsorAddress: string | null;
}) {
  return (
    <>
      <div className="sim-summary-row" data-summary-row="l1-data-gas">
        <span className="sim-summary-label">L1 Data Gas</span>
        <span className="sim-summary-value sim-summary-mono">
          {l1DataGasValue}
        </span>
      </div>
      <div className="sim-summary-row" data-summary-row="vm-steps">
        <span className="sim-summary-label">VM Steps</span>
        <span className="sim-summary-value sim-summary-mono">{stepsValue}</span>
      </div>
      {isMetaTx && (
        <div className="sim-summary-row" data-summary-row="sponsor">
          <span className="sim-summary-label">Sponsor</span>
          <span className="sim-summary-value">
            {sponsorAddress ? (
              <ContractAddress addr={sponsorAddress} head={10} tail={6} />
            ) : (
              <span style={{ color: "var(--sim-text-muted)" }}>
                META-TX (no sponsor address)
              </span>
            )}
          </span>
        </div>
      )}
    </>
  );
}

function StarknetStateTabPanel({
  result,
  addressLabels,
  chainId,
  stateReplayPending,
  stateReplayError,
  stateDiffMissing,
}: {
  result: SimulationResult;
  addressLabels: Record<string, string>;
  chainId: string | null;
  stateReplayPending: boolean;
  stateReplayError: Error | null;
  stateDiffMissing: boolean;
}) {
  const artifacts = useMemo(
    () => adaptStarknetStateForEdb(result.stateDiff),
    [result.stateDiff],
  );

  if (stateDiffMissing && stateReplayPending) {
    return (
      <Card
        className="p-6 text-sm text-muted-foreground leading-relaxed border-dashed"
        data-testid="state-diff-replay-pending"
      >
        <div className="text-xs uppercase text-muted-foreground mb-2">
          State diff
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full border-2 border-foreground/30 border-t-foreground animate-spin"
            aria-hidden
          />
          <span>Recomputing state diff via local blockifier replay…</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-2">
          Upstream <span className="font-mono">starknet_traceTransaction</span>{" "}
          doesn't return <span className="font-mono">state_diff</span> for
          landed txs. We're re-running the tx in a local blockifier to recover
          it (~9 s).
        </div>
      </Card>
    );
  }

  if (stateDiffMissing && stateReplayError) {
    const replayError = resolveBridgeError(stateReplayError);
    return (
      <Card
        className="p-6 text-sm text-muted-foreground leading-relaxed border-dashed"
        data-testid="state-diff-replay-error"
      >
        <div className="text-xs uppercase text-muted-foreground mb-2">
          State diff
        </div>
        <div className="text-sm text-foreground mb-1">{replayError.title}</div>
        <div className="text-xs text-muted-foreground">{replayError.hint}</div>
        <details className="mt-3 text-[11px]">
          <summary className="cursor-pointer text-warning">
            Raw replay error
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-warning">
            {replayError.message}
          </pre>
        </details>
      </Card>
    );
  }

  const sd = result.stateDiff;
  const nonceUpdates = sd?.nonceUpdates ?? [];
  const classHashUpdates = sd?.classHashUpdates ?? [];
  const declaredClasses = sd?.declaredClasses ?? [];

  return (
    <div className="space-y-4">
      {nonceUpdates.length > 0 && (
        <Card className="p-4 gap-3" data-testid="starknet-nonce-updates">
          <div className="text-xs uppercase text-muted-foreground">
            Nonce updates
          </div>
          <div className="space-y-1.5">
            {nonceUpdates.map((n, i) => {
              const lbl = addressLabels[n.contractAddress];
              const beforeNonce = previousFelt(n.nonce);
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 text-[11px] flex-wrap"
                >
                  <ContractAddress
                    addr={n.contractAddress}
                    precomputedLabel={lbl ?? null}
                    className="text-info"
                    trailing={
                      <StateContractActions
                        address={n.contractAddress}
                        chainId={chainId}
                      />
                    }
                  />
                  <span className="font-mono inline-flex items-center gap-2">
                    <span className="text-muted-foreground">
                      {beforeNonce ?? "unknown"}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span className="text-warning">{n.nonce}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {classHashUpdates.length > 0 && (
        <Card className="p-4 gap-3" data-testid="starknet-class-hash-updates">
          <div className="text-xs uppercase text-muted-foreground">
            Class hash updates
          </div>
          <div className="space-y-1.5">
            {classHashUpdates.map((c, i) => {
              const lbl = addressLabels[c.contractAddress];
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 text-[11px]"
                >
                  <ContractAddress
                    addr={c.contractAddress}
                    precomputedLabel={lbl ?? null}
                    className="text-info"
                    trailing={
                      <StateContractActions
                        address={c.contractAddress}
                        chainId={chainId}
                      />
                    }
                  />
                  <span className="font-mono text-warning">
                    {shortHex(c.classHash)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {declaredClasses.length > 0 && (
        <Card className="p-4 gap-3" data-testid="starknet-declared-classes">
          <div className="text-xs uppercase text-muted-foreground">
            Declared classes
          </div>
          <div className="space-y-1.5">
            {declaredClasses.map((declared, i) => (
              <div
                key={`${declared.classHash}-${i}`}
                className="flex items-center justify-between gap-3 text-[11px]"
              >
                <span className="font-mono text-info">
                  {shortHex(declared.classHash)}
                </span>
                <span className="font-mono text-warning">
                  CASM {shortHex(declared.compiledClassHash)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <StateTab
        result={
          result as unknown as import("@/types/transaction").SimulationResult
        }
        artifacts={artifacts}
        contractContext={{}}
      />
    </div>
  );
}

function StateContractActions({
  address,
  chainId,
}: {
  address: string;
  chainId: string | null | undefined;
}) {
  const links = contractExplorerLinks(address, chainId);
  return (
    <span className="inline-flex items-center gap-1">
      <CopyButton
        value={address}
        ariaLabel="Copy contract address"
        className="h-4 w-4"
        iconSize={10}
      />
      <a
        href={links.voyager}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[9px] text-muted-foreground hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        Voyager
      </a>
      <a
        href={links.starkscan}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[9px] text-muted-foreground hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        Starkscan
      </a>
    </span>
  );
}

function previousFelt(value: string): string | null {
  try {
    const next = BigInt(value);
    if (next <= 0n) return null;
    return `0x${(next - 1n).toString(16)}`;
  } catch {
    return null;
  }
}

function labelForClassContracts(
  addresses: string[],
  addressLabels: Record<string, string>,
): string | null {
  for (const address of addresses) {
    const label =
      addressLabels[address] ??
      addressLabels[address.toLowerCase()] ??
      contractLabel(address);
    if (label) return label;
  }
  return null;
}

function StarknetClassesPanel({
  result,
  chainId,
  addressLabels,
}: {
  result: SimulationResult;
  chainId: string | null;
  addressLabels: Record<string, string>;
}) {
  const navigate = useNavigate();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [verifyTick, setVerifyTick] = useState(0);
  const [classContractNames, setClassContractNames] = useState<
    Map<string, string>
  >(() => new Map());
  const { contracts, classToContracts } = useMemo(() => {
    void verifyTick; // dependency hook
    const adapted = adaptStarknetClasses(result);
    return {
      ...adapted,
      contracts: adapted.contracts.map((row) => ({
        ...row,
        name:
          classContractNames.get(row.address.toLowerCase()) ??
          labelForClassContracts(
            adapted.classToContracts.get(row.address.toLowerCase()) ?? [],
            addressLabels,
          ) ??
          row.name,
        explorerUrl: classExplorerVoyager(row.address, chainId),
        explorerName: "Voyager",
      })),
    };
  }, [addressLabels, chainId, classContractNames, result, verifyTick]);
  const edbResult = useMemo(
    () => buildEdbContractsResult(result, contracts),
    [result, contracts],
  );

  useEffect(() => {
    let cancelled = false;
    const network = starknetNetworkFromChainId(chainId);
    (async () => {
      const { fetchClassInfo } = await import("./CallTreeTab");
      for (const row of contracts) {
        if (cancelled) return;
        if (row.verified) continue;
        try {
          await fetchClassInfo(row.address, network);
          if (!cancelled) setVerifyTick((t) => t + 1);
        } catch {
          /* class fetch errors stay as the unverified pill */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chainId, contracts]);

  useEffect(() => {
    let cancelled = false;
    const network = starknetNetworkFromChainId(chainId);
    (async () => {
      for (const row of contracts) {
        if (cancelled || !row.verified) continue;
        const classHash = row.address.toLowerCase();
        if (classContractNames.has(classHash)) continue;
        const addresses = classToContracts.get(classHash) ?? [];
        for (const address of addresses) {
          if (cancelled) return;
          const name = await fetchContractName(address, { network });
          if (!name) continue;
          setClassContractNames((current) => {
            if (current.has(classHash)) return current;
            const next = new Map(current);
            next.set(classHash, name);
            return next;
          });
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chainId, classContractNames, classToContracts, contracts]);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    let scheduled = false;
    const stamp = () => {
      scheduled = false;
      const rows = wrapper.querySelectorAll<HTMLElement>(
        '.sim-panel > div > div[style*="grid-template-columns"]',
      );
      rows.forEach((el) => {
        const code = el.querySelector("code");
        if (!code) return;
        const text = code.textContent?.trim() ?? "";
        if (text && text.startsWith("0x") && el.dataset.classesRowId !== text) {
          el.dataset.classesRowId = text;
          el.setAttribute("role", "link");
          el.setAttribute("tabindex", "0");
          el.setAttribute(
            "aria-label",
            `Open class ${shortHex(text)} in Starknet explorer`,
          );
          el.setAttribute("title", "Open class in Starknet explorer");
        }
      });
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(stamp);
    };
    stamp();
    const obs = new MutationObserver(schedule);
    obs.observe(wrapper, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [contracts]);

  const handleCapturedClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as HTMLElement;
      if (target.closest("a")) return;
      const row = target.closest<HTMLElement>("[data-classes-row-id]");
      if (!row) return;
      const classHash = row.dataset.classesRowId;
      if (!classHash) return;
      e.preventDefault();
      e.stopPropagation();
      const params = new URLSearchParams();
      params.set("classHash", classHash);
      if (chainId) params.set("chainId", chainId);
      navigate(`/starknet/explorer?${params.toString()}`);
    },
    [navigate, chainId],
  );

  const openClassRow = useCallback(
    (row: HTMLElement) => {
      const classHash = row.dataset.classesRowId;
      if (!classHash) return;
      const params = new URLSearchParams();
      params.set("classHash", classHash);
      if (chainId) params.set("chainId", chainId);
      navigate(`/starknet/explorer?${params.toString()}`);
    },
    [navigate, chainId],
  );

  const handleCapturedKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>("[data-classes-row-id]");
      if (!row) return;
      e.preventDefault();
      e.stopPropagation();
      openClassRow(row);
    },
    [openClassRow],
  );

  return (
    <div
      ref={wrapperRef}
      data-testid="starknet-classes-click-wrapper"
      onClickCapture={handleCapturedClick}
      onKeyDownCapture={handleCapturedKeyDown}
    >
      <EdbContractsTab
        result={
          edbResult as unknown as import("@/types/transaction").SimulationResult
        }
        contractContext={{}}
      />
    </div>
  );
}

function starknetNetworkFromChainId(
  chainId: string | null | undefined,
): "mainnet" | "sepolia" {
  const lower = (chainId || "").toLowerCase();
  return lower === "0x534e5f5345504f4c4941" ||
    lower === "0x534e5f494e544547524154494f4e5f5345504f4c4941"
    ? "sepolia"
    : "mainnet";
}

const RESULT_TAB_KEY = "hexkit:starknet-sim:resultTab";
const VALID_RESULT_TABS: readonly TabKey[] = [
  "summary",
  "contracts",
  "events",
  "state",
  "messages",
  "resources",
] as const;

function loadStoredTab(): TabKey {
  if (typeof window === "undefined") return "summary";
  try {
    const raw = window.localStorage.getItem(RESULT_TAB_KEY);
    if (raw && VALID_RESULT_TABS.includes(raw as TabKey)) return raw as TabKey;
  } catch {
    /* fall through */
  }
  return "summary";
}

function downloadResponseJson(
  response: SimulateResponse,
  txHash?: string,
): void {
  if (typeof window === "undefined") return;
  const stem = txHash
    ? txHash.replace(/^0x/, "0x").slice(0, 18)
    : response.simId;
  const filename = `starknet-sim-${stem}.json`;
  try {
    const blob = new Blob([JSON.stringify(response, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    /* sandbox iframes block this — Raw JSON tab still works */
  }
}

export { contractLabel, selectorName };
