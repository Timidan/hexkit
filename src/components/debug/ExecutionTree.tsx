import React, { useMemo, useState } from "react";
import { Funnel } from "@phosphor-icons/react";
import { useDebug } from "../../contexts/DebugContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import type { SnapshotListItem } from "../../types/debug";
import type { DecodedTraceRow } from "../../utils/traceDecoder";
import {
  ExecutionTreeShell,
  type ExecutionTreeShellRow,
} from "./shells/ExecutionTreeShell";

type DisplayFilter =
  | "summarized"
  | "verbose"
  | "functions"
  | "storage"
  | "events"
  | "calls";

const STORAGE_OPCODES = ["SLOAD", "SSTORE"];
const EVENT_OPCODES = ["LOG0", "LOG1", "LOG2", "LOG3", "LOG4"];
const CALL_OPCODES = [
  "CALL",
  "STATICCALL",
  "DELEGATECALL",
  "CALLCODE",
  "CREATE",
  "CREATE2",
];

const FILTER_OPTIONS: { value: DisplayFilter; label: string }[] = [
  { value: "summarized", label: "Summarized" },
  { value: "verbose", label: "Full Trace" },
  { value: "functions", label: "Functions Only" },
  { value: "storage", label: "Storage Access" },
  { value: "events", label: "Event Logs" },
  { value: "calls", label: "External Calls" },
];

interface EvmExecutionRow extends ExecutionTreeShellRow {
  snapshotId: number;
}

interface ExecutionTreeProps {
  className?: string;
  traceRows?: DecodedTraceRow[];
}

function filterDecodedTraceRows(
  rows: DecodedTraceRow[],
  filter: DisplayFilter,
): DecodedTraceRow[] {
  if (filter === "verbose") return rows;
  return rows.filter((row) => {
    const opcodeName = row.name || "";
    switch (filter) {
      case "summarized":
        if (row.isInternalCall) return true;
        if (CALL_OPCODES.includes(opcodeName)) return true;
        if (STORAGE_OPCODES.includes(opcodeName)) return true;
        if (EVENT_OPCODES.includes(opcodeName)) return true;
        if (opcodeName === "REVERT" || opcodeName === "INVALID") return true;
        return false;
      case "functions":
        return row.isInternalCall || CALL_OPCODES.includes(opcodeName);
      case "storage":
        return STORAGE_OPCODES.includes(opcodeName);
      case "events":
        return EVENT_OPCODES.includes(opcodeName);
      case "calls":
        return CALL_OPCODES.includes(opcodeName);
      default:
        return true;
    }
  });
}

function toFlatRows(rows: DecodedTraceRow[]): EvmExecutionRow[] {
  const result: EvmExecutionRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const depth = row.visualDepth ?? row.depth ?? 0;
    const nextRow = rows[i + 1];
    const nextDepth = nextRow ? (nextRow.visualDepth ?? nextRow.depth ?? 0) : 0;
    const hasChildren = nextRow !== undefined && nextDepth > depth;

    const isCallOpcode = CALL_OPCODES.includes(row.name);
    const isFunction = row.isInternalCall || isCallOpcode;

    let displayName: string;
    if (row.isInternalCall && row.destFn) {
      displayName = row.destFn;
    } else if (row.name === "CALL") {
      displayName = "CALL";
    } else if (row.name === "DELEGATECALL" || row.name === "STATICCALL") {
      displayName = row.entryMeta?.function || row.name;
    } else if (EVENT_OPCODES.includes(row.name) && row.decodedLog?.name) {
      displayName = row.decodedLog.name;
    } else {
      displayName = row.name || "OP";
    }

    const contractName =
      row.contract ||
      row.entryMeta?.codeContractName ||
      row.entryMeta?.targetContractName ||
      undefined;

    result.push({
      id: String(row.id),
      name: displayName,
      depth,
      snapshotId: row.id,
      isRevert: row.name === "REVERT",
      isFunction,
      contractName,
      hasChildren,
    });
  }
  return result;
}

