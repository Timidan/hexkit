// Chain-agnostic execution-tree shell.
//
// Owns the visual tree machinery — depth guides, collapse/expand,
// active rails, selected-row highlight, scroll. Knows nothing about
// opcodes, Sierra statements, or any chain's call shape; the caller
// pre-computes `ExecutionTreeShellRow[]` and supplies a click handler.
//
// The chain wrapper supplies the filter dropdown via the optional
// `filterToolbar` slot — EVM passes its summarized/storage/events
// filter, Starknet can pass a callId-grouping toggle, etc.

import React, { useCallback, useMemo, useState } from "react";
import { Warning, Minus, Plus } from "@phosphor-icons/react";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { cn } from "../../../lib/utils";
import "../ExecutionTree.css";

export interface ExecutionTreeShellRow {
  /** Stable identity. The shell uses this for selection + collapse state. */
  id: string;
  /** Visible label ("transfer", "CALL", "set_locking_contract", …). */
  name: string;
  /** 0-based indent depth. The shell renders one rail per unit. */
  depth: number;
  /** Marks the row red and shows a warning icon. */
  isRevert?: boolean;
  /** Renders the row in the "function" type style (slightly emphasized). */
  isFunction?: boolean;
  /** Optional secondary chip after the name ("Erc20", "STRK", …). */
  contractName?: string;
  /** Additional compact chips after the main secondary label. */
  secondaryChips?: string[];
  /** Does the next row sit at a deeper depth? Drives the [+] toggle. */
  hasChildren: boolean;
}

export interface ExecutionTreeShellProps<TRow extends ExecutionTreeShellRow = ExecutionTreeShellRow> {
  className?: string;
  /** Already-filtered, in display order. */
  rows: TRow[];
  /** Highlights the active row. */
  selectedRowId: string | null;
  onSelect: (row: TRow) => void;
  /** Optional filter / toolbar slot rendered in the header. EVM puts its
   *  Display:[Summarized|Verbose|…] dropdown here; chains can pass any
   *  controls (or omit entirely). */
  filterToolbar?: React.ReactNode;
  emptyMessage?: string;
  title?: string;
}

function applyCollapseFilter<TRow extends ExecutionTreeShellRow>(
  rows: TRow[],
  collapsedIds: Set<string>,
): TRow[] {
  const result: TRow[] = [];
  const collapsedDepths: number[] = [];

  for (const row of rows) {
    while (
      collapsedDepths.length > 0 &&
      row.depth <= collapsedDepths[collapsedDepths.length - 1]
    ) {
      collapsedDepths.pop();
    }
    if (collapsedDepths.length > 0) continue;
    result.push(row);
    if (collapsedIds.has(row.id)) {
      collapsedDepths.push(row.depth);
    }
  }
  return result;
}

function calculateActiveRails<TRow extends ExecutionTreeShellRow>(
  rows: TRow[],
): Map<number, Set<number>> {
  const railsMap = new Map<number, Set<number>>();
  const parentStack: Array<{ depth: number; endIdx: number }> = [];

  rows.forEach((row, idx) => {
    const depth = row.depth;
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].endIdx < idx) {
      parentStack.pop();
    }
    while (parentStack.length > 0 && parentStack[parentStack.length - 1].depth >= depth) {
      parentStack.pop();
    }
    const nextRow = rows[idx + 1];
    const hasVisibleChildren = nextRow !== undefined && nextRow.depth > depth;

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
    if (hasVisibleChildren) {
      let endIdx = idx;
      for (let i = idx + 1; i < rows.length; i++) {
        if (rows[i].depth <= depth) break;
        endIdx = i;
      }
      if (endIdx > idx) {
        parentStack.push({ depth, endIdx });
      }
    }
  });
  return railsMap;
}

