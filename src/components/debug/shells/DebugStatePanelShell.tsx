// Chain-agnostic IDE-style state panel.
//
// Renders a structured `Record<string, unknown>` as colourised JSON
// inside the same chrome both EDB and the Starknet debugger sit on.
// The chain wrapper builds the state object from its native step
// shape; the shell only knows how to format values.
//
// Optional `error` field surfaces at the bottom under `[ERROR]`.

import React from "react";
import { ScrollArea } from "../../ui/scroll-area";
import { cn } from "../../../lib/utils";
import "../DebugStatePanel.css";

function formatValue(value: unknown, indent: number = 0): React.ReactNode {
  const indentStr = "  ".repeat(indent);

  if (value === null) return <span className="debug-state__null">null</span>;
  if (value === undefined)
    return <span className="debug-state__undefined">undefined</span>;

  if (typeof value === "string") {
    if (value.startsWith("0x") && value.length > 20) {
      return <span className="debug-state__hex">"{value}"</span>;
    }
    return <span className="debug-state__string">"{value}"</span>;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return <span className="debug-state__number">{String(value)}</span>;
  }

  if (typeof value === "boolean") {
    return <span className="debug-state__boolean">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="debug-state__array">[]</span>;
    }
    return (
      <>
        <span className="debug-state__bracket">[</span>
        {value.map((item, i) => (
          <React.Fragment key={i}>
            {"\n" + indentStr + "  "}
            {formatValue(item, indent + 1)}
            {i < value.length - 1 && ","}
          </React.Fragment>
        ))}
        {"\n" + indentStr}
        <span className="debug-state__bracket">]</span>
      </>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="debug-state__object">{"{}"}</span>;
    }
    return (
      <>
        <span className="debug-state__bracket">{"{"}</span>
        {entries.map(([key, val], i) => (
          <React.Fragment key={key}>
            {"\n" + indentStr + "  "}
            <span className="debug-state__key">"{key}"</span>
            <span className="debug-state__colon">: </span>
            {formatValue(val, indent + 1)}
            {i < entries.length - 1 && ","}
          </React.Fragment>
        ))}
        {"\n" + indentStr}
        <span className="debug-state__bracket">{"}"}</span>
      </>
    );
  }

  return String(value);
}

export interface DebugStatePanelShellProps {
  className?: string;
  /** State object to render. `null` shows the empty state. */
  state: Record<string, unknown> | null;
  /** Optional high-priority alert rendered before the state payload. */
  criticalAlert?: { title?: string; message: string } | null;
  /** Optional error string surfaced under `[ERROR]` at the bottom. */
  error?: string | null;
  emptyMessage?: string;
}

export const DebugStatePanelShell: React.FC<DebugStatePanelShellProps> = React.memo(
  ({
    className,
    state,
    criticalAlert,
    error,
    emptyMessage = "No snapshot selected",
  }) => {
    if (!state) {
      return (
        <div className={cn("debug-state debug-state--empty", className)}>
          <p className="text-xs text-muted-foreground p-4">{emptyMessage}</p>
        </div>
      );
    }

    const stateWithError: Record<string, unknown> = error
      ? { ...state, "[ERROR]": error }
      : state;

    return (
      <ScrollArea className={cn("debug-state", className)}>
        {criticalAlert && (
          <div className="debug-state__critical">
            <div className="debug-state__critical-title">
              {criticalAlert.title ?? "Revert reason"}
            </div>
            <div className="debug-state__critical-message">
              {criticalAlert.message}
            </div>
          </div>
        )}
        <pre className="debug-state__content">
          <code>{formatValue(stateWithError, 0)}</code>
        </pre>
      </ScrollArea>
    );
  },
);

DebugStatePanelShell.displayName = "DebugStatePanelShell";

export default DebugStatePanelShell;
