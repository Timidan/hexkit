// Chain-agnostic stack-trace panel.
//
// EVM and Cairo VM both have a notion of a call stack — frames with a
// label, a source location, and a "currently active" marker. The shell
// renders a `StackFrameRow[]`; chain wrappers translate their native
// frame shape to that.

import React from "react";
import { X, Stack, CaretDown, CaretUp } from "@phosphor-icons/react";
import { ScrollArea } from "../../ui/scroll-area";
import { Button } from "../../ui/button";
import { Badge } from "../../ui/badge";
import { cn } from "../../../lib/utils";
import "../StackTracePanel.css";

export interface StackFrameRow {
  /** Stable identity for click handlers. */
  id: string | number;
  /** "transfer", "set_locking_contract", … */
  functionName?: string | null;
  /** Source path for the secondary label ("in Erc20.sol:42"). Optional. */
  sourcePath?: string | null;
  /** Line number for the secondary label. Optional. */
  line?: number | null;
  /** Active leaf frame — gets the highlight + "current" badge. */
  isCurrent?: boolean;
  /** Optional override for the secondary label (overrides `sourcePath:line`). */
  secondary?: string | null;
}

export interface StackTracePanelShellProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  /** Frames in caller→callee order. The shell reverses internally so the
   *  active leaf renders at the top (matching standard debugger UX). */
  frames: StackFrameRow[];
  onFrameClick?: (frame: StackFrameRow) => void;
  emptyMessage?: string;
  title?: string;
}

const StackFrameButton: React.FC<{
  frame: StackFrameRow;
  onClick?: () => void;
}> = ({ frame, onClick }) => {
  const fileName =
    frame.secondary ??
    (frame.sourcePath
      ? `${frame.sourcePath.split("/").pop() || frame.sourcePath}${
          frame.line != null ? `:${frame.line}` : ""
        }`
      : null);
  const functionName = frame.functionName || "unknown";
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        "stack-trace__frame",
        frame.isCurrent && "stack-trace__frame--current",
      )}
    >
      <div className="stack-trace__frame-content">
        <span className="stack-trace__function">{functionName}</span>
        {fileName && (
          <>
            <span className="stack-trace__in"> in </span>
            <span className="stack-trace__file">{fileName}</span>
          </>
        )}
      </div>
      {frame.isCurrent && (
        <Badge variant="secondary" className="stack-trace__current-badge">
          current
        </Badge>
      )}
    </Button>
  );
};

export const StackTracePanelShell: React.FC<StackTracePanelShellProps> = React.memo(
  ({
    className,
    isCollapsed = false,
    onToggleCollapse,
    onClose,
    frames,
    onFrameClick,
    emptyMessage = "No call stack available",
    title = "Stack Trace",
  }) => {
    return (
      <div className={cn("stack-trace", isCollapsed && "stack-trace--collapsed", className)}>
        <div className="stack-trace__header">
          <div className="stack-trace__title">
            <Stack className="h-4 w-4" />
            <span>{title}</span>
            <Badge variant="outline" className="stack-trace__count">
              {frames.length}
            </Badge>
          </div>

          <div className="stack-trace__actions">
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onToggleCollapse}
                className="stack-trace__toggle"
              >
                {isCollapsed ? (
                  <CaretUp className="h-3 w-3" />
                ) : (
                  <CaretDown className="h-3 w-3" />
                )}
              </Button>
            )}
            {onClose && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                className="stack-trace__close"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {!isCollapsed && (
          <ScrollArea className="stack-trace__content">
            {frames.length === 0 ? (
              <div className="stack-trace__empty">{emptyMessage}</div>
            ) : (
              <div className="stack-trace__frames">
                {[...frames].reverse().map((frame) => (
                  <StackFrameButton
                    key={frame.id}
                    frame={frame}
                    onClick={onFrameClick ? () => onFrameClick(frame) : undefined}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        )}
      </div>
    );
  },
);

StackTracePanelShell.displayName = "StackTracePanelShell";

export default StackTracePanelShell;
