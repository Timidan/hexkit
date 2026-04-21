/**
 * Frame hierarchy, collapsed ranges, visibility, and visual-rail helpers
 * for the execution trace viewer. */

import type { TraceRow, TraceFilters, FrameHierarchyEntry } from "./traceTypes";

// ---- frame hierarchy --------------------------------------------------

export function buildFrameHierarchy(
  traceRows: TraceRow[],
): Map<string, FrameHierarchyEntry> {
  const hierarchy: Map<string, FrameHierarchyEntry> = new Map();
  const externalStack: string[] = [];
  let hasAnyEntry = false;

  traceRows.forEach((row) => {
    const callDepth = row.depth ?? 0;
    const isEntry = !!(row.entry && row.entryMeta);
    const isInternalFnEntryWithChildren = !!(row.jumpDestFn && row.hasChildren);
    const isCollapsibleEntry = isEntry || isInternalFnEntryWithChildren;

    if (externalStack.length > callDepth) {
      externalStack.length = callDepth;
    }
    const externalParentForEntry =
      callDepth > 0 ? externalStack[callDepth - 1] : null;
    const externalParentForOpcode =
      externalStack[callDepth] || externalParentForEntry;

    const internalParentIdStr =
      row.internalParentId !== undefined
        ? `opcode-${row.internalParentId}`
        : null;

    const fallbackParent = isEntry
      ? externalParentForEntry
      : externalParentForOpcode;
    const parentId = row.parentId || internalParentIdStr || fallbackParent;

    if (isEntry) {
      hasAnyEntry = true;
    }

    const parentInfo = parentId ? hierarchy.get(parentId) : null;
    const parentDepth =
      parentInfo?.functionDepth ??
      (row.visualDepth ? row.visualDepth - (isEntry ? 1 : 0) : 0);
    const currentFunctionDepth = isEntry ? parentDepth + 1 : parentDepth;
    const decoderDepth = row.visualDepth ?? currentFunctionDepth;

    hierarchy.set(row.id, {
      parentId,
      isEntry,
      isCollapsible: isCollapsibleEntry,
      functionDepth: currentFunctionDepth,
      callDepth,
      frameKey: row.frameKey || null,
      decoderDepth,
    });

    if (isEntry) {
      externalStack[callDepth] = row.id;
    }
  });

  if (!hasAnyEntry && traceRows.length > 0) {
    const firstEntry = hierarchy.get(traceRows[0].id);
    if (firstEntry) {
      firstEntry.isEntry = true;
    }
  }

  return hierarchy;
}

// ---- collapsed ranges -------------------------------------------------

export interface CollapsedRange {
  startIdx: number;
  endIdx: number;
  frameId: string;
}

export function buildCollapsedRanges(
  collapsedFrames: Set<string>,
  traceRows: TraceRow[],
  rowIndexMap: Map<string, number>,
): CollapsedRange[] {
  const ranges: CollapsedRange[] = [];

  collapsedFrames.forEach((frameId) => {
    const frameIdx = rowIndexMap.get(frameId) ?? -1;
    if (frameIdx === -1) return;
    const frame = traceRows[frameIdx];
    const frameDepth = frame.visualDepth ?? frame.depth ?? 0;
    let endIdx = frameIdx;
    for (let i = frameIdx + 1; i < traceRows.length; i++) {
      const childDepth = traceRows[i].visualDepth ?? traceRows[i].depth ?? 0;
      if (childDepth <= frameDepth) break;
      endIdx = i;
    }
    if (endIdx > frameIdx) {
      ranges.push({ startIdx: frameIdx + 1, endIdx, frameId });
    }
  });

  return ranges;
}

// ---- row meaningfulness (for "full" filter) ---------------------------

export function isRowMeaningful(row: TraceRow): boolean {
  if (row.entry && row.entryMeta) return true;
  const callOpcodes = [
    "CALL",
    "DELEGATECALL",
    "STATICCALL",
    "CALLCODE",
    "CREATE",
    "CREATE2",
  ];
  if (row.opcodeName && callOpcodes.includes(row.opcodeName)) return true;
  if (row.jumpDestFn) return true;
  if (row.storageSlot) return true;
  if (row.opcodeName?.startsWith("LOG")) return true;
  if (
    row.opcodeName === "REVERT" ||
    row.opcodeName === "RETURN" ||
    row.opcodeName === "STOP"
  )
    return true;
  if (
    row.opcodeName === "SSTORE" &&
    (row.storageBefore || row.storageAfter)
  )
    return true;
  return false;
}

