/**
 * Execution Tree Component
 *
 * Displays a hierarchical view of function calls and opcodes,
 *
 * Uses a FLAT LIST approach (like TraceViewer) where:
 * - Rows are rendered in order with depth-based indentation
 * - Collapse works by hiding rows with deeper depth
 * - No complex tree structure needed
 */

import React, { useState, useCallback, useMemo } from 'react';
import { AlertTriangle, Filter, Minus, Plus } from 'lucide-react';
import { useDebug } from '../../contexts/DebugContext';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../../lib/utils';
import type { SnapshotListItem } from '../../types/debug';
import type { DecodedTraceRow } from '../../utils/traceDecoder';
import './ExecutionTree.css';

/** Display filter options for the execution tree */
type DisplayFilter = 'summarized' | 'verbose' | 'functions' | 'storage' | 'events' | 'calls';

/** Opcodes that represent storage access */
const STORAGE_OPCODES = ['SLOAD', 'SSTORE'];

/** Opcodes that represent event emission */
const EVENT_OPCODES = ['LOG0', 'LOG1', 'LOG2', 'LOG3', 'LOG4'];

/** Opcodes that represent external calls */
const CALL_OPCODES = ['CALL', 'STATICCALL', 'DELEGATECALL', 'CALLCODE', 'CREATE', 'CREATE2'];

const FILTER_OPTIONS: { value: DisplayFilter; label: string }[] = [
  { value: 'summarized', label: 'Summarized' },
  { value: 'verbose', label: 'Full Trace' },
  { value: 'functions', label: 'Functions Only' },
  { value: 'storage', label: 'Storage Access' },
  { value: 'events', label: 'Event Logs' },
  { value: 'calls', label: 'External Calls' },
];

interface ExecutionTreeProps {
  className?: string;
  /** Trace rows from decodedTrace (preferred data source) */
  traceRows?: DecodedTraceRow[];
}

/** Flattened row for display */
interface FlatRow {
  id: string;
  name: string;
  depth: number;
  snapshotId: number;
  isRevert: boolean;
  isFunction: boolean;
  contractName?: string;
  hasChildren: boolean; // Based on next row's depth
}

/**
 * Filter decoded trace rows based on display filter
 */
function filterDecodedTraceRows(
  rows: DecodedTraceRow[],
  filter: DisplayFilter
): DecodedTraceRow[] {
  if (filter === 'verbose') {
    return rows;
  }

  return rows.filter((row) => {
    const opcodeName = row.name || '';

    switch (filter) {
      case 'summarized':
        if (row.isInternalCall) return true;
        if (CALL_OPCODES.includes(opcodeName)) return true;
        if (STORAGE_OPCODES.includes(opcodeName)) return true;
        if (EVENT_OPCODES.includes(opcodeName)) return true;
        if (opcodeName === 'REVERT' || opcodeName === 'INVALID') return true;
        return false;
      case 'functions':
        return row.isInternalCall || CALL_OPCODES.includes(opcodeName);
      case 'storage':
        return STORAGE_OPCODES.includes(opcodeName);
      case 'events':
        return EVENT_OPCODES.includes(opcodeName);
      case 'calls':
        return CALL_OPCODES.includes(opcodeName);
      default:
        return true;
    }
  });
}

/**
 * Convert decoded trace rows to flat rows for display
 * hasChildren is computed based on the filtered rows (next row depth > current depth)
 */
