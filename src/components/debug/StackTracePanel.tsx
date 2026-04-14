
import React from 'react';
import { X, Stack, CaretDown, CaretUp } from '@phosphor-icons/react';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { cn } from '../../lib/utils';
import { useDebug } from '../../contexts/DebugContext';
import type { DebugCallFrame } from '../../types/debug';
import './StackTracePanel.css';

interface StackTracePanelProps {
  className?: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
}

const StackFrame: React.FC<{
  frame: DebugCallFrame;
  onClick?: () => void;
}> = ({ frame, onClick }) => {
  // Format: "functionName in FileName.sol:line"
  const fileName = frame.sourcePath?.split('/').pop() || 'unknown';
  const functionName = frame.functionName || 'unknown';
  const line = frame.line;

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onClick}
      className={cn(
        'stack-trace__frame',
        frame.isCurrentFrame && 'stack-trace__frame--current'
      )}
    >
      <div className="stack-trace__frame-content">
        <span className="stack-trace__function">{functionName}</span>
        {frame.sourcePath && (
          <>
            <span className="stack-trace__in"> in </span>
            <span className="stack-trace__file">
              {fileName}
              {line !== undefined && `:${line}`}
            </span>
          </>
        )}
      </div>
      {frame.isCurrentFrame && (
        <Badge variant="secondary" className="stack-trace__current-badge">
          current
        </Badge>
      )}
    </Button>
  );
};

export const StackTracePanel: React.FC<StackTracePanelProps> = React.memo(({
  className,
  isCollapsed = false,
  onToggleCollapse,
  onClose,
}) => {
  const { callStack, goToSnapshot } = useDebug();

  const handleFrameClick = (frame: DebugCallFrame) => {
    goToSnapshot(frame.rowId);
  };

  return (
    <div className={cn('stack-trace', isCollapsed && 'stack-trace--collapsed', className)}>
      <div className="stack-trace__header">
        <div className="stack-trace__title">
          <Stack className="h-4 w-4" />
          <span>Stack Trace</span>
          <Badge variant="outline" className="stack-trace__count">
            {callStack.length}
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
          {callStack.length === 0 ? (
            <div className="stack-trace__empty">
              No call stack available
            </div>
          ) : (
            <div className="stack-trace__frames">
              {[...callStack].reverse().map((frame, idx) => (
                <StackFrame
                  key={idx}
                  frame={frame}
                  onClick={() => handleFrameClick(frame)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
});

StackTracePanel.displayName = 'StackTracePanel';

export default StackTracePanel;
