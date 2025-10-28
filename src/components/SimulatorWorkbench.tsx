import { useCallback, useEffect, useMemo, useState } from "react";
import type { SimulationResult } from "../types/transaction";
import type { Chain } from "../types";
import { simulateTransaction } from "../utils/transactionSimulation";
import { SUPPORTED_CHAINS } from "../utils/chains";
import { userRpcManager } from "../utils/userRpc";
import "../styles/SimulatorWorkbench.css";

type SimulatorTab = "summary" | "contracts" | "events" | "state" | "gas";

interface SourceDocument {
  path: string;
  lines: string[];
}

interface RawTraceEntry {
  id?: number;
  trace_id?: number;
  traceId?: number;
  parent_id?: number;
  parentId?: number;
  parent_index?: number;
  parent?: number;
  depth?: number;
  caller?: string;
  target?: string;
  functionName?: string;
  input?: string;
  transaction?: { data?: string };
  call_type?: Record<string, unknown>;
  value?: string;
  result?: Record<string, { output?: string; reason?: string }>;
  events?: unknown;
  [key: string]: any;
}

interface TimelineSnapshot {
  id: number;
  frameKey: string;
  type: string;
  pc?: number;
  opcode?: number;
  mnemonic?: string;
  target?: string;
  stack: string[];
  path?: string;
  locals?: Record<string, unknown> | null;
  highlight?: { start: number; end: number } | null;
  label?: string;
}

interface CallTreeNode {
  entry: RawTraceEntry;
  children: CallTreeNode[];
}

const USDT_ADDRESS = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const SAMPLE_HOLDER = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
const SAMPLE_FROM = "0x000000000000000000000000000000000000dead";

const capabilityComparison = [
  {
    capability: "Offline/local simulation with custom RPC",
    edb: "✅ (recorded job, local RPC/proxy)",
    tenderly: "❌ (hosted environment)",
  },
  {
    capability: "Instrumentation + bytecode replacement",
    edb: "✅ (recompile with hooks)",
    tenderly: "✖️ (restricted)",
  },
  {
    capability: "Source-level locals/state (hook snapshots)",
    edb: "✅ (when verified source provided)",
    tenderly: "⚠️ (shows line but no locals)",
  },
  {
    capability: "Opcode-level debugging",
    edb: "✅ (per-PC stack/memory/calldata)",
    tenderly: "⚠️ (visual timeline only)",
  },
  {
    capability: "Expression evaluation on snapshot",
    edb: "✅ (`edb_evalOnSnapshot`)",
    tenderly: "✖️",
  },
  {
    capability: "Snapshot storage diff per step",
    edb: "✅ (`edb_getStorageDiff`)",
    tenderly: "⚠️ (aggregate UI)",
  },
  {
    capability: "Automatic UI/UX",
    edb: "⚠️ (requires custom front-end)",
    tenderly: "✅ (hosted UI)",
  },
  {
    capability: "Turnkey production monitoring",
    edb: "⚠️ (requires integration)",
    tenderly: "✅",
  },
  {
    capability: "Built-in explorer integrations",
    edb: "⚠️ (you provide RPC/API keys)",
    tenderly: "✅",
  },
  {
    capability: "Collaboration/sharing URLs",
    edb: "⚠️ (not provided)",
    tenderly: "✅",
  },
];

const simulatorDataRows = [
  {
    category: "Transaction metadata",
    edb: "Hash, network, block, timestamp, caller, target, value, calldata hash, gas used/limit, execution mode (local/onchain)",
    tenderly: "Same (hash, network, block, timestamp, caller, target, gas, value)",
  },
  {
    category: "Call stack",
    edb: "Full call hierarchy with `call_type`, caller/target, depth, `first_snapshot_id`, emitted events, selfdestruct info",
    tenderly: "Rendered tree with function names, revert message, collapsed frames",
  },
  {
    category: "Raw opcode snapshots",
    edb: "Every PC step: opcode mnemonic, stack, memory, calldata, transient_storage, database handle",
    tenderly: "Not exposed; shows only aggregated timeline rows",
  },
  {
    category: "Hook snapshots",
    edb: "Source-aware entries (locals, state vars, path/offset/length, USID) when verified source is available",
    tenderly: "UI shows file/line but locals/state aren’t exposed",
  },
  {
    category: "Storage diffs",
    edb: "For any snapshot: slot (before, after) plus target bytecode address",
    tenderly: "State changes tab (aggregate, not per snapshot)",
  },
  {
    category: "Events/logs",
    edb: "Per call frame events with decoded args (if ABI known) | Events tab",
    tenderly: "Events tab",
  },
  {
    category: "Gas analysis",
    edb: "Gas used per snapshot (via trace + snapshots)",
    tenderly: "Gas profiler tab (UI only)",
  },
  {
    category: "Expression evaluation",
    edb: "`edb_evalOnSnapshot` runs Solidity-like expressions on any snapshot",
    tenderly: "Not available",
  },
  {
    category: "Artifact access",
    edb: "Raw/recompiled artifacts, ABI lookups, callable ABI classification",
    tenderly: "ABI inferred from explorer; not downloadable",
  },
  {
    category: "Raw payload export",
    edb: "JSON blob (trace + snapshots + storage + metadata)",
    tenderly: "Raw payload panel",
  },
];