function filterSnapshots(
  snapshots: SnapshotListItem[],
  filter: DisplayFilter,
): SnapshotListItem[] {
  if (filter === "verbose") return snapshots;
  return snapshots.filter((snap) => {
    if (snap.type === "hook") {
      return filter === "summarized" || filter === "functions" || filter === "calls";
    }
    if (snap.type === "opcode" && snap.opcodeName) {
      switch (filter) {
        case "summarized":
          if (CALL_OPCODES.includes(snap.opcodeName)) return true;
          if (STORAGE_OPCODES.includes(snap.opcodeName)) return true;
          if (EVENT_OPCODES.includes(snap.opcodeName)) return true;
          if (snap.opcodeName === "REVERT" || snap.opcodeName === "INVALID") return true;
          return false;
        case "functions":
          return CALL_OPCODES.includes(snap.opcodeName);
        case "storage":
          return STORAGE_OPCODES.includes(snap.opcodeName);
        case "events":
          return EVENT_OPCODES.includes(snap.opcodeName);
        case "calls":
          return CALL_OPCODES.includes(snap.opcodeName);
        default:
          return true;
      }
    }
    return true;
  });
}

function snapshotsToFlatRows(snapshots: SnapshotListItem[]): EvmExecutionRow[] {
  const result: EvmExecutionRow[] = [];
  let currentDepth = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const nextSnap = snapshots[i + 1];

    if (snap.type === "hook" && snap.functionName) {
      const hasChildren = nextSnap !== undefined;
      result.push({
        id: `func-${snap.id}`,
        name: snap.functionName,
        depth: currentDepth,
        snapshotId: snap.id,
        isRevert: false,
        isFunction: true,
        hasChildren,
      });
      currentDepth = 1;
    } else if (snap.type === "opcode" && snap.opcodeName) {
      result.push({
        id: `op-${snap.id}`,
        name: snap.opcodeName,
        depth: currentDepth,
        snapshotId: snap.id,
        isRevert: snap.opcodeName === "REVERT",
        isFunction: CALL_OPCODES.includes(snap.opcodeName),
        hasChildren: false,
      });
    }
  }

  for (let i = 0; i < result.length; i++) {
    const row = result[i];
    const nextRow = result[i + 1];
    row.hasChildren = nextRow !== undefined && nextRow.depth > row.depth;
  }
  return result;
}

export const ExecutionTree: React.FC<ExecutionTreeProps> = React.memo(
  ({ className, traceRows }) => {
    const { snapshotList, currentSnapshotId, goToSnapshot } = useDebug();
    const [displayFilter, setDisplayFilter] = useState<DisplayFilter>("summarized");

    const useTraceRows = traceRows && traceRows.length > 0;

    const filteredRows = useMemo<EvmExecutionRow[]>(() => {
      if (useTraceRows) {
        const filtered = filterDecodedTraceRows(traceRows!, displayFilter);
        return toFlatRows(filtered);
      }
      const filtered = filterSnapshots(snapshotList, displayFilter);
      return snapshotsToFlatRows(filtered);
    }, [useTraceRows, traceRows, snapshotList, displayFilter]);

    const selectedRowId = useMemo<string | null>(() => {
      if (currentSnapshotId === null) return null;
      const found = filteredRows.find((r) => r.snapshotId === currentSnapshotId);
      return found?.id ?? null;
    }, [filteredRows, currentSnapshotId]);

    const filterToolbar = (
      <Select
        value={displayFilter}
        onValueChange={(value) => setDisplayFilter(value as DisplayFilter)}
      >
        <SelectTrigger size="sm" className="execution-tree__filter-trigger">
          <Funnel className="h-3 w-3 mr-1" />
          <SelectValue placeholder="Display" />
        </SelectTrigger>
        <SelectContent>
          {FILTER_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );

    return (
      <ExecutionTreeShell<EvmExecutionRow>
        className={className}
        rows={filteredRows}
        selectedRowId={selectedRowId}
        onSelect={(row) => goToSnapshot(row.snapshotId)}
        filterToolbar={filterToolbar}
      />
    );
  },
);

ExecutionTree.displayName = "ExecutionTree";

export default ExecutionTree;