function toFlatRows(rows: DecodedTraceRow[]): FlatRow[] {
  const result: FlatRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const depth = row.visualDepth ?? row.depth ?? 0;

    // Compute hasChildren from the next row in the filtered list
    const nextRow = rows[i + 1];
    const nextDepth = nextRow ? (nextRow.visualDepth ?? nextRow.depth ?? 0) : 0;
    const hasChildren = nextRow !== undefined && nextDepth > depth;

    const isCallOpcode = CALL_OPCODES.includes(row.name);
    const isFunction = row.isInternalCall || isCallOpcode;

    // Determine display name
    let displayName: string;
    if (row.isInternalCall && row.destFn) {
      displayName = row.destFn;
    } else if (row.name === 'CALL') {
      displayName = 'CALL';
    } else if (row.name === 'DELEGATECALL' || row.name === 'STATICCALL') {
      displayName = row.entryMeta?.function || row.name;
    } else if (EVENT_OPCODES.includes(row.name) && row.decodedLog?.name) {
      displayName = row.decodedLog.name;
    } else {
      displayName = row.name || 'OP';
    }

    // Get contract name
    const contractName = row.contract
      || row.entryMeta?.codeContractName
      || row.entryMeta?.targetContractName
      || undefined;

    result.push({
      id: String(row.id),
      name: displayName,
      depth,
      snapshotId: row.id,
      isRevert: row.name === 'REVERT',
      isFunction,
      contractName,
      hasChildren,
    });
  }

  return result;
}

/**
 * Filter snapshots based on display filter (fallback for when traceRows not available)
 */
function filterSnapshots(
  snapshots: SnapshotListItem[],
  filter: DisplayFilter
): SnapshotListItem[] {
  if (filter === 'verbose') {
    return snapshots;
  }

  return snapshots.filter((snap) => {
    if (snap.type === 'hook') {
      return filter === 'summarized' || filter === 'functions' || filter === 'calls';
    }

    if (snap.type === 'opcode' && snap.opcodeName) {
      switch (filter) {
        case 'summarized':
          if (CALL_OPCODES.includes(snap.opcodeName)) return true;
          if (STORAGE_OPCODES.includes(snap.opcodeName)) return true;
          if (EVENT_OPCODES.includes(snap.opcodeName)) return true;
          if (snap.opcodeName === 'REVERT' || snap.opcodeName === 'INVALID') return true;
          return false;
        case 'functions':
          return CALL_OPCODES.includes(snap.opcodeName);
        case 'storage':
          return STORAGE_OPCODES.includes(snap.opcodeName);
        case 'events':
          return EVENT_OPCODES.includes(snap.opcodeName);
        case 'calls':
          return CALL_OPCODES.includes(snap.opcodeName);
        default:
          return true;
      }
    }

    return true;
  });
}

/**
 * Convert snapshots to flat rows (fallback)
 */
function snapshotsToFlatRows(snapshots: SnapshotListItem[]): FlatRow[] {
  const result: FlatRow[] = [];
  let currentDepth = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const nextSnap = snapshots[i + 1];

    if (snap.type === 'hook' && snap.functionName) {
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
    } else if (snap.type === 'opcode' && snap.opcodeName) {
      result.push({
        id: `op-${snap.id}`,
        name: snap.opcodeName,
        depth: currentDepth,
        snapshotId: snap.id,
        isRevert: snap.opcodeName === 'REVERT',
        isFunction: CALL_OPCODES.includes(snap.opcodeName),
        hasChildren: false,
      });
    }
  }

  // Recalculate hasChildren based on actual depths
  for (let i = 0; i < result.length; i++) {
    const row = result[i];
    const nextRow = result[i + 1];
    row.hasChildren = nextRow !== undefined && nextRow.depth > row.depth;
  }

  return result;
}

/**
 * Apply collapse filtering to flat rows
 * When a row is collapsed, hide all following rows with deeper depth
 */
function applyCollapseFilter(rows: FlatRow[], collapsedIds: Set<string>): FlatRow[] {
  const result: FlatRow[] = [];
  const collapsedDepths: number[] = []; // Stack of depths where ancestors are collapsed

  for (const row of rows) {
    // Pop collapsed ancestors that we've exited (depth <= their depth)
    while (
      collapsedDepths.length > 0 &&
      row.depth <= collapsedDepths[collapsedDepths.length - 1]
    ) {
      collapsedDepths.pop();
    }

    // If we're inside a collapsed ancestor, skip this row
    if (collapsedDepths.length > 0) {
      continue;
    }

    // This row is visible
    result.push(row);

    // If this row is collapsed, add its depth to the stack
    if (collapsedIds.has(row.id)) {
      collapsedDepths.push(row.depth);
    }
  }

  return result;
}

