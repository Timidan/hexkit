import React, { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Bug, Loader2 } from "lucide-react";
import { formatParamValue } from "./traceTypes";
import type { TraceRow, TraceFilters, FrameHierarchyEntry } from "./traceTypes";
import { Button } from "../ui/button";
import { shortenAddress } from "../shared/AddressDisplay";
import { ColorizedSnippet } from "@/lib/monaco";

// ── Extracted helpers & components ──────────────────────────────────
import {
  splitTopLevel,
  compactPreviewValue,
  shouldExpandValue,
  getDetailMode,
  isEventExpandable,
  getOpcodeClass,
  buildSourceResolver,
  resolveRowSnapshotId,
} from "./traceRowHelpers";
import {
  StoragePointerBadge,
  HighlightableValue,
  buildDecodeInterface,
  decodeOutputForRowFn,
} from "./traceRowComponents";

// ── Hook props interface ────────────────────────────────────────────

interface TraceRowRendererProps {
  filters: TraceFilters;
  sourceLines?: string[];
  sourceTexts?: Record<string, string>;
  // State from useTraceState
  currentStepIndex: number;
  expandedRowId: string | null;
  setExpandedRowId: (id: string | null) => void;
  collapsedFrames: Set<string>;
  slotXRefEnabled: boolean;
  setSelectedEvent: (event: any) => void;
  openTraceDetail: (detail: { title: string; value: string; mode: "popover" | "modal"; format?: "text" | "json" }) => void;
  debugSession: any;
  openDebugAtSnapshot: (step: number) => Promise<void>;
  contractContext: any;
  highlightedValue: string | null;
  setHighlightedValue: (value: string | null) => void;
  resolveAddressName: (address: string | undefined | null) => string | null;
  getGlobalAddressTag: (address: string | undefined | null) => 'Sender' | 'Receiver' | null;
  getRowAddress: (row: TraceRow) => string | null;
  normalizeValue: (value: string | undefined | null) => string | null;
  isStoragePointerFunction: (fnName: string | undefined) => boolean;
  frameHierarchy: Map<string, FrameHierarchyEntry>;
  toggleFrameCollapse: (frameId: string, event: React.MouseEvent) => void;
  actualParentFrames: Set<string>;
  activeRailsAtRow: Map<number, Set<number>>;
  handleJumpToStep: (stepIndex: number) => void;
}

