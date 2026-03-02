import React from "react";
import "../styles/ExecutionStackTrace.css";
import TokenMovementsPanel from "./TokenMovementsPanel";
import { CopyButton } from "./ui/copy-button";
import { Button } from "./ui/button";
import { TraceToolbar, TraceIOPanel, TraceList, useTraceState, useTraceRowRenderer } from "./execution-trace";
import type { StackTraceProps } from "./execution-trace";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "./ui/table";

// Re-export types for backward compatibility
export type { TraceRow, TraceFilters, DecodedLogData } from "./execution-trace";

const ExecutionStackTrace: React.FC<StackTraceProps> = (props) => {
  const {
    traceRows,
    isDecoding,
    searchQuery,
    onSearchChange,
    filters,
    onFilterChange,
    onGoToRevert,
    hasRevert,
    selectedInput,
    selectedOutput,
    sourceLines,
    sourceTexts,
    traceDiagnostics,
    traceEvents,
    senderAddress,
    highlightedValue: externalHighlightedValue,
    onHighlightChange,
    implementationToProxy,
    assetChanges,
  } = props;

  const state = useTraceState({
    traceRows,
    filters,
    searchQuery,
    selectedInput,
    selectedOutput,
    sourceLines,
    sourceTexts,
    externalHighlightedValue,
    onHighlightChange,
  });

  const { renderTraceRow, renderExpandedContent } = useTraceRowRenderer({
    filters,
    sourceLines,
    sourceTexts,
    currentStepIndex: state.currentStepIndex,
    expandedRowId: state.expandedRowId,
    setExpandedRowId: state.setExpandedRowId,
    collapsedFrames: state.collapsedFrames,
    slotXRefEnabled: state.slotXRefEnabled,
    setSelectedEvent: state.setSelectedEvent,
    openTraceDetail: (detail) => {
      state.setSelectedEvent(null);
      state.setSelectedTraceDetail(detail);
    },
    debugSession: state.debugSession,
    openDebugAtSnapshot: state.openDebugAtSnapshot,
    contractContext: state.contractContext,
    highlightedValue: state.highlightedValue,
    setHighlightedValue: state.setHighlightedValue,
    resolveAddressName: state.resolveAddressName,
    getGlobalAddressTag: state.getGlobalAddressTag,
    getRowAddress: state.getRowAddress,
    normalizeValue: state.normalizeValue,
    isStoragePointerFunction: state.isStoragePointerFunction,
    frameHierarchy: state.frameHierarchy,
    toggleFrameCollapse: state.toggleFrameCollapse,
    actualParentFrames: state.actualParentFrames,
    activeRailsAtRow: state.activeRailsAtRow,
    handleJumpToStep: state.handleJumpToStep,
  });

  const selectedEventJson = React.useMemo(() => {
    if (!state.selectedEvent) return "";

    const coerceArgValue = (raw: unknown): unknown => {
      const value = typeof raw === "string" ? raw.trim() : raw;
      if (typeof value !== "string" || value === "") {
        return value;
      }

      const looksJsonObject = value.startsWith("{") && value.endsWith("}");
      const looksJsonArray = value.startsWith("[") && value.endsWith("]");
      if (looksJsonObject || looksJsonArray) {
        try {
          return JSON.parse(value);
        } catch {
          // Keep legacy non-JSON tuple/array strings as-is.
        }
      }

      return value;
    };

    const structured = Object.fromEntries(
      state.selectedEvent.args.map((arg) => [arg.name, coerceArgValue(arg.value)])
    );
    return JSON.stringify(structured, null, 2);
  }, [state.selectedEvent]);

  // --- Asset Movements Accordion helpers ---
  const normalizeAssetDirection = (change: any): "in" | "out" | "unknown" => {
    if (change?.direction === "in" || change?.direction === "out") return change.direction;
    const amountText = String(change?.amount ?? change?.rawAmount ?? "").trim();
    if (amountText.startsWith("+")) return "in";
    if (amountText.startsWith("-")) return "out";
    return "unknown";
  };

  const orderedAssetChanges = React.useMemo(() => {
    const out: any[] = [];
    const incoming: any[] = [];
    const unknown: any[] = [];
    const source = Array.isArray(assetChanges) ? assetChanges : [];
    source.forEach((change: any) => {
      const dir = normalizeAssetDirection(change);
      if (dir === "out") out.push(change);
      else if (dir === "in") incoming.push(change);
      else unknown.push(change);
    });
    return { rows: [...out, ...incoming, ...unknown], outgoingCount: out.length, incomingCount: incoming.length };
  }, [assetChanges]);

  const hasAssetChanges = orderedAssetChanges.rows.length > 0;
  const hasTokenEvents = traceEvents && traceEvents.length > 0;
  const defaultAccordionItems: string[] = [];

  return (
    <div className="exec-stack-trace">
      {/* Input/Output Section */}
      <section className="exec-io-section">
        <div
          className="exec-section-header"
          onClick={() => state.setIoExpanded(!state.ioExpanded)}
        >
          <h3 className="exec-section-title">Input and Output</h3>
          <span
            className="exec-section-toggle"
            title={state.ioExpanded ? "Hide" : "Show"}
          >
            {state.ioExpanded ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </span>
        </div>
        {state.ioExpanded && (
          <TraceIOPanel
            selectedInput={selectedInput}
            selectedOutput={selectedOutput}
            decodedInput={state.decodedInput}
            decodedOutput={state.decodedOutput}
            signatureDecodedInput={state.signatureDecodedInput}
            signatureLookupLoading={state.signatureLookupLoading}
            inputViewMode={state.inputViewMode}
            setInputViewMode={state.setInputViewMode}
            outputViewMode={state.outputViewMode}
            setOutputViewMode={state.setOutputViewMode}
            inputExpanded={state.inputExpanded}
            setInputExpanded={state.setInputExpanded}
            outputExpanded={state.outputExpanded}
            setOutputExpanded={state.setOutputExpanded}
          />
        )}
      </section>

      {/* Asset Movements Accordion (Native Token Change + Token Movements) */}
      {(hasAssetChanges || hasTokenEvents) && (
        <Accordion type="multiple" defaultValue={defaultAccordionItems} className="exec-asset-movements-accordion">
          {/* Native Token Change */}
          {hasAssetChanges && (
            <AccordionItem value="native-token-change">
              <AccordionTrigger>
                Native Token Change
                <span className="exec-accordion-count">{orderedAssetChanges.rows.length}</span>
              </AccordionTrigger>
              <AccordionContent>
                <Table className="sim-balance-changes__table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Address</TableHead>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Delta Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedAssetChanges.rows.map((change: any, idx: number) => {
                      const direction = normalizeAssetDirection(change);
                      const isPositive = direction === "in";
                      const isNegative = direction === "out";
                      const amountClass = isPositive
                        ? "sim-amount--positive"
                        : isNegative
                          ? "sim-amount--negative"
                          : "";
                      const showIncomingDivider =
                        idx === orderedAssetChanges.outgoingCount &&
                        orderedAssetChanges.outgoingCount > 0 &&
                        orderedAssetChanges.incomingCount > 0;
                      return (
                        <React.Fragment key={idx}>
                          {showIncomingDivider && (
                            <TableRow className="sim-balance-changes__group-divider" aria-hidden="true">
                              <TableCell colSpan={3} />
                            </TableRow>
                          )}
                          <TableRow>
                            <TableCell className="sim-address">
                              {change.address ? `${change.address.slice(0, 10)}\u2026${change.address.slice(-8)}` : "\u2014"}
                            </TableCell>
                            <TableCell>
                              {change.symbol || "Unknown"}
                            </TableCell>
                            <TableCell className={`text-right ${amountClass}`}>
                              {change.amount || change.rawAmount || "0"}
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </AccordionContent>
            </AccordionItem>
          )}

          {/* Token Movements */}
          {hasTokenEvents && (
            <AccordionItem value="token-movements">
              <AccordionTrigger>
                Token Movements
                <span className="exec-accordion-count">{traceEvents!.length}</span>
              </AccordionTrigger>
              <AccordionContent>
                <TokenMovementsPanel
                  key={`token-movements-${state.fetchedSymbol || 'loading'}`}
                  events={traceEvents}
                  senderAddress={senderAddress}
                  addressToName={state.addressToName}
                  addressToSymbol={state.addressToSymbol}
                  highlightedValue={state.highlightedValue}
                  onHighlightChange={state.setHighlightedValue}
                  chainId={state.contractContext?.networkId}
                  implementationToProxy={implementationToProxy}
                  rpcUrl={state.effectiveRpcUrl}
                />
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}

      {/* Stack Trace Section */}
      <section className="exec-trace-section" onMouseLeave={() => state.setHighlightedValue(null)}>
        {traceDiagnostics && (
          <div className="exec-trace-diagnostics">
            {!isDecoding && !traceDiagnostics.hasRawTrace && (
              <div className="exec-trace-warning">
                No rawTrace was returned by the simulator. Ensure the EDB
                simulator bridge is running at the configured endpoint and the
                simulation succeeded.
              </div>
            )}
            {!isDecoding && traceDiagnostics.hasRawTrace && !traceDiagnostics.hasSnapshots && (
              <div className="exec-trace-warning">
                rawTrace present but no snapshots/opcodes were decoded. This
                typically happens when:
                <ul style={{ margin: "8px 0 0 16px", paddingLeft: 0 }}>
                  <li>The EDB engine fell back to eth_call mode (check warnings in the Summary tab)</li>
                  <li>The EDB couldn't fetch/instrument the contract bytecode</li>
                  <li>The RPC doesn't support debug/trace methods or is rate-limited</li>
                </ul>
                <div style={{ marginTop: "8px", fontSize: "13px", color: "#888" }}>
                  Tip: Use an archive RPC endpoint and ensure EDB has access to Sourcify or Etherscan for contract metadata.
                </div>
              </div>
            )}
            {!isDecoding && traceDiagnostics.hasRawTrace && traceDiagnostics.hasSnapshots && traceDiagnostics.rowsCount === 0 && (
              <div className="exec-trace-warning">
                rawTrace decoded but produced zero filtered rows. Try enabling "Full Trace" filter to see all opcodes.
              </div>
            )}
            {traceDiagnostics.artifactWarning && (
              <div
                className="exec-trace-info"
                style={{
                  background: "rgba(251, 191, 36, 0.1)",
                  border: "1px solid rgba(251, 191, 36, 0.3)",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  color: "#fbbf24",
                  fontSize: "14px",
                  marginBottom: "12px",
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {"\u2139\uFE0F"} Limited debugging info:
                </span>{" "}
                {traceDiagnostics.artifactWarning}
                <div style={{ marginTop: "6px", opacity: 0.8, fontSize: "13px" }}>
                  Clicking on trace rows won't show source code. Event decoding may also be limited.
                </div>
              </div>
            )}
          </div>
        )}

        <TraceToolbar
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          searchCategory={state.searchCategory}
          onSearchCategoryChange={state.setSearchCategory}
          filters={filters}
          onFilterChange={onFilterChange}
          slotXRefEnabled={state.slotXRefEnabled}
          onSlotXRefChange={() => state.setSlotXRefEnabled(!state.slotXRefEnabled)}
          hasRevert={hasRevert}
          onGoToRevert={onGoToRevert}
          debugSession={state.debugSession}
          openDebugAtRevert={state.openDebugAtRevert}
        />

        <TraceList
          visibleRows={state.visibleRows}
          isDecoding={isDecoding}
          expandedRowId={state.expandedRowId}
          listContainerRef={state.listContainerRef}
          listRef={state.listRef}
          listHeight={state.listHeight}
          ROW_HEIGHT={state.ROW_HEIGHT}
          renderTraceRow={renderTraceRow}
          renderExpandedContent={renderExpandedContent}
        />
      </section>

      {/* Event Details Popover */}
      {state.selectedEvent && (
        <>
          <div
            className="exec-event-backdrop"
            onClick={() => state.setSelectedEvent(null)}
          />
          <div
            className={`exec-event-popover${state.selectedEvent.mode === "modal" ? " exec-event-popover--modal" : ""}`}
          >
            <div className="exec-event-popover-toolbar">
              <CopyButton value={selectedEventJson} />
              <Button
                type="button"
                variant="icon-borderless"
                size="icon-inline"
                className="exec-event-popover-close"
                onClick={() => state.setSelectedEvent(null)}
              >
                {"\u00D7"}
              </Button>
            </div>
            <pre className="exec-event-json">{selectedEventJson}</pre>
          </div>
        </>
      )}

      {state.selectedTraceDetail && (
        <>
          <div
            className="exec-event-backdrop"
            onClick={() => state.setSelectedTraceDetail(null)}
          />
          <div
            className={`exec-event-popover${state.selectedTraceDetail.mode === "modal" ? " exec-event-popover--modal" : ""}`}
          >
            <div className="exec-event-popover-toolbar">
              <div className="exec-event-popover-title">
                {state.selectedTraceDetail.title}
              </div>
              <CopyButton value={state.selectedTraceDetail.value} />
              <Button
                type="button"
                variant="icon-borderless"
                size="icon-inline"
                className="exec-event-popover-close"
                onClick={() => state.setSelectedTraceDetail(null)}
              >
                {"\u00D7"}
              </Button>
            </div>
            <pre className="exec-event-json">{state.selectedTraceDetail.value}</pre>
          </div>
        </>
      )}
    </div>
  );
};

export default ExecutionStackTrace;