/**
 * Calculate active rails for each row
 */
function calculateActiveRails(rows: FlatRow[]): Map<number, Set<number>> {
  const railsMap = new Map<number, Set<number>>();
  const parentStack: Array<{ depth: number; endIdx: number }> = [];

  rows.forEach((row, idx) => {
    const depth = row.depth;

    // Pop parents that have ended
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].endIdx < idx) {
      parentStack.pop();
    }

    // Pop parents at same or deeper depth
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].depth >= depth) {
      parentStack.pop();
    }

    // Check if this row has visible children
    const nextRow = rows[idx + 1];
    const hasVisibleChildren = nextRow !== undefined && nextRow.depth > depth;

    // Record active rails
    const activeDepths = new Set<number>();
    for (const parent of parentStack) {
      activeDepths.add(parent.depth + 1);
    }

    if (hasVisibleChildren) {
      activeDepths.add(depth + 1);
    }

    if (activeDepths.size > 0) {
      railsMap.set(idx, activeDepths);
    }

    // If this row has children, add to stack
    if (hasVisibleChildren) {
      let endIdx = idx;
      for (let i = idx + 1; i < rows.length; i++) {
        if (rows[i].depth <= depth) {
          break;
        }
        endIdx = i;
      }

      if (endIdx > idx) {
        parentStack.push({ depth, endIdx });
      }
    }
  });

  return railsMap;
}

/**
 * Row component
 */
const ExecutionRow: React.FC<{
  row: FlatRow;
  index: number;
  isSelected: boolean;
  isCollapsed: boolean;
  activeRails: Set<number> | undefined;
  hasVisibleChildren: boolean;
  onSelect: () => void;
  onToggleCollapse: (e: React.MouseEvent) => void;
}> = ({ row, isSelected, isCollapsed, activeRails, hasVisibleChildren, onSelect, onToggleCollapse }) => {
  return (
    <div
      className={cn(
        'execution-tree__node',
        isSelected && 'execution-tree__node--selected',
        row.isRevert && 'execution-tree__node--revert',
        row.isFunction && 'execution-tree__node--function'
      )}
      onClick={onSelect}
    >
      {/* Vertical rails */}
      {row.depth > 0 && (
        <div className="execution-tree__guides">
          {Array.from({ length: row.depth }).map((_, idx) => (
            <span
              key={idx}
              className={cn(
                'execution-tree__guide',
                activeRails?.has(idx + 1) && 'execution-tree__guide--active'
              )}
            />
          ))}
        </div>
      )}

      {/* Collapse toggle */}
      {hasVisibleChildren ? (
        <Button
          type="button"
          variant="icon-borderless"
          size="icon-inline"
          className="execution-tree__toggle"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? (
            <Plus size={12} strokeWidth={2} />
          ) : (
            <Minus size={12} strokeWidth={2} />
          )}
        </Button>
      ) : (
        <span className="execution-tree__toggle-spacer" />
      )}

      {/* Label */}
      <div className="execution-tree__label">
        {row.isRevert && (
          <AlertTriangle className="h-3 w-3 text-destructive mr-1" />
        )}
        <span className={cn(
          'execution-tree__name',
          !row.isFunction && 'execution-tree__name--opcode',
          row.isFunction && 'execution-tree__name--function'
        )}>
          {row.name}
        </span>
        {row.contractName && row.isFunction && (
          <span className="execution-tree__contract">
            {row.contractName}
          </span>
        )}
      </div>
    </div>
  );
};

/**
 * Main Execution Tree component
 */
