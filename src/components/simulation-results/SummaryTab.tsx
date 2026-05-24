import React, { Suspense } from "react";
import { Info } from "@phosphor-icons/react";
import type { SimulationResult } from "../../types/transaction";
import type { TraceRow, TraceFilters } from "../ExecutionStackTrace";
import LoadingSpinner from "../shared/LoadingSpinner";

const ExecutionStackTrace = React.lazy(() => import("../ExecutionStackTrace"));

interface SummaryTabProps {
  result: SimulationResult;
  artifacts: any;
  errorMessage: string | null;
  revertInfo: {
    message: string;
    sourceLineContent: string | null;
    fileName: string | null;
    lineNumber: number | null;
    contractName: string | null;
    callStack: Array<{ fn: string; file: string; line: number }>;
  } | null;
  filteredTraceRows: TraceRow[];
  isTraceDecoding: boolean;
  deferredSearchQuery: string;
  setSearchQuery: (q: string) => void;
  traceFilters: TraceFilters;
  handleToggleFilter: (key: keyof TraceFilters) => void;
  handleGoToRevert: () => void;
  revertRowId: string | null;
  rawInput: string;
  returnData: string | null;
  decodedTrace: any;
  traceDiagnostics: any;
  highlightedValue: string | null;
  setHighlightedValue: (v: string | null) => void;
}

export const SummaryTab: React.FC<SummaryTabProps> = ({
  result,
  artifacts,
  errorMessage,
  revertInfo,
  filteredTraceRows,
  isTraceDecoding,
  deferredSearchQuery,
  setSearchQuery,
  traceFilters,
  handleToggleFilter,
  handleGoToRevert,
  revertRowId,
  rawInput,
  returnData,
  decodedTrace,
  traceDiagnostics,
  highlightedValue,
  setHighlightedValue,
}) => {
  return (
    <>
      {/* Simulator notes (methodology disclosures from EDB local replay) */}
      {result?.warnings && result.warnings.length > 0 && (
        <section className="mb-5 max-w-3xl rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <div className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-amber-300/85">
            <Info weight="fill" className="h-3 w-3" />
            Simulator notes
          </div>
          <ul className="flex flex-col gap-1.5">
            {result.warnings.map((warning: any, i: number) => {
              const text =
                typeof warning === "string"
                  ? warning.length > 240
                    ? warning.slice(0, 240) + "\u2026"
                    : warning
                  : JSON.stringify(warning);
              return (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[12px] leading-snug text-zinc-300"
                >
                  <span
                    aria-hidden
                    className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-amber-400/70"
                  />
                  <span>{text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {/* Stack Trace - Rich Error Display */}
      {errorMessage && (
        <div className="sim-error-banner" style={{ marginBottom: "20px" }}>
          <div className="sim-error-banner__message">
            <strong style={{ color: "var(--sim-error, #f87171)" }}>Error Message:</strong>{" "}
            <span style={{ color: "var(--sim-error, #f87171)" }}>{errorMessage}</span>
          </div>
          {revertInfo?.sourceLineContent && (
            <div className="sim-error-banner__source" style={{ marginTop: "12px" }}>
              <span style={{ color: "#fbbf24", marginRight: "8px" }}>Warning</span>
              <code style={{
                fontFamily: "monospace",
                fontSize: "14px",
                color: "#e2e8f0",
                backgroundColor: "rgba(0,0,0,0.3)",
                padding: "4px 8px",
                borderRadius: "4px",
              }}>
                {revertInfo.sourceLineContent}
              </code>
            </div>
          )}
          {revertInfo?.fileName && revertInfo?.lineNumber && (
            <div style={{ marginTop: "8px", fontSize: "13px", color: "#94a3b8" }}>
              at <span style={{ color: "#60a5fa" }}>{revertInfo.fileName}:{revertInfo.lineNumber}</span>
              {revertInfo.contractName && (
                <span> in <span style={{ color: "#a78bfa" }}>{revertInfo.contractName}</span></span>
              )}
            </div>
          )}
          {revertInfo?.callStack && revertInfo.callStack.length > 0 && (
            <div style={{ marginTop: "16px", borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: "12px" }}>
              {revertInfo.callStack.map((entry, idx) => (
                <div key={idx} style={{
                  fontSize: "13px",
                  color: "#94a3b8",
                  marginBottom: "4px",
                  paddingLeft: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}>
                  <span style={{ color: idx === 0 ? "#f87171" : "#6b7280" }}>
                    {idx === 0 ? "\u2297" : "\u21BB"}
                  </span>
                  <span style={{ color: "#e2e8f0" }}>{entry.fn}</span>
                  {entry.file && entry.line > 0 && (
                    <span style={{ color: "#64748b" }}>
                      at <span style={{ color: "#60a5fa" }}>{entry.file}:{entry.line}</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Suspense fallback={<LoadingSpinner text="Loading" />}>
        <ExecutionStackTrace
          traceRows={filteredTraceRows}
          isDecoding={isTraceDecoding}
          searchQuery={deferredSearchQuery}
          onSearchChange={setSearchQuery}
          filters={traceFilters}
          onFilterChange={handleToggleFilter}
          onGoToRevert={handleGoToRevert}
          hasRevert={!!revertRowId}
          selectedInput={rawInput}
          selectedOutput={returnData}
          sourceLines={decodedTrace?.sourceLines}
          sourceTexts={decodedTrace?.sourceTexts}
          traceDiagnostics={traceDiagnostics}
          traceEvents={decodedTrace?.rawEvents}
          senderAddress={decodedTrace?.callMeta?.caller || result.from || undefined}
          highlightedValue={highlightedValue}
          onHighlightChange={setHighlightedValue}
          implementationToProxy={decodedTrace?.implementationToProxy}
          assetChanges={artifacts?.assetChanges}
        />
      </Suspense>
    </>
  );
};