// ---- row hidden check -------------------------------------------------

export function checkRowHidden(
  rowId: string,
  opcodeName: string | undefined,
  frameHierarchy: Map<string, FrameHierarchyEntry>,
  collapsedFrames: Set<string>,
  collapsedRanges: CollapsedRange[],
  traceRows: TraceRow[],
  rowIndexMap: Map<string, number>,
  filters: TraceFilters,
): boolean {
  const rowInfo = frameHierarchy.get(rowId);
  const rowIdx = rowIndexMap.get(rowId) ?? -1;
  const row = rowIdx >= 0 ? traceRows[rowIdx] : undefined;

  if (!filters.full && rowInfo && !rowInfo.isEntry) {
    return true;
  }
  if (filters.full && row && !isRowMeaningful(row)) {
    return true;
  }
  if (
    !filters.storage &&
    opcodeName &&
    (opcodeName === "SLOAD" || opcodeName === "SSTORE")
  ) {
    return true;
  }
  if (!filters.events && opcodeName && opcodeName.startsWith("LOG")) {
    return true;
  }

  for (const range of collapsedRanges) {
    if (rowIdx >= range.startIdx && rowIdx <= range.endIdx) {
      return true;
    }
  }

  let parentId = rowInfo?.parentId;
  let depth = 0;
  while (parentId && depth < 100) {
    if (collapsedFrames.has(parentId)) {
      return true;
    }
    parentId = frameHierarchy.get(parentId)?.parentId;
    depth++;
  }

  return false;
}

// ---- actual parent frames ---------------------------------------------

export function buildActualParentFrames(
  visibleRows: Array<{ row: TraceRow; originalIndex: number }>,
  collapsedFrames: Set<string>,
): Set<string> {
  const parentSet = new Set<string>();

  visibleRows.forEach(({ row }, idx) => {
    if (collapsedFrames.has(row.id)) {
      parentSet.add(row.id);
      return;
    }
    if (row.hasChildren) {
      const rowDepth = row.visualDepth ?? row.depth ?? 0;
      const nextItem = visibleRows[idx + 1];
      if (nextItem) {
        const nextDepth =
          nextItem.row.visualDepth ?? nextItem.row.depth ?? 0;
        if (nextDepth > rowDepth) {
          parentSet.add(row.id);
        }
      }
    }
  });

  return parentSet;
}

// ---- active rails at row ----------------------------------------------

export function buildActiveRailsAtRow(
  visibleRows: Array<{ row: TraceRow; originalIndex: number }>,
  actualParentFrames: Set<string>,
): Map<number, Set<number>> {
  const railsMap = new Map<number, Set<number>>();
  const parentStack: Array<{ depth: number; endIdx: number }> = [];

  visibleRows.forEach(({ row }, idx) => {
    const depth = row.visualDepth ?? row.depth ?? 0;

    while (
      parentStack.length > 0 &&
      parentStack[parentStack.length - 1].endIdx < idx
    ) {
      parentStack.pop();
    }
    while (
      parentStack.length > 0 &&
      parentStack[parentStack.length - 1].depth >= depth
    ) {
      parentStack.pop();
    }

    const isActualParent = actualParentFrames.has(row.id);
    const activeDepths = new Set<number>();
    for (const parent of parentStack) {
      activeDepths.add(parent.depth + 1);
    }
    if (isActualParent) {
      activeDepths.add(depth + 1);
    }
    if (activeDepths.size > 0) {
      railsMap.set(idx, activeDepths);
    }

    if (isActualParent) {
      let endIdx = idx;
      for (let i = idx + 1; i < visibleRows.length; i++) {
        const { row: nextRow } = visibleRows[i];
        const nextDepth = nextRow.visualDepth ?? nextRow.depth ?? 0;
        if (nextDepth <= depth) break;
        endIdx = i;
      }
      if (endIdx > idx) {
        parentStack.push({ depth, endIdx });
      }
    }
  });

  return railsMap;
}