export const ExecutionTree: React.FC<ExecutionTreeProps> = React.memo(({ className, traceRows }) => {
  const { snapshotList, currentSnapshotId, goToSnapshot } = useDebug();
  const [displayFilter, setDisplayFilter] = useState<DisplayFilter>('summarized');
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Toggle collapse
  const handleToggleCollapse = useCallback((rowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }, []);

  // Determine data source
  const useTraceRows = traceRows && traceRows.length > 0;

  // Get filtered flat rows (before collapse)
  const filteredRows = useMemo(() => {
    if (useTraceRows) {
      const filtered = filterDecodedTraceRows(traceRows!, displayFilter);
      return toFlatRows(filtered);
    } else {
      const filtered = filterSnapshots(snapshotList, displayFilter);
      return snapshotsToFlatRows(filtered);
    }
  }, [useTraceRows, traceRows, snapshotList, displayFilter]);

  // Apply collapse filtering
  const visibleRows = useMemo(() => {
    return applyCollapseFilter(filteredRows, collapsedIds);
  }, [filteredRows, collapsedIds]);

  // Recalculate hasChildren for visible rows (after collapse filtering)
  const rowHasVisibleChildren = useMemo(() => {
    const map = new Map<string, boolean>();
    for (let i = 0; i < visibleRows.length; i++) {
      const row = visibleRows[i];
      const nextRow = visibleRows[i + 1];
      map.set(row.id, nextRow !== undefined && nextRow.depth > row.depth);
    }
    return map;
  }, [visibleRows]);

  // For showing toggle: use pre-collapse hasChildren (so collapsed parents still show toggle)
  const rowCanCollapse = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of filteredRows) {
      map.set(row.id, row.hasChildren);
    }
    return map;
  }, [filteredRows]);

  // Calculate rails
  const activeRailsMap = useMemo(() => calculateActiveRails(visibleRows), [visibleRows]);

  // Find selected row
  const selectedRowId = useMemo(() => {
    if (currentSnapshotId === null) return null;
    const found = visibleRows.find(r => r.snapshotId === currentSnapshotId);
    return found?.id ?? null;
  }, [visibleRows, currentSnapshotId]);

  // Handle row selection
  const handleSelect = useCallback((row: FlatRow) => {
    goToSnapshot(row.snapshotId);
  }, [goToSnapshot]);

  // Data count for empty check
  const dataCount = useTraceRows ? traceRows!.length : snapshotList.length;

  if (dataCount === 0) {
    return (
      <div className={cn('execution-tree execution-tree--empty', className)}>
        <p className="text-xs text-muted-foreground p-4">
          No execution data available
        </p>
      </div>
    );
  }

  return (
    <div className={cn('execution-tree', className)}>
      {/* Header */}
      <div className="execution-tree__header">
        <div className="execution-tree__title">
          <span className="execution-tree__title-text">Execution</span>
        </div>
        <div className="execution-tree__filter">
          <Select
            value={displayFilter}
            onValueChange={(value) => setDisplayFilter(value as DisplayFilter)}
          >
            <SelectTrigger size="sm" className="execution-tree__filter-trigger">
              <Filter className="h-3 w-3 mr-1" />
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
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="execution-tree__scroll">
        <div className="execution-tree__content">
          {visibleRows.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4">
              No items match the current filter
            </p>
          ) : (
            visibleRows.map((row, idx) => {
              const canCollapse = rowCanCollapse.get(row.id) ?? false;
              const hasVisibleChildren = rowHasVisibleChildren.get(row.id) ?? false;
              // Show toggle if row can collapse (had children before collapse filter)
              const showToggle = canCollapse;

              return (
                <ExecutionRow
                  key={row.id}
                  row={row}
                  index={idx}
                  isSelected={row.id === selectedRowId}
                  isCollapsed={collapsedIds.has(row.id)}
                  activeRails={activeRailsMap.get(idx)}
                  hasVisibleChildren={showToggle}
                  onSelect={() => handleSelect(row)}
                  onToggleCollapse={(e) => handleToggleCollapse(row.id, e)}
                />
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

ExecutionTree.displayName = 'ExecutionTree';

export default ExecutionTree;