const opcodeName = (opcode: number) => {
  const map: Record<number, string> = {
    0x00: "STOP",
    0x01: "ADD",
    0x02: "MUL",
    0x03: "SUB",
    0x10: "LT",
    0x11: "GT",
    0x14: "EQ",
    0x21: "SHA3",
    0x33: "CALLER",
    0x35: "CALLDATALOAD",
    0x39: "CODECOPY",
    0x3d: "RETURNDATASIZE",
    0x3e: "RETURNDATACOPY",
    0x40: "BLOCKHASH",
    0x42: "TIMESTAMP",
    0x54: "SLOAD",
    0x55: "SSTORE",
    0x56: "JUMP",
    0x57: "JUMPI",
    0x5b: "JUMPDEST",
    0x60: "PUSH1",
    0x61: "PUSH2",
    0xf1: "CALL",
    0xf3: "RETURN",
    0xfd: "REVERT",
  };
  return map[opcode] || `OP ${opcode}`;
};

const ensureArray = <T,>(value: T | T[] | null | undefined): T[] => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
};

const frameKeyFromEntry = (entry?: RawTraceEntry | null) => {
  if (!entry) return "0:0";
  const id = entry.id ?? entry.trace_id ?? entry.traceId ?? 0;
  const depth = entry.depth ?? 0;
  return `${id}:${depth}`;
};

const frameKeyFromSnapshot = (snapshot: any) => {
  const frameId = snapshot?.frame_id;
  if (Array.isArray(frameId)) {
    return `${frameId[0]}:${frameId[1] ?? 0}`;
  }
  if (typeof frameId === "number") {
    return `${frameId}:0`;
  }
  return String(frameId ?? "0:0");
};

const shortAddress = (value?: string | null) => {
  if (!value) return "—";
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

const getEntryError = (entry: RawTraceEntry | undefined | null) => {
  if (!entry || !entry.result) return null;
  return (
    entry.result.Revert?.reason ||
    entry.result.Error?.reason ||
    entry.result.Revert?.output ||
    entry.result.Error?.output ||
    null
  );
};

const buildCallTree = (entries: RawTraceEntry[]): CallTreeNode[] => {
  const nodes = new Map<number, CallTreeNode>();
  const children = new Map<number, CallTreeNode[]>();

  entries.forEach((entry) => {
    const id = Number(entry.id ?? entry.trace_id ?? 0);
    nodes.set(id, { entry, children: [] });
  });

  entries.forEach((entry) => {
    const parentId =
      entry.parent_id ?? entry.parentId ?? entry.parent_index ?? entry.parent;
    if (parentId === undefined || parentId === null) return;
    const bucket = children.get(Number(parentId)) ?? [];
    const child = nodes.get(Number(entry.id));
    if (child) {
      bucket.push(child);
      children.set(Number(parentId), bucket);
    }
  });

  children.forEach((bucket, parentId) => {
    const parent = nodes.get(Number(parentId));
    if (parent) parent.children = bucket.filter(Boolean);
  });

  const roots: CallTreeNode[] = [];
  nodes.forEach((node) => {
    const parentId =
      node.entry.parent_id ??
      node.entry.parentId ??
      node.entry.parent_index ??
      node.entry.parent;
    if (parentId === undefined || parentId === null) {
      roots.push(node);
    }
  });
  return roots;
};

const hydrateSnapshots = (snapshots: any[]): Map<string, TimelineSnapshot[]> => {
  const map = new Map<string, TimelineSnapshot[]>();
  snapshots.forEach((raw) => {
    const frameKey = frameKeyFromSnapshot(raw);
    const detail = raw.detail?.Opcode
      ? { type: "Opcode", ...raw.detail.Opcode }
      : raw.detail?.Hook
      ? { type: "Hook", ...raw.detail.Hook }
      : { type: "Unknown", ...raw.detail };

    const normalized: TimelineSnapshot = {
      id: raw.id,
      frameKey,
      type: detail.type,
      pc: detail.pc,
      opcode: detail.opcode,
      mnemonic:
        detail.type === "Opcode" ? opcodeName(detail.opcode) : detail.type,
      target: raw.target_address,
      stack: ensureArray(detail.stack || []).map((item: any) =>
        typeof item === "string" ? item : JSON.stringify(item)
      ),
      path: detail.path,
      locals: detail.locals ?? detail.state_variables ?? null,
      highlight: detail.length
        ? {
            start: detail.offset ?? 0,
            end: (detail.offset ?? 0) + detail.length,
          }
        : null,
      label:
        detail.type === "Opcode"
          ? `${detail.mnemonic ?? opcodeName(detail.opcode)}`
          : `${detail.type} • ${detail.path ?? "snapshot"}`,
    };
    const bucket = map.get(frameKey) ?? [];
    bucket.push(normalized);
    map.set(frameKey, bucket);
  });

  map.forEach((bucket) =>
    bucket.sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  );
  return map;
};

const toBigIntSafe = (value: unknown): bigint | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
        return BigInt(trimmed);
      }
      if (/^-?\d+$/.test(trimmed)) {
        return BigInt(trimmed);
      }
      return BigInt(trimmed);
    } catch {
      return null;
    }
  }
  try {
    return BigInt(value as any);
  } catch {
    return null;
  }
};