export function useTraceRowRenderer(props: TraceRowRendererProps) {
  const {
    filters,
    sourceLines,
    sourceTexts,
    currentStepIndex,
    expandedRowId,
    setExpandedRowId,
    collapsedFrames,
    slotXRefEnabled,
    setSelectedEvent,
    openTraceDetail,
    debugSession,
    openDebugAtSnapshot,
    contractContext,
    highlightedValue,
    setHighlightedValue,
    resolveAddressName,
    getGlobalAddressTag,
    getRowAddress,
    normalizeValue,
    isStoragePointerFunction,
    frameHierarchy,
    toggleFrameCollapse,
    actualParentFrames,
    activeRailsAtRow,
    handleJumpToStep,
  } = props;

  const eventArgPreviewLimit = 2;
  const eventArgInlineCharLimit = 20;
  const jumpArgInlineCharLimit = 120;
  const [pendingDebugSnapshotId, setPendingDebugSnapshotId] = useState<number | null>(null);
  const lastDebugJumpRef = useRef<{ snapshotId: number; timestamp: number }>({
    snapshotId: -1,
    timestamp: 0,
  });
  const formatShortAddress = useCallback(
    (address?: string | null): string => shortenAddress(address),
    [],
  );

  const decodeInterface = useMemo(
    () => buildDecodeInterface(contractContext),
    [contractContext?.abi, contractContext?.diamondFacets],
  );

  const decodeOutputForRow = useCallback(
    (row: TraceRow): string | null =>
      decodeOutputForRowFn(row, decodeInterface, contractContext?.selectedFunction),
    [decodeInterface, contractContext?.selectedFunction],
  );

  // Re-create inline HighlightableValue with current highlight state bound.
  const InlineHighlightableValue: React.FC<{
    value: string | undefined | null;
    className?: string;
    children?: React.ReactNode;
  }> = useCallback(
    (p) => (
      <HighlightableValue
        {...p}
        highlightedValue={highlightedValue}
        normalizeValue={normalizeValue}
        setHighlightedValue={setHighlightedValue}
      />
    ),
    [highlightedValue, normalizeValue, setHighlightedValue],
  );

  // Render vertical depth lines
  const renderDepthLines = useCallback((depth: number, activeRails?: Set<number>) => {
    if (depth <= 0) return null;
    const width = depth * 20;
    const lines = [];
    for (let i = 1; i <= depth; i++) {
      if (activeRails && activeRails.has(i)) {
        lines.push(
          <line
            key={i}
            x1={(i - 1) * 20 + 10}
            y1="0"
            x2={(i - 1) * 20 + 10}
            y2="100%"
            stroke="rgba(255, 255, 255, 0.125)"
            strokeWidth="1"
          />,
        );
      }
    }
    if (lines.length === 0) return null;
    return (
      <svg
        className="exec-depth-lines-svg"
        height="100%"
        width={width}
        style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}
      >
        {lines}
      </svg>
    );
  }, []);

  const resolveSourceContent = useMemo(
    () => buildSourceResolver(sourceTexts),
    [sourceTexts],
  );

  // Render source snippet with Monaco syntax highlighting
  const renderSnippet = useCallback(
    (row: TraceRow) => {
      const lineNum = typeof row.line === "number" ? row.line : Number(row.line);
      if (!Number.isFinite(lineNum) || lineNum <= 0) return null;

      const content = resolveSourceContent(row.sourceFile);
      if (!content) return null;

      return (
        <ColorizedSnippet
          sourceContent={content}
          highlightLine={lineNum}
          contextLines={8}
        />
      );
    },
    [resolveSourceContent],
  );

  // Render debug button for a trace row
  const renderDebugButton = useCallback(
    (row: TraceRow) => {
      if (!debugSession) return null;
      const snapshotId = resolveRowSnapshotId(row);
      if (snapshotId === null) return null;
      const isPending = pendingDebugSnapshotId === snapshotId;

      return (
        <Button
          type="button"
          variant="icon-borderless"
          size="icon-inline"
          className={`exec-trace-debug-btn${isPending ? " opacity-70 cursor-wait" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            const now = Date.now();
            const last = lastDebugJumpRef.current;
            if (last.snapshotId === snapshotId && now - last.timestamp < 250) return;
            lastDebugJumpRef.current = { snapshotId, timestamp: now };

            setPendingDebugSnapshotId(snapshotId);
            void Promise.resolve(openDebugAtSnapshot(snapshotId)).finally(() => {
              setPendingDebugSnapshotId((prev) => (prev === snapshotId ? null : prev));
            });
          }}
          disabled={isPending}
          title={isPending ? "Opening debugger..." : "Open in debugger at this step"}
          aria-label={isPending ? "Opening debugger" : "Open in debugger at this step"}
        >
          {isPending ? <Loader2 size={12} className="animate-spin" /> : <Bug size={12} />}
        </Button>
      );
    },
    [debugSession, openDebugAtSnapshot, pendingDebugSnapshotId],
  );

  // Main render function
  const renderTraceRow = useCallback(
    (row: TraceRow, index: number, visibleIdx: number) => {
      const isCurrentStep = index === currentStepIndex;
      const activeRails = activeRailsAtRow.get(visibleIdx);
      const isExpanded = expandedRowId === row.id;
      const rowClasses = [
        "exec-trace-row",
        isCurrentStep ? "exec-trace-row--current" : "",
        row.isError ? "exec-trace-row--error" : "",
      ]
        .filter(Boolean)
        .join(" ");

      if (row.type === "call") {
        let decodedParams = "";
        if (row.input && decodeInterface) {
          try {
            const decoded = decodeInterface.parseTransaction({ data: row.input });
            if (decoded.args && decoded.args.length > 0) {
              decodedParams = decoded.args
                .map((arg: any, idx: number) =>
                  formatParamValue(
                    arg,
                    decoded.functionFragment.inputs[idx]?.type,
                    decoded.functionFragment.inputs[idx]?.components,
                  ),
                )
                .join(", ");
            }
          } catch {
            // Silent fail
          }
        }

        const decodedReturn = decodeOutputForRow(row) || "";

        return (
          <div key={row.id} className={rowClasses} onClick={() => handleJumpToStep(index)}>
            <div className="exec-trace-row__content">
              <div className="exec-sticky-columns">
                <span className={`exec-trace-opcode-badge op-call`}>
                  {row.callType?.toUpperCase() || "CALL"}
                </span>
                {row.gasUsed && (
                  <span className="exec-trace-step-count">
                    {parseInt(row.gasUsed).toLocaleString()}
                  </span>
                )}
              </div>
              <span className="exec-trace-chevron">
                <ChevronDown size={12} strokeWidth={2} />
              </span>
              <span className="exec-trace-depth">{row.depth ?? 0}</span>
              <span className={getGlobalAddressTag(row.from) === "Sender" ? "exec-trace-sender" : "exec-trace-address-plain"}>
                {getGlobalAddressTag(row.from) && <>[{getGlobalAddressTag(row.from)}] </>}
                <InlineHighlightableValue value={row.from} className="exec-trace-address">
                  {resolveAddressName(row.from) || row.from || "\u2014"}
                </InlineHighlightableValue>
              </span>
              <span className="exec-trace-arrow">{" => "}</span>
              <span className={getGlobalAddressTag(row.to) === "Receiver" ? "exec-trace-receiver" : "exec-trace-address-plain"}>
                {getGlobalAddressTag(row.to) && <>[{getGlobalAddressTag(row.to)}] </>}
                <InlineHighlightableValue value={row.to} className="exec-trace-address">
                  {resolveAddressName(row.to) || row.to || "\u2014"}
                </InlineHighlightableValue>
              </span>
              {row.functionName && (
                <>
                  <span className="exec-trace-separator"> . </span>
                  <span className="exec-trace-function">
                    {row.functionName}({decodedParams || row.input || ""})
                  </span>
                </>
              )}
              {row.value && row.value !== "0" && (
                <span className="exec-trace-value"> Wei:{row.value}</span>
              )}
              {(() => {
                const returnValue = decodedReturn || row.returnData || "";
                if (!returnValue) return null;
                const canExpand = shouldExpandValue(returnValue);
                const preview = canExpand ? compactPreviewValue(returnValue) : returnValue;
                return (
                  <>
                    <span className="exec-trace-arrow"> -&gt; </span>
                    <span
                      className={`exec-trace-return${canExpand ? " exec-trace-return--expandable" : ""}`}
                      onClick={(e) => {
                        if (!canExpand) return;
                        e.stopPropagation();
                        openTraceDetail({
                          title: `${row.functionName || "call"} return value`,
                          value: returnValue,
                          mode: getDetailMode(returnValue),
                          format: "text",
                        });
                      }}
                      title={canExpand ? "Click to view full return value" : returnValue}
                      role={canExpand ? "button" : undefined}
                    >
                      ({preview})
                      {canExpand && <span className="exec-trace-expand-hint">{"\u22EF"}</span>}
                    </span>
                  </>
                );
              })()}
              {renderDebugButton(row)}
            </div>
          </div>
        );
      }

      if (row.type === "opcode") {
        const opcodeClass = getOpcodeClass(row.opcodeName);
        const lineNum = typeof row.line === "number" ? row.line : Number(row.line);
        const hasLineHint = Number.isFinite(lineNum) && lineNum > 0;
        const hasSource = hasLineHint && !!resolveSourceContent(row.sourceFile);
        const canOpenSourcePanel = hasSource || !!row.isUnverifiedContract || hasLineHint;
        const frameInfo = frameHierarchy.get(row.id);
        const isEntryFrame = frameInfo?.isEntry ?? false;
        const isExplicitEntry = !!(row.entry && row.entryMeta);
        const isCollapsed = collapsedFrames.has(row.id);
        const gasDeltaNum = Number.parseInt(String(row.gasDelta ?? ""), 10);
        const gasUsedNum = Number.parseInt(String(row.gasUsed ?? ""), 10);
        const gasDisplay =
          Number.isFinite(gasDeltaNum) && gasDeltaNum > 0
            ? gasDeltaNum
            : Number.isFinite(gasUsedNum) && gasUsedNum > 0
              ? gasUsedNum
              : null;

        return (
          <React.Fragment key={row.id}>
            <div
              className={`${rowClasses}${hasSource || row.isUnverifiedContract ? " has-source" : ""}${isEntryFrame ? " entry-frame" : ""}${row.isInternalCall ? " internal-call" : ""}${row.isInternalReturn ? " internal-return" : ""}`}
              data-internal-call={row.isInternalCall ? "true" : undefined}
              data-internal-return={row.isInternalReturn ? "true" : undefined}
              data-visual-depth={row.visualDepth ?? row.depth ?? 0}
              onClick={() => {
                handleJumpToStep(index);
                if (canOpenSourcePanel) {
                  setExpandedRowId(expandedRowId === row.id ? null : row.id);
                }
              }}
            >
              <div className="exec-trace-row__content">
                <div className="exec-sticky-columns">
                  <span className={`exec-trace-opcode-badge ${opcodeClass}`}>
                    {row.opcodeName || "OP"}
                  </span>
                  {filters.gas && (
                    <span className="exec-trace-step-count">
                      {gasDisplay !== null ? gasDisplay.toLocaleString() : ""}
                    </span>
                  )}
                </div>
                <div
                  className="exec-trace-depth-spacer"
                  style={{
                    width: (row.visualDepth ?? row.depth ?? 0) * 20,
                    position: "relative",
                  }}
                >
                  {renderDepthLines(row.visualDepth ?? row.depth ?? 0, activeRails)}
                </div>
                {(() => {
                  const isActualParent = actualParentFrames.has(row.id);
                  return (
                    <span
                      className={`exec-trace-chevron${isActualParent ? " clickable" : ""}`}
                      onClick={isActualParent ? (e) => toggleFrameCollapse(row.id, e) : undefined}
                    >
                      {isActualParent &&
                        (isCollapsed ? (
                          <ChevronRight size={12} strokeWidth={2} />
                        ) : (
                          <ChevronDown size={12} strokeWidth={2} />
                        ))}
                    </span>
                  );
                })()}
                <div className="exec-trace-details">
                  {/* Entry frame */}
                  {isExplicitEntry && row.entryMeta && !row.jumpDestFn && (
                    <>
                      <span className={getGlobalAddressTag(row.entryMeta.caller) === "Sender" ? "exec-trace-sender" : "exec-trace-address-plain"}>
                        {getGlobalAddressTag(row.entryMeta.caller) && <>[{getGlobalAddressTag(row.entryMeta.caller)}] </>}
                      </span>
                      <InlineHighlightableValue value={row.entryMeta.caller} className="exec-trace-address">
                        {resolveAddressName(row.entryMeta.caller) || row.entryMeta.caller || "0x0"}
                      </InlineHighlightableValue>
                      <span className="exec-trace-arrow">{" => "}</span>
                      {row.entryMeta.callType === "DELEGATECALL" ? (
                        (() => {
                          const targetAddress = row.entryMeta.target || row.to || null;
                          const codeAddress = row.entryMeta.codeAddress || null;
                          const targetDisplayName =
                            row.entryMeta.targetContractName ||
                            resolveAddressName(targetAddress) ||
                            targetAddress ||
                            "\u2014";
                          const codeDisplayName =
                            row.entryMeta.codeContractName ||
                            resolveAddressName(codeAddress) ||
                            codeAddress ||
                            "\u2014";
                          const sameLabelDifferentAddress =
                            !!targetAddress &&
                            !!codeAddress &&
                            targetAddress.toLowerCase() !== codeAddress.toLowerCase() &&
                            targetDisplayName.toLowerCase() === codeDisplayName.toLowerCase();
                          const targetLabel = sameLabelDifferentAddress
                            ? `${targetDisplayName} (${formatShortAddress(targetAddress)})`
                            : targetDisplayName;
                          const codeLabel = sameLabelDifferentAddress
                            ? `${codeDisplayName} (${formatShortAddress(codeAddress)})`
                            : codeDisplayName;

                          return (
                            <>
                              <span className="exec-trace-delegate-wrapper">(</span>
                              <span className={getGlobalAddressTag(targetAddress) === "Receiver" ? "exec-trace-receiver" : "exec-trace-address-plain"}>
                                {getGlobalAddressTag(targetAddress) && <>[{getGlobalAddressTag(targetAddress)}] </>}
                              </span>
                              <InlineHighlightableValue value={targetAddress} className="exec-trace-address exec-trace-proxy-name">
                                {targetLabel}
                              </InlineHighlightableValue>
                              <span className="exec-trace-delegate-arrow">{" => "}</span>
                              <InlineHighlightableValue value={codeAddress} className="exec-trace-address exec-trace-delegate-target">
                                {codeLabel}
                              </InlineHighlightableValue>
                              <span className="exec-trace-delegate-wrapper">)</span>
                            </>
                          );
                        })()
                      ) : (
                        <>
                          <span className={getGlobalAddressTag(row.entryMeta.target || row.to) === "Receiver" ? "exec-trace-receiver" : "exec-trace-address-plain"}>
                            {getGlobalAddressTag(row.entryMeta.target || row.to) && <>[{getGlobalAddressTag(row.entryMeta.target || row.to)}] </>}
                          </span>
                          <InlineHighlightableValue value={row.entryMeta.target || row.to} className="exec-trace-address">
                            {row.contractName || resolveAddressName(row.entryMeta.target) || row.entryMeta.target || "\u2014"}
                          </InlineHighlightableValue>
                        </>
                      )}
                      <span className="exec-trace-separator">.</span>
                      <span className="exec-trace-function">
                        {row.entryMeta.function?.split("(")[0] || "unknown"}
                      </span>
                      <span className="exec-trace-args">
                        (
                        {row.entryMeta.args && row.entryMeta.args.length > 0
                          ? row.entryMeta.args.map(
                              (arg: { name: string; value: string }, i: number) => {
                                const resolvedName = resolveAddressName(arg.value);
                                return (
                                  <React.Fragment key={i}>
                                    {i > 0 && ", "}
                                    <span className="exec-trace-arg-name">{arg.name}</span>
                                    {" = "}
                                    <InlineHighlightableValue
                                      value={arg.value}
                                      className={`exec-trace-arg-value${resolvedName ? " resolved-name" : ""}`}
                                    >
                                      {resolvedName || arg.value}
                                    </InlineHighlightableValue>
                                  </React.Fragment>
                                );
                              },
                            )
                          : row.entryMeta.selector || "0x"}
                        )
                      </span>
                      {(() => {
                        const decodedEntryOutput = decodeOutputForRow(row);
                        if (!decodedEntryOutput) return null;
                        const canExpand = shouldExpandValue(decodedEntryOutput);
                        const preview = canExpand ? compactPreviewValue(decodedEntryOutput) : decodedEntryOutput;
                        return (
                          <>
                            <span className="exec-trace-arrow">{" => "}</span>
                            <span
                              className={`exec-trace-output${canExpand ? " exec-trace-return--expandable" : ""}`}
                              onClick={(e) => {
                                if (!canExpand) return;
                                e.stopPropagation();
                                openTraceDetail({
                                  title: `${row.entryMeta?.function?.split("(")[0] || row.functionName || "call"} return value`,
                                  value: decodedEntryOutput,
                                  mode: getDetailMode(decodedEntryOutput),
                                  format: "text",
                                });
                              }}
                              title={canExpand ? "Click to view full return value" : decodedEntryOutput}
                              role={canExpand ? "button" : undefined}
                            >
                              ({preview})
                              {canExpand && <span className="exec-trace-expand-hint">{"\u22EF"}</span>}
                            </span>
                          </>
                        );
                      })()}
                    </>
                  )}
                  {/* SLOAD */}
                  {row.opcodeName === "SLOAD" && row.storageSlot && (
                    <>
                      <InlineHighlightableValue value={getRowAddress(row)} className="exec-trace-contract-name">
                        {row.contractName || resolveAddressName(getRowAddress(row)) || ""}
                      </InlineHighlightableValue>
                      <span className="exec-trace-storage-bracket">{" ["}</span>
                      {slotXRefEnabled ? (
                        <InlineHighlightableValue value={row.storageSlot} className="exec-trace-storage-slot">
                          {row.storageSlot}
                        </InlineHighlightableValue>
                      ) : (
                        <span className="exec-trace-storage-slot">{row.storageSlot}</span>
                      )}
                      {row.storageAfter !== undefined && row.storageAfter !== null && row.storageAfter !== "" && (
                        <>
                          <span className="exec-trace-storage-equals"> = </span>
                          <span className="exec-trace-storage-bracket">{"["}</span>
                          <span className="exec-trace-storage-value">{row.storageAfter}</span>
                          <span className="exec-trace-storage-bracket">{"]"}</span>
                        </>
                      )}
                      <span className="exec-trace-storage-bracket">{"]"}</span>
                    </>
                  )}
                  {/* SSTORE */}
                  {row.opcodeName === "SSTORE" && row.storageSlot && (
                    <>
                      <InlineHighlightableValue value={getRowAddress(row)} className="exec-trace-contract-name">
                        {row.contractName || resolveAddressName(getRowAddress(row)) || ""}
                      </InlineHighlightableValue>
                      <span className="exec-trace-storage-bracket">{" ["}</span>
                      {slotXRefEnabled ? (
                        <InlineHighlightableValue value={row.storageSlot} className="exec-trace-storage-slot">
                          {row.storageSlot}
                        </InlineHighlightableValue>
                      ) : (
                        <span className="exec-trace-storage-slot">{row.storageSlot}</span>
                      )}
                      <span className="exec-trace-storage-equals">{" = "}</span>
                      <span className="exec-trace-storage-before">{row.storageBefore || "0x0"}</span>
                      <span className="exec-trace-storage-arrow">{" \u2192 "}</span>
                      <span className="exec-trace-storage-after">{row.storageAfter || "0x0"}</span>
                      <span className="exec-trace-storage-bracket">{"]"}</span>
                    </>
                  )}
                  {/* LOG opcode */}
                  {row.opcodeName?.startsWith("LOG") &&
                    (row.decodedLog ? (
                      (() => {
                        const canExpand = isEventExpandable(row.decodedLog!.args);
                        return (
                          <span
                            className={`exec-trace-event-compact${canExpand ? "" : " exec-trace-event-compact--static"}`}
                            onClick={(e) => {
                              if (!canExpand) return;
                              e.stopPropagation();
                              setSelectedEvent({
                                name: row.decodedLog!.name,
                                args: row.decodedLog!.args,
                                contractName: row.contractName,
                                mode: getDetailMode(
                                  JSON.stringify(
                                    Object.fromEntries(
                                      row.decodedLog!.args.map((a: { name: string | number; value: string }) => [a.name, a.value]),
                                    ),
                                    null,
                                    2,
                                  ),
                                ),
                              });
                            }}
                            title={canExpand ? "Click to view event details" : undefined}
                            role={canExpand ? "button" : undefined}
                          >
                            <InlineHighlightableValue value={getRowAddress(row)} className="exec-trace-address">
                              {row.contractName || resolveAddressName(getRowAddress(row)) || ""}
                            </InlineHighlightableValue>
                            <span className="exec-trace-separator">.</span>
                            <span className="exec-trace-event-name">{row.decodedLog.name}</span>
                            <span className="exec-trace-event-args">
                              (
                              {row.decodedLog.args.slice(0, eventArgPreviewLimit).map((arg: { name: string | number; value: string }, i: number) => {
                                const val = String(arg.value);
                                const short =
                                  val.length > eventArgInlineCharLimit
                                    ? val.substring(0, eventArgInlineCharLimit) + "\u2026"
                                    : val;
                                const resolvedName = resolveAddressName(arg.value);
                                return (
                                  <React.Fragment key={i}>
                                    {i > 0 && ", "}
                                    <span className="exec-trace-arg-name">{arg.name}</span>
                                    {" = "}
                                    <span className={`exec-trace-arg-value${resolvedName ? " resolved-name" : ""}`}>
                                      {resolvedName || short}
                                    </span>
                                  </React.Fragment>
                                );
                              })}
                              {row.decodedLog.args.length > eventArgPreviewLimit && (
                                <span className="exec-trace-more-args">
                                  {" "}+{row.decodedLog.args.length - eventArgPreviewLimit} more
                                </span>
                              )}
                              )
                            </span>
                            {canExpand && <span className="exec-trace-expand-hint">{"\u22EF"}</span>}
                          </span>
                        );
                      })()
                    ) : row.value ? (
                      <span className="exec-trace-log-raw">{row.value}</span>
                    ) : null)}
                  {/* JUMP with decoded function */}
                  {row.jumpDestFn && (
                    <>
                      <InlineHighlightableValue value={getRowAddress(row)} className="exec-trace-address">
                        {row.contractName || resolveAddressName(getRowAddress(row)) || ""}
                      </InlineHighlightableValue>
                      <span className="exec-trace-separator">.</span>
                      <span className="exec-trace-function">{row.jumpDestFn}</span>
                      {row.jumpArgsDecoded &&
                        (() => {
                          const fullArgs = row.jumpArgsDecodedFull || row.jumpArgsDecoded;
                          const isExpandedPreview = !!row.jumpArgsDecodedFull && row.jumpArgsDecodedFull !== row.jumpArgsDecoded;
                          const hasComplexValue = fullArgs.includes("[") || fullArgs.includes("{");
                          const canExpand = isExpandedPreview || fullArgs.length > jumpArgInlineCharLimit || hasComplexValue;

                          return (
                            <span
                              className={`exec-trace-event-args${canExpand ? " exec-trace-event-args--expandable" : ""}`}
                              title={canExpand ? "Click to view full arguments" : fullArgs}
                              onClick={(e) => {
                                if (!canExpand) return;
                                e.stopPropagation();
                                openTraceDetail({
                                  title: `${row.jumpDestFn} arguments`,
                                  value: fullArgs,
                                  mode: getDetailMode(fullArgs),
                                  format: "text",
                                });
                              }}
                              role={canExpand ? "button" : undefined}
                            >
                              ({row.jumpArgsDecoded})
                              {canExpand && <span className="exec-trace-expand-hint">{"\u22EF"}</span>}
                            </span>
                          );
                        })()}
                      {row.jumpResult !== undefined && row.jumpResult !== null && (
                        <>
                          <span className="exec-trace-arrow">{" => "}</span>
                          {isStoragePointerFunction(row.jumpDestFn) ? (
                            <StoragePointerBadge hash={row.jumpResult} />
                          ) : (
                            (() => {
                              const jumpResultValue = String(row.jumpResult);
                              const canExpand = shouldExpandValue(jumpResultValue);
                              const preview = canExpand ? compactPreviewValue(jumpResultValue) : jumpResultValue;
                              if (canExpand) {
                                return (
                                  <span
                                    className="exec-trace-return exec-trace-return--expandable"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openTraceDetail({
                                        title: `${row.jumpDestFn || "function"} return value`,
                                        value: jumpResultValue,
                                        mode: getDetailMode(jumpResultValue),
                                        format: "text",
                                      });
                                    }}
                                    title="Click to view full return value"
                                    role="button"
                                  >
                                    ({preview})
                                    <span className="exec-trace-expand-hint">{"\u22EF"}</span>
                                  </span>
                                );
                              }
                              return (
                                <InlineHighlightableValue value={jumpResultValue} className="exec-trace-return">
                                  ({jumpResultValue})
                                </InlineHighlightableValue>
                              );
                            })()
                          )}
                        </>
                      )}
                    </>
                  )}
                  {renderDebugButton(row)}
                </div>
              </div>
            </div>
            {/* Expanded content (snippet / no-source notice) rendered by TraceList outside the scroll container */}
          </React.Fragment>
        );
      }
      return null;
    },
    [
      currentStepIndex, expandedRowId, setExpandedRowId, collapsedFrames, slotXRefEnabled,
      setSelectedEvent, openTraceDetail,
      resolveAddressName, getGlobalAddressTag, getRowAddress,
      isStoragePointerFunction, frameHierarchy, toggleFrameCollapse,
      actualParentFrames, activeRailsAtRow, handleJumpToStep, filters.gas,
      renderDepthLines, renderSnippet, renderDebugButton, InlineHighlightableValue,
      decodeInterface, decodeOutputForRow,
      sourceLines, sourceTexts, resolveSourceContent, formatShortAddress,
    ],
  );

  // ── Render expanded content (snippet or no-source notice) ──────────
  const renderExpandedContent = useCallback(
    (row: TraceRow): React.ReactNode => {
      const lineNum = typeof row.line === "number" ? row.line : Number(row.line);
      const hasLineHint = Number.isFinite(lineNum) && lineNum > 0;
      const hasSource = hasLineHint && !!resolveSourceContent(row.sourceFile);

      if (hasSource) {
        return renderSnippet(row);
      }

      if (!hasSource && (row.isUnverifiedContract || hasLineHint)) {
        return (
          <div className="exec-no-source-notice">
            <div className="exec-no-source-header">No source for this contract</div>
            <div className="exec-no-source-address">
              Contract address: {row.entryMeta?.codeAddress || row.entryMeta?.target || row.contract}
            </div>
            <div className="exec-no-source-message">
              Unfortunately we do not have the source code for this contract to display the exact line of code.
            </div>
            <div className="exec-no-source-actions">
              <Button type="button" variant="ghost" className="exec-no-source-button" disabled>
                Verify contract
              </Button>
              <Button type="button" variant="ghost" className="exec-no-source-button" disabled>
                Fetch the contract from public explorer
              </Button>
            </div>
          </div>
        );
      }

      return null;
    },
    [resolveSourceContent, renderSnippet],
  );

  // ── Stable ref wrapper ──────────────────────────────────────────────
  const renderTraceRowRef = useRef(renderTraceRow);
  renderTraceRowRef.current = renderTraceRow;

  const stableRenderTraceRow = useCallback(
    (row: TraceRow, index: number, visibleIdx: number) =>
      renderTraceRowRef.current(row, index, visibleIdx),
    [],
  );

  const renderExpandedContentRef = useRef(renderExpandedContent);
  renderExpandedContentRef.current = renderExpandedContent;

  const stableRenderExpandedContent = useCallback(
    (row: TraceRow) => renderExpandedContentRef.current(row),
    [],
  );

  return { renderTraceRow: stableRenderTraceRow, renderExpandedContent: stableRenderExpandedContent };
}
