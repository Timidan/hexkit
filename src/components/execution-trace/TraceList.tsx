import React from "react";
import type { TraceRow } from "./traceTypes";

interface TraceListProps {
  visibleRows: Array<{ row: TraceRow; originalIndex: number }>;
  isDecoding?: boolean;
  expandedRowId: string | null;
  listContainerRef: React.RefObject<HTMLDivElement | null>;
  listRef: any;
  listHeight: number;
  ROW_HEIGHT: number;
  renderTraceRow: (row: TraceRow, index: number, visibleIdx: number) => React.ReactNode;
  renderExpandedContent?: (row: TraceRow) => React.ReactNode;
}

const TraceList: React.FC<TraceListProps> = ({
  visibleRows,
  isDecoding,
  expandedRowId,
  listContainerRef,
  renderTraceRow,
  renderExpandedContent,
}) => {
  return (
    <div className="exec-trace-list" ref={listContainerRef}>
      {visibleRows.length === 0 ? (
        <div className="exec-trace-empty">
          {isDecoding ? "Decoding trace..." : "No trace entries match the current filters."}
        </div>
      ) : (
        (() => {
          const expandedVisibleIdx = expandedRowId
            ? visibleRows.findIndex(({ row }) => row.id === expandedRowId)
            : -1;

          if (expandedVisibleIdx < 0) {
            return (
              <div className="exec-trace-rows-container">
                <div className="exec-trace-rows">
                  {visibleRows.map(({ row, originalIndex }, visibleIdx) => (
                    <div key={row.id}>
                      {renderTraceRow(row, originalIndex, visibleIdx)}
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          const beforeRows = visibleRows.slice(0, expandedVisibleIdx);
          const expandedRow = visibleRows[expandedVisibleIdx];
          const afterRows = visibleRows.slice(expandedVisibleIdx + 1);

          return (
            <div className="exec-trace-rows-container">
              {beforeRows.length > 0 && (
                <div className="exec-trace-section" style={{ position: "relative" }}>
                  <div className="exec-trace-rows">
                    {beforeRows.map(({ row, originalIndex }, idx) => (
                      <div key={row.id}>
                        {renderTraceRow(row, originalIndex, idx)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="exec-trace-section exec-trace-section--expanded">
                <div className="exec-trace-rows">
                  <div key={expandedRow.row.id}>
                    {renderTraceRow(expandedRow.row, expandedRow.originalIndex, expandedVisibleIdx)}
                  </div>
                </div>
              </div>

              {/* Inline source snippet - sticky so it doesn't scroll horizontally with trace rows */}
              {renderExpandedContent && (() => {
                const content = renderExpandedContent(expandedRow.row);
                if (!content) return null;
                return (
                  <div className="exec-inline-source">
                    {content}
                  </div>
                );
              })()}

              {afterRows.length > 0 && (
                <div className="exec-trace-section" style={{ position: "relative" }}>
                  <div className="exec-trace-rows">
                    {afterRows.map(({ row, originalIndex }, idx) => (
                      <div key={row.id}>
                        {renderTraceRow(row, originalIndex, expandedVisibleIdx + 1 + idx)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
};

export default TraceList;