const formatNumeric = (value: unknown, unit?: string) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" && !value.trim()) return "—";
  const numeric = toBigIntSafe(value);
  if (numeric === null) {
    return typeof value === "string" ? value : String(value);
  }
  const base = numeric.toString();
  return unit ? `${base} ${unit}` : base;
};

const formatValue = (value?: unknown) => formatNumeric(value, "wei");

const formatTxFee = (gasUsed?: unknown, gasPrice?: unknown) => {
  const used = toBigIntSafe(gasUsed);
  const price = toBigIntSafe(gasPrice);
  if (used === null || price === null) return "—";
  return `${(used * price).toString()} wei`;
};

const formatModeLabel = (mode?: string) => {
  const normalized = typeof mode === "string" ? mode.toLowerCase() : "";
  switch (normalized) {
    case "local":
      return "Local · EDB";
    case "mainnet":
      return "Mainnet · EDB";
    case "fork":
      return "Fork · EDB";
    case "live":
      return "Live RPC · EDB";
    case "simulation":
      return "Simulation · EDB";
    case "rpc":
      return "RPC · EDB";
    case "onchain":
      return "On-chain · EDB";
    default:
      return "EDB";
  }
};

const formatJson = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const decodeFunction = (input?: string) => {
  if (!input || input === "0x") return "Fallback";
  const selector = input.slice(0, 10).toLowerCase();
  const map: Record<string, string> = {
    "0x5c975abb": "paused()",
    "0x8456cb59": "pause()",
    "0x3f4ba83a": "symbol()",
    "0x70a08231": "balanceOf(address)",
  };
  return map[selector] ?? selector;
};

const getRawEntries = (payload: SimulationResult | null) => {
  if (!payload?.rawTrace) return [];
  const inner = (payload.rawTrace as any)?.inner?.inner;
  return Array.isArray(inner) ? inner : [];
};

const getSnapshots = (payload: SimulationResult | null) =>
  ensureArray((payload as any)?.rawTrace?.snapshots ?? []);

const getStorageDiffs = (payload: SimulationResult | null) =>
  ensureArray((payload as any)?.rawTrace?.storageDiffs ?? []);

const getEventsMap = (entries: RawTraceEntry[]) =>
  new Map(
    entries.map((entry) => [frameKeyFromEntry(entry), ensureArray(entry.events)])
  );