const ExecutionRow: React.FC<{
  row: ExecutionTreeShellRow;
  isSelected: boolean;
  isCollapsed: boolean;
  activeRails: Set<number> | undefined;
  hasVisibleChildren: boolean;
  onSelect: () => void;
  onToggleCollapse: (e: React.MouseEvent) => void;
}> = ({
  row,
  isSelected,
  isCollapsed,
  activeRails,
  hasVisibleChildren,
  onSelect,
  onToggleCollapse,
}) => {
  return (
    <div
      className={cn(
        "execution-tree__node",
        isSelected && "execution-tree__node--selected",
        row.isRevert && "execution-tree__node--revert",
        row.isFunction && "execution-tree__node--function",
      )}
      onClick={onSelect}
    >
      {row.depth > 0 && (
        <div className="execution-tree__guides">
          {Array.from({ length: row.depth }).map((_, idx) => (
            <span
              key={idx}
              className={cn(
                "execution-tree__guide",
                activeRails?.has(idx + 1) && "execution-tree__guide--active",
              )}
            />
          ))}
        </div>
      )}

      {hasVisibleChildren ? (
        <Button
          type="button"
          variant="icon-borderless"
          size="icon-inline"
          className="execution-tree__toggle"
          onClick={onToggleCollapse}
          title={isCollapsed ? "Expand" : "Collapse"}
          aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${row.name}`}
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

      <div className="execution-tree__label">
        {row.isRevert && <Warning className="h-3 w-3 text-destructive mr-1" />}
        <span
          className={cn(
            "execution-tree__name",
            !row.isFunction && "execution-tree__name--opcode",
            row.isFunction && "execution-tree__name--function",
          )}
        >
          {row.name}
        </span>
        {row.contractName && row.isFunction && (
          <span className="execution-tree__contract">{row.contractName}</span>
        )}
        {row.secondaryChips?.map((chip) => (
          <span key={chip} className="execution-tree__secondary-chip">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
};

function ExecutionTreeShellInner<TRow extends ExecutionTreeShellRow>({
  className,
  rows,
  selectedRowId,
  onSelect,
  filterToolbar,
  emptyMessage = "No execution data available",
  title = "Execution",
}: ExecutionTreeShellProps<TRow>) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  const handleToggleCollapse = useCallback((rowId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);

  const visibleRows = useMemo(
    () => applyCollapseFilter(rows, collapsedIds),
    [rows, collapsedIds],
  );

  const rowHasVisibleChildren = useMemo(() => {
    const map = new Map<string, boolean>();
    for (let i = 0; i < visibleRows.length; i++) {
      const row = visibleRows[i];
      const nextRow = visibleRows[i + 1];
      map.set(row.id, nextRow !== undefined && nextRow.depth > row.depth);
    }
    return map;
  }, [visibleRows]);

  const rowCanCollapse = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const row of rows) {
      map.set(row.id, row.hasChildren);
    }
    return map;
  }, [rows]);

  const activeRailsMap = useMemo(() => calculateActiveRails(visibleRows), [visibleRows]);

  if (rows.length === 0) {
    return (
      <div className={cn("execution-tree execution-tree--empty", className)}>
        <p className="text-xs text-muted-foreground p-4">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("execution-tree", className)}>
      <div className="execution-tree__header">
        <div className="execution-tree__title">
          <span className="execution-tree__title-text">{title}</span>
        </div>
        {filterToolbar && (
          <div className="execution-tree__filter">{filterToolbar}</div>
        )}
      </div>

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
              const showToggle = canCollapse;

              return (
                <ExecutionRow
                  key={row.id}
                  row={row}
                  isSelected={row.id === selectedRowId}
                  isCollapsed={collapsedIds.has(row.id)}
                  activeRails={activeRailsMap.get(idx)}
                  hasVisibleChildren={showToggle}
                  onSelect={() => onSelect(row)}
                  onToggleCollapse={(e) => handleToggleCollapse(row.id, e)}
                />
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export const ExecutionTreeShell = React.memo(
  ExecutionTreeShellInner,
) as typeof ExecutionTreeShellInner;

export default ExecutionTreeShell;
