import React, { useMemo } from "react";
import { useDebug } from "../../contexts/DebugContext";
import {
  StackTracePanelShell,
  type StackFrameRow,
} from "./shells/StackTracePanelShell";

interface StackTracePanelProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}

export const StackTracePanel: React.FC<StackTracePanelProps> = React.memo(
  ({ className, isCollapsed, onToggleCollapse, onClose }) => {
    const { callStack, goToSnapshot } = useDebug();

    const frames = useMemo<StackFrameRow[]>(() => {
      return callStack.map((frame, idx) => ({
        id: `${frame.rowId}-${idx}`,
        functionName: frame.functionName,
        sourcePath: frame.sourcePath,
        line: frame.line ?? null,
        isCurrent: frame.isCurrentFrame,
      }));
    }, [callStack]);

    const handleFrameClick = (clicked: StackFrameRow) => {
      const idx = frames.findIndex((f) => f.id === clicked.id);
      if (idx < 0) return;
      const original = callStack[idx];
      if (original) goToSnapshot(original.rowId);
    };

    return (
      <StackTracePanelShell
        className={className}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        onClose={onClose}
        frames={frames}
        onFrameClick={handleFrameClick}
      />
    );
  },
);

StackTracePanel.displayName = "StackTracePanel";

export default StackTracePanel;