const SimulatorWorkbench = () => {
  const [activeTab, setActiveTab] = useState<SimulatorTab>("summary");
  const [payload, setPayload] = useState<SimulationResult | null>(null);
  const [sourceDoc, setSourceDoc] = useState<SourceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState<string | null>(null);
  const [snapshotId, setSnapshotId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({
    gas: true,
    full: true,
    storage: true,
    events: true,
  });
  const [collapsedFrames, setCollapsedFrames] = useState<Set<string>>(new Set());

  const sampleChain: Chain | null = useMemo(() => {
    const base = SUPPORTED_CHAINS.find((chain) => chain.id === 1);
    if (!base) return null;
    if (typeof window === "undefined") {
      return base;
    }
    const effective = userRpcManager.getEffectiveRpcUrl(base, base.rpcUrl);
    return { ...base, rpcUrl: effective.url };
  }, []);

  const sampleCalldata = useMemo(() => {
    const holder = SAMPLE_HOLDER.slice(2).padStart(64, "0");
    return `0x70a08231${holder}`;
  }, []);

  const loadFromBridge = useCallback(async () => {
    if (!sampleChain) {
      throw new Error("No mainnet RPC configured");
    }

    const result = await simulateTransaction(
      {
        to: USDT_ADDRESS,
        data: sampleCalldata,
      },
      sampleChain,
      SAMPLE_FROM
    );

    if (!result?.rawTrace) {
      throw new Error("Simulator bridge response missing rawTrace");
    }
    return result;
  }, [sampleChain, sampleCalldata]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const bridgePayload = await loadFromBridge();
        if (mounted) {
          setPayload(bridgePayload);
        }
      } catch (bridgeError: any) {
        console.warn("[simulator] bridge run failed, falling back to fixture", bridgeError);
        setError(
          "Simulator bridge unavailable. Showing recorded payload instead."
        );
        const fixture = await fetch("/simulator/usdt-sim-output.json").then(
          (res) => res.json()
        );
        if (mounted) {
          setPayload(fixture as SimulationResult);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadFromBridge]);

  useEffect(() => {
    fetch("/simulator/usdt-source.json")
      .then((res) => res.json())
      .then((data) => {
        setSourceDoc({
          path: data.path ?? "",
          lines: data.content?.split(/\r?\n/) ?? [],
        });
      })
      .catch(() => setSourceDoc(null));
  }, []);

  const entries = useMemo(() => getRawEntries(payload), [payload]);
  const callTree = useMemo(() => buildCallTree(entries), [entries]);
  const frameSnapshots = useMemo(
    () => hydrateSnapshots(getSnapshots(payload)),
    [payload]
  );
  const storageDiffs = useMemo(() => getStorageDiffs(payload), [payload]);
  const eventsMap = useMemo(() => getEventsMap(entries), [entries]);

  const activeFrameEntry = useMemo(
    () => entries.find((entry) => frameKeyFromEntry(entry) === frameKey) ?? null,
    [entries, frameKey]
  );

  const frameResultOutput = useMemo(() => {
    const first = Object.values(activeFrameEntry?.result ?? {})[0] as
      | { output?: string }
      | undefined;
    return typeof first?.output === "string" ? first.output : "0x";
  }, [activeFrameEntry]);

  const snapshotsForFrame = useMemo(() => {
    if (!frameKey) return [];
    const dataset = frameSnapshots.get(frameKey) ?? [];
    if (!query.trim()) return dataset;
    return dataset.filter((snap) =>
      `${snap.mnemonic} ${snap.path ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase())
    );
  }, [frameKey, frameSnapshots, query]);

  const activeSnapshot = useMemo(
    () => snapshotsForFrame.find((snap) => snap.id === snapshotId) ?? null,
    [snapshotsForFrame, snapshotId]
  );

  const summaryTrace = useMemo(() => {
    if (
      payload &&
      typeof payload.rawTrace === "object" &&
      payload.rawTrace &&
      !Array.isArray(payload.rawTrace)
    ) {
      return payload.rawTrace as Record<string, unknown>;
    }
    return null;
  }, [payload]);

  const renderedSourceLines = useMemo(() => {
    if (!activeSnapshot || !sourceDoc?.lines.length) return null;
    let cursor = 0;
    return sourceDoc.lines.map((line, index) => {
      const start = cursor;
      cursor += line.length + 1;
      const isActive =
        !!activeSnapshot.highlight &&
        activeSnapshot.highlight.end > start &&
        activeSnapshot.highlight.start < cursor;
      return (
        <div
          key={`${index}-${line}`}
          className={`sim-source-line ${isActive ? "active" : ""}`}
        >
          <span className="sim-source-num">{index + 1}</span>
          <span>{line}</span>
        </div>
      );
    });
  }, [activeSnapshot, sourceDoc]);

  useEffect(() => {
    if (!entries.length) return;
    const key = frameKeyFromEntry(entries[0]);
    setFrameKey(key);
  }, [entries]);

  useEffect(() => {
    if (!frameKey) return;
    const snap = frameSnapshots.get(frameKey)?.[0] ?? null;
    setSnapshotId(snap?.id ?? null);
  }, [frameKey, frameSnapshots]);

  const eventsForFrame = useMemo(() => {
    if (!frameKey) return [];
    return eventsMap.get(frameKey) ?? [];
  }, [eventsMap, frameKey]);

  const toggleFrameCollapse = useCallback((key: string) => {
    setCollapsedFrames((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expandAllFrames = useCallback(() => {
    setCollapsedFrames(new Set());
  }, []);

  const collapseAllFrames = useCallback(() => {
    const next = new Set<string>();
    entries.forEach((entry) => next.add(frameKeyFromEntry(entry)));
    setCollapsedFrames(next);
  }, [entries]);

  const filteredStorageDiffs = useMemo(() => {
    if (!filters.storage) return [];
    return storageDiffs.filter((entry) => {
      if (!frameKey) return true;
      const activeTarget = activeFrameEntry?.target ?? "";
      const diffTarget = entry.address ?? entry.target ?? "";
      return diffTarget.toLowerCase() === activeTarget.toLowerCase();
    });
  }, [filters.storage, storageDiffs, activeFrameEntry, frameKey]);

  const stackError = useMemo(() => {
    const root =
      entries.find((entry) => frameKeyFromEntry(entry) === frameKey) ?? null;
    const result = root?.result ?? {};
    const revert =
      result?.Revert?.reason ||
      result?.Error?.reason ||
      result?.Revert?.output ||
      result?.Error?.output;
    return revert ?? null;
  }, [entries, frameKey]);

  const handleCopy = (value: string) => {
    if (!navigator?.clipboard) return;
    navigator.clipboard.writeText(value);
  };

  const statusPill = payload?.success ? "Simulation • OK" : "Simulation • ERROR";
  const badgeClass = payload?.success ? "sim-badge success" : "sim-badge error";

  const renderCallTree = (nodes: CallTreeNode[], depth = 0) => {
    return nodes.map((node) => {
      const key = frameKeyFromEntry(node.entry);
      const isActive = key === frameKey;
      return (
        <div key={`${key}-${depth}`} style={{ marginLeft: depth ? 12 : 0 }}>
          <div
            className={`sim-stack-item ${isActive ? "active" : ""}`}
            onClick={() => setFrameKey(key)}
          >
            <strong>{node.entry.functionName ?? "Call"}</strong>
            <div className="sim-stack-meta">
              From {node.entry.caller} → {node.entry.target}
            </div>
            <div className="sim-stack-meta">Depth {node.entry.depth ?? 0}</div>
          </div>
          {node.children?.length ? renderCallTree(node.children, depth + 1) : null}
        </div>
      );
    });
  };

  const renderStackNodes = (nodes: CallTreeNode[]): React.ReactNode =>
    nodes.map((node) => {
      const entry = node.entry;
      const key = frameKeyFromEntry(entry);
      const hasChildren = !!node.children?.length;
      const collapsed = collapsedFrames.has(key);
      const entryError = getEntryError(entry);
      return (
        <li
          key={key}
          className={`stack-node${frameKey === key ? " active" : ""}${collapsed ? " collapsed" : ""}`}
          onClick={(event) => {
            const target = event.target as HTMLElement;
            if (target.closest(".stack-caret")) {
              return;
            }
            setFrameKey(key);
          }}
        >
          <div className="stack-node__row">
            {hasChildren ? (
              <button
                type="button"
                className="stack-caret"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFrameCollapse(key);
                }}
              >
                {collapsed ? "▸" : "▾"}
              </button>
            ) : (
              <span className="stack-caret stack-caret--empty" />
            )}
            <div>
              <strong>{entry.functionName ?? "Call"}</strong>
              <div className="stack-meta">
                {shortAddress(entry.caller)} → {shortAddress(entry.target)}
              </div>
              <div className="stack-meta">Depth {entry.depth ?? 0}</div>
              {entryError ? (
                <div className="stack-meta" style={{ color: "var(--sim-error)" }}>
                  {entryError}
                </div>
              ) : null}
            </div>
          </div>
          {hasChildren && !collapsed && (
            <div className="stack-children">
              <ul>{renderStackNodes(node.children ?? [])}</ul>
            </div>
          )}
        </li>
      );
    });

  const snapshotBadgeClass = (mnemonic?: string) => {
    if (!mnemonic) return "sim-op-badge default";
    if (mnemonic.startsWith("JUMP")) return "sim-op-badge jump";
    if (mnemonic === "REVERT") return "sim-op-badge revert";
    if (mnemonic.startsWith("S")) return "sim-op-badge storage";
    return "sim-op-badge default";
  };

  const rootEntry = entries[0] ?? null;
  const summaryEntry = rootEntry ?? activeFrameEntry;

  const summaryStatusLabel = payload?.success ? "Succeeded" : "Failed";
  const summaryModeLabel = formatModeLabel(payload?.mode);

  const networkBase =
    ((payload as any)?.networkName as string | undefined) ??
    (summaryTrace?.network as string | undefined) ??
    (summaryTrace?.chain as string | undefined) ??
    sampleChain?.name ??
    "Local";
  const chainId = (payload as any)?.chainId;
  const summaryNetwork = chainId
    ? `${networkBase} (Chain ID ${chainId})`
    : networkBase;

  const errorRaw =
    payload?.error ??
    payload?.revertReason ??
    summaryEntry?.result?.Revert?.reason ??
    summaryEntry?.result?.Error?.reason ??
    summaryEntry?.result?.Revert?.output ??
    summaryEntry?.result?.Error?.output ??
    null;
  const summaryError = errorRaw ? formatJson(errorRaw) : "—";

  const blockRaw =
    (payload as any)?.blockNumber ??
    (summaryTrace?.blockNumber as string | number | undefined) ??
    null;
  const timestampRaw =
    (payload as any)?.timestamp ??
    (payload as any)?.timestampIso ??
    (summaryTrace?.timestamp as string | number | undefined) ??
    null;

  const gasPriceRaw =
    summaryEntry?.gas_price ??
    (summaryEntry as any)?.transaction?.gasPrice ??
    (payload as any)?.gasPrice ??
    null;

  const gasUsedRaw =
    payload?.gasUsed ??
    (summaryEntry as any)?.gasUsed ??
    (summaryEntry?.result as any)?.gasUsed ??
    (summaryEntry as any)?.transaction?.gasUsed ??
    null;

  const gasLimitRaw =
    payload?.gasLimitSuggested ??
    (summaryEntry as any)?.transaction?.gas ??
    (summaryEntry as any)?.transaction?.gasLimit ??
    (summaryEntry as any)?.gas ??
    null;

  const nonceRaw =
    (summaryEntry as any)?.nonce ??
    (summaryEntry as any)?.transaction?.nonce ??
    null;

  const summaryHash =
    (payload as any)?.transactionHash ??
    (payload as any)?.txHash ??
    (payload as any)?.hash ??
    (payload as any)?.simulationId ??
    (payload as any)?.jobId ??
    (summaryTrace as any)?.transactionHash ??
    (summaryEntry as any)?.transaction?.hash ??
    (summaryEntry?.id !== undefined ? `frame-${summaryEntry.id}` : "—");

  const summaryFunction = decodeFunction(summaryEntry?.input);
  const summaryValue = formatValue(
    summaryEntry?.value ??
      (summaryEntry as any)?.transaction?.value ??
      "0x0"
  );
  const summaryCallType =
    Object.keys(summaryEntry?.call_type || {})[0] ?? "Call";
  const summaryGasPrice = formatNumeric(gasPriceRaw, "wei");
  const summaryGasUsedDisplay = formatNumeric(gasUsedRaw);
  const summaryGasLimitDisplay = formatNumeric(gasLimitRaw);
  const summaryGasUsed =
    summaryGasUsedDisplay !== "—" && summaryGasLimitDisplay !== "—"
      ? `${summaryGasUsedDisplay} / ${summaryGasLimitDisplay}`
      : summaryGasUsedDisplay;
  const summaryTxFee = formatTxFee(gasUsedRaw, gasPriceRaw);
  const summaryFrom = summaryEntry?.caller ?? "—";
  const summaryTo = summaryEntry?.target ?? "—";
  const summaryNonce = formatNumeric(nonceRaw);
  const summaryBlock = formatNumeric(blockRaw);
  const summaryTimestamp =
    typeof timestampRaw === "string" && timestampRaw.length
      ? timestampRaw
      : formatNumeric(timestampRaw);
  const summaryRawInput =
    summaryEntry?.input ??
    (summaryEntry as any)?.transaction?.data ??
    "0x";

  return (
    <div className="simulator-screen">
      <header className="sim-header">
        <div>
          <h1>Simulation</h1>
          <p>
            Sandbox UI to replicate Tenderly’s transaction view using recorded EDB
            output. Iterate here before integrating with the actual application.
          </p>
        </div>
        <div className={badgeClass}>{loading ? "Loading…" : statusPill}</div>
      </header>

      {payload ? (
        <section className="sim-summary-wrapper">
          <div className="sim-summary-panel">
            <header className="sim-summary-header">
              <div className="sim-summary-title">
                <strong>Simulation</strong>
                <span
                  className={`sim-summary-pill ${
                    payload.success ? "success" : "error"
                  }`}
                >
                  {summaryStatusLabel}
                </span>
                <span className="sim-summary-pill">{`Mode: ${summaryModeLabel}`}</span>
              </div>
              <div className="sim-summary-actions">
                <button className="sim-summary-action primary" type="button">
                  Re-run
                </button>
              </div>
            </header>

            <div className="sim-summary-columns">
              <div className="sim-summary-col">
                <dl className="sim-summary-rows">
                  <div className="sim-summary-row">
                    <dt>Hash</dt>
                    <dd>
                      <div className="sim-summary-address">
                        <span>{summaryHash}</span>
                        {summaryHash !== "—" ? (
                          <button
                            className="sim-summary-copy"
                            type="button"
                            onClick={() => handleCopy(summaryHash)}
                          >
                            Copy
                          </button>
                        ) : null}
                      </div>
                    </dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Network</dt>
                    <dd>{summaryNetwork}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Status</dt>
                    <dd>{summaryStatusLabel}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Error</dt>
                    <dd className="error">{summaryError}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Block</dt>
                    <dd>{summaryBlock}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Timestamp</dt>
                    <dd>{summaryTimestamp}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>From</dt>
                    <dd className="sim-summary-address">
                      <span>{summaryFrom}</span>
                      {summaryFrom !== "—" ? (
                        <button
                          className="sim-summary-copy"
                          type="button"
                          onClick={() => handleCopy(summaryFrom)}
                        >
                          Copy
                        </button>
                      ) : null}
                    </dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>To</dt>
                    <dd className="sim-summary-address">
                      <span>{summaryTo}</span>
                      {summaryTo !== "—" ? (
                        <button
                          className="sim-summary-copy"
                          type="button"
                          onClick={() => handleCopy(summaryTo)}
                        >
                          Copy
                        </button>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="sim-summary-col">
                <dl className="sim-summary-rows">
                  <div className="sim-summary-row">
                    <dt>Function</dt>
                    <dd>{summaryFunction}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Value</dt>
                    <dd>{summaryValue}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Tx Fee</dt>
                    <dd>{summaryTxFee}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Tx Type</dt>
                    <dd>{summaryCallType}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Gas Price</dt>
                    <dd>{summaryGasPrice}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Gas Used</dt>
                    <dd>{summaryGasUsed}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Nonce</dt>
                    <dd>{summaryNonce}</dd>
                  </div>
                  <div className="sim-summary-row">
                    <dt>Raw Input</dt>
                    <dd className="sim-summary-rawinput">
                      <span>{summaryRawInput}</span>
                      {summaryRawInput ? (
                        <button
                          className="sim-summary-copy"
                          type="button"
                          onClick={() => handleCopy(summaryRawInput)}
                        >
                          Copy
                        </button>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <nav className="sim-nav-tabs">
        {[
          { id: "summary", label: "Summary" },
          { id: "contracts", label: "Contracts" },
          { id: "events", label: "Events" },
          { id: "state", label: "State" },
          { id: "gas", label: "Gas Profiler" },
        ].map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id as SimulatorTab)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {error ? (
        <div className="sim-panel">
          <p style={{ color: "var(--sim-error)" }}>{error}</p>
        </div>
      ) : null}

      <section className={`sim-panel sim-tab-panel ${activeTab === "summary" ? "active" : ""}`}>
        <h2>Input and Output</h2>
        <div className="sim-input-output">
          <div className="sim-io-card">
            <header>
              <span>Input</span>
              <button
                className="copy-button"
                onClick={() => handleCopy(activeFrameEntry?.input ?? "0x")}
              >
                Copy
              </button>
            </header>
            <pre>{activeFrameEntry?.input ?? activeFrameEntry?.transaction?.data ?? "0x"}</pre>
          </div>
          <div className="sim-io-card">
            <header>
              <span>Output</span>
              <button
                className="copy-button"
                onClick={() => handleCopy(frameResultOutput)}
              >
                Copy
              </button>
            </header>
            <pre>{frameResultOutput}</pre>
          </div>
        </div>
      </section>

      <section className={`sim-panel sim-tab-panel ${activeTab === "summary" ? "active" : ""}`}>
        <div className="stack-header">
          <h2>Stack Trace</h2>
          <div className="stack-controls">
            <button onClick={expandAllFrames}>Expand</button>
            <button onClick={collapseAllFrames}>Collapse</button>
            <button className="sim-pill-button">Debug</button>
          </div>
        </div>
        {stackError ? (
          <div className="stack-error-banner">
            <strong>Error:</strong> {stackError}
          </div>
        ) : null}
        <ul className="stack-tree">{renderStackNodes(callTree)}</ul>
      </section>

      <section className={`sim-panel trace-log-panel ${activeTab === "summary" ? "active" : ""}`}>
        <div className="trace-toolbar">
          <div className="trace-toolbar-left">
            <button className="trace-tab active">All</button>
            <button className="trace-tab">Errors</button>
            <button className="trace-tab">Storage</button>
            <button className="trace-tab">Events</button>
            <button className="trace-tab">Go to Revert</button>
          </div>
          <div className="trace-toolbar-right">
            <div className="trace-toggle-group">
              {(["gas", "full", "storage", "events"] as const).map((key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={filters[key]}
                    onChange={(event) =>
                      setFilters((prev) => ({ ...prev, [key]: event.target.checked }))
                    }
                  />
                  {key}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="trace-log">
          {entries.length ? (
            entries.map((entry, index) => {
              const key = frameKeyFromEntry(entry);
              const rowError = getEntryError(entry);
              const callType = entry.call_type
                ? Object.keys(entry.call_type)[0]
                : "CALL";
              return (
                <div
                  key={`trace-log-${index}`}
                  className={`trace-log__row${frameKey === key ? " active" : ""}`}
                  onClick={() => setFrameKey(key)}
                >
                  <div className="trace-log__meta">
                    <span
                      className={`trace-log__op ${
                        rowError ? "trace-log__op--error" : "trace-log__op--call"
                      }`}
                    >
                      {callType}
                    </span>
                    <span>Depth {entry.depth ?? 0}</span>
                  </div>
                  <div className="trace-log__body">
                    <div className="trace-log__line">
                      <strong>{entry.functionName ?? decodeFunction(entry.input)}</strong>
                      <span>
                        {shortAddress(entry.caller)} → {shortAddress(entry.target)}
                      </span>
                    </div>
                    {rowError ? (
                      <div className="trace-log__error">{rowError}</div>
                    ) : null}
                  </div>
                </div>
              );
            })
          ) : (
            <p style={{ padding: 12, color: "var(--sim-text-muted)" }}>No trace entries.</p>
          )}
        </div>
      </section>

      <section className={`sim-panel sim-tab-panel ${activeTab === "summary" ? "active" : ""}`}>
        <h2>Execution Trace</h2>
        <div className="sim-trace-actions">
          <input
            type="search"
            placeholder="Search opcode or source…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="sim-filters">
            {Object.entries(filters).map(([key, value]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(event) =>
                    setFilters((prev) => ({ ...prev, [key]: event.target.checked }))
                  }
                />
                {key}
              </label>
            ))}
          </div>
        </div>
        <div className="sim-timeline-shell">
          <div className="sim-timeline-list">
            {!snapshotsForFrame.length ? (
              <p style={{ padding: 12 }}>No opcode snapshots.</p>
            ) : (
              snapshotsForFrame.map((snap) => (
                <div
                  className={`sim-timeline-row ${
                    snapshotId === snap.id ? "active" : ""
                  }`}
                  key={snap.id}
                  onClick={() => setSnapshotId(snap.id)}
                >
                  <div>
                    <div className={snapshotBadgeClass(snap.mnemonic)}>
                      {snap.mnemonic ?? "OP"}
                    </div>
                    <div className="meta">PC {snap.pc ?? "?"}</div>
                  </div>
                  <div className="meta">{snap.target ?? "—"}</div>
                </div>
              ))
            )}
          </div>
          <div className="sim-timeline-detail">
            {!activeSnapshot ? (
              <p style={{ padding: 12 }}>Select a snapshot.</p>
            ) : (
              <div className="sim-detail-card">
                <div className="sim-detail-grid">
                  <div className="sim-detail-box">
                    <h3>Opcode</h3>
                    <div>{activeSnapshot.mnemonic}</div>
                    <div>PC {activeSnapshot.pc ?? "?"}</div>
                  </div>
                  <div className="sim-detail-box">
                    <h3>Target</h3>
                    <div>{activeSnapshot.target ?? "—"}</div>
                    <div>Frame {frameKey ?? "—"}</div>
                  </div>
                  <div className="sim-detail-box">
                    <h3>Locals</h3>
                    <ul className="sim-locals-scroll">
                      {activeSnapshot.locals
                        ? Object.entries(activeSnapshot.locals).map(([key, value]) => (
                            <li key={key}>
                              <strong>{key}</strong>:{" "}
                              {typeof value === "string"
                                ? value
                                : JSON.stringify(value, null, 2)}
                            </li>
                          ))
                        : (
                            <li>No locals recorded.</li>
                          )}
                    </ul>
                  </div>
                  <div className="sim-detail-box">
                    <h3>Stack ({activeSnapshot.stack.length})</h3>
                    <ul className="sim-stack-scroll">
                      {activeSnapshot.stack.length ? (
                        activeSnapshot.stack.map((value, index) => (
                          <li key={`${value}-${index}`}>
                            #{index}: {value}
                          </li>
                        ))
                      ) : (
                        <li>Empty stack.</li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="sim-source-view">
            {!renderedSourceLines ? "Source preview unavailable." : renderedSourceLines}
          </div>
        </div>
        <div className="sim-events-storage">
          <h3
            style={{
              margin: "0 0 8px",
              fontSize: "0.74rem",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "var(--sim-text-muted)",
            }}
          >
            State & Events
          </h3>
          {filters.events && eventsForFrame.length ? (
            eventsForFrame.map((event: any, index) => (
              <div className="sim-event-item" key={`${event?.name ?? "event"}-${index}`}>
                <strong>{event?.name ?? event?.signature ?? "Event"}</strong>
                <div>
                  <small>{event?.address ?? ""}</small>
                </div>
                <pre>{JSON.stringify(event?.decoded ?? event?.data, null, 2)}</pre>
              </div>
            ))
          ) : filters.events ? (
            <p>No events.</p>
          ) : null}
          {filters.storage && filteredStorageDiffs.length ? (
            filteredStorageDiffs.map((entry, index) => (
              <div className="sim-storage-item" key={`${entry.slot ?? entry.key}-${index}`}>
                <strong>Storage slot {entry.slot ?? entry.key}</strong>
                <div>
                  <small>Before</small> <code>{entry.before ?? "—"}</code>
                </div>
                <div>
                  <small>After</small>{" "}
                  <code>{entry.after ?? entry.value ?? "—"}</code>
                </div>
              </div>
            ))
          ) : filters.storage ? (
            <p>No storage diffs.</p>
          ) : null}
        </div>
      </section>

      <section className={`sim-panel sim-tab-panel ${activeTab === "contracts" ? "active" : ""}`}>
        <h2>Contracts Overview</h2>
        <p style={{ color: "var(--sim-text-muted)", marginBottom: 12 }}>
          Inspect each frame’s caller/target breakdown. Click on any node to jump
          back into the execution trace.
        </p>
        <div className="sim-stack-list">{renderCallTree(callTree)}</div>
      </section>

      <section className={`sim-panel sim-tab-panel ${activeTab === "events" ? "active" : ""}`}>
        <h2>Events Highlight</h2>
        {eventsForFrame.length ? (
          eventsForFrame.map((event: any, index) => (
            <div className="sim-event-item" key={`${event?.signature ?? "event"}-${index}`}>
              <strong>{event?.name ?? event?.signature ?? "Event"}</strong>
              <div>
                <small>{event?.address ?? ""}</small>
              </div>
              <pre>{JSON.stringify(event?.decoded ?? event?.data, null, 2)}</pre>
            </div>
          ))
        ) : (
          <p>No events recorded for this frame.</p>
        )}
      </section>

      <section className={`sim-panel sim-tab-panel ${activeTab === "state" ? "active" : ""}`}>
        <h2>State Changes</h2>
        {filteredStorageDiffs.length ? (
          filteredStorageDiffs.map((entry, index) => (
            <div className="sim-storage-item" key={`${entry.slot ?? entry.key}-${index}`}>
              <strong>Slot {entry.slot ?? entry.key}</strong>
              <div>
                <small>Before</small> <code>{entry.before ?? "—"}</code>
              </div>
              <div>
                <small>After</small> <code>{entry.after ?? entry.value ?? "—"}</code>
              </div>
            </div>
          ))
        ) : (
          <p>No storage diffs recorded for this frame.</p>
        )}
      </section>

      <section className={`sim-panel sim-tab-panel ${activeTab === "gas" ? "active" : ""}`}>
        <h2>Gas Profiler</h2>
        <p style={{ color: "var(--sim-text-muted)" }}>
          Snapshot-level gas usage will stream directly from the bridge once the
          engine emits `gas_used` per opcode. For now, aggregate gas used is{" "}
          <strong>{payload?.gasUsed ?? "N/A"}</strong> with suggested limit{" "}
          <strong>{payload?.gasLimitSuggested ?? "N/A"}</strong>.
        </p>
      </section>

      <section className="sim-panel sim-reference">
        <div>
          <h2>Simulator Data · EDB vs Tenderly</h2>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>EDB (engine + RPC)</th>
                <th>Tenderly (UI)</th>
              </tr>
            </thead>
            <tbody>
              {simulatorDataRows.map((row) => (
                <tr key={row.category}>
                  <td>{row.category}</td>
                  <td>{row.edb}</td>
                  <td>{row.tenderly}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <h2>Capability Comparison</h2>
          <table>
            <thead>
              <tr>
                <th>Capability</th>
                <th>EDB</th>
                <th>Tenderly</th>
              </tr>
            </thead>
            <tbody>
              {capabilityComparison.map((row) => (
                <tr key={row.capability}>
                  <td>{row.capability}</td>
                  <td>{row.edb}</td>
                  <td>{row.tenderly}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ marginTop: 8, color: "var(--sim-text-muted)", fontSize: "0.78rem" }}>
            Legend: ✅ available out of the box · ⚠️ partial/manual · ✖️ not supported.
          </p>
        </div>
      </section>

      <section className="sim-panel sim-raw-panel">
        <h2>Raw Payload</h2>
        <pre>{payload ? JSON.stringify(payload, null, 2) : "Loading…"}</pre>
      </section>
    </div>
  );
};

export default SimulatorWorkbench;
