/**
 * Debug Toolbar Component
 *
 * Navigation controls for stepping through debug snapshots.
 * Primary controls: Previous, Next, Step Up, Step Over
 * Advanced controls: hidden in dropdown menu
 */

import React, { useMemo, useState } from 'react';
import {
  SkipBack,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Play,
  ArrowDownToLine,
  ArrowUpFromLine,
  CornerRightUp,
  ArrowRight,
  Pause,
  Braces,
  MoreHorizontal,
} from 'lucide-react';
import { Button } from '../ui/button';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import { Badge } from '../ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { useDebug } from '../../contexts/DebugContext';
import { useSimulation } from '../../contexts/SimulationContext';
import { EvaluateModal } from './EvaluateModal';

interface DebugToolbarProps {
  className?: string;
}

export const DebugToolbar: React.FC<DebugToolbarProps> = React.memo(({ className }) => {
  const {
    session,
    isLoading,
    currentSnapshotId,
    totalSnapshots,
    snapshotList,
    stepPrev,
    stepNext,
    stepPrevCall,
    stepNextCall,
    stepUp,
    stepOver,
    goToSnapshot,
    continueToBreakpoint,
    breakpoints,
    debugPrepState,
  } = useDebug();
  const { contractContext } = useSimulation();

  // Evaluate modal state
  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);

  const isActive = session !== null;
  const debugExplicitlyDisabled = (contractContext as any)?.debugEnabled === false;
  const prepInProgress = debugPrepState?.status === 'queued' || debugPrepState?.status === 'preparing';
  // Check session first: if a session exists (live or trace), enable evaluate.
  // Only gate on debugEnabled when there's NO session — as a hint to the user.
  const evaluateDisabledReason: string | null = prepInProgress
    ? `Debug session preparing${debugPrepState?.stage ? ` (${debugPrepState.stage})` : ''}...`
    : !isActive
      ? (debugExplicitlyDisabled
          ? 'Enable Debug mode during simulation to use expression evaluation'
          : 'No active debug session')
      : null;
  const isTraceBasedSession = session?.sessionId?.startsWith('trace-') ?? false;
  const currentTraceIndex = useMemo(() => {
    if (!isTraceBasedSession || currentSnapshotId === null) return -1;
    return snapshotList.findIndex((snap) => snap.id === currentSnapshotId);
  }, [isTraceBasedSession, currentSnapshotId, snapshotList]);

  const canStepPrev = isActive && currentSnapshotId !== null && (
    isTraceBasedSession ? currentTraceIndex > 0 : currentSnapshotId > 0
  );
  const canStepNext = isActive && currentSnapshotId !== null && (
    isTraceBasedSession
      ? currentTraceIndex >= 0 && currentTraceIndex < snapshotList.length - 1
      : currentSnapshotId < totalSnapshots - 1
  );
  const stepCount = isTraceBasedSession ? snapshotList.length : totalSnapshots;
  const stepLabel = currentSnapshotId === null
    ? '-'
    : isTraceBasedSession
      ? currentTraceIndex >= 0
        ? currentTraceIndex + 1
        : '-'
      : currentSnapshotId + 1;
  const hasBreakpoints = breakpoints.filter(bp => bp.enabled).length > 0;

  const handleGoToFirst = () => {
    if (!isActive) return;

    if (isTraceBasedSession) {
      const firstSnapshot = snapshotList[0];
      if (firstSnapshot) {
        goToSnapshot(firstSnapshot.id);
      }
    } else {
      goToSnapshot(0);
    }
  };

  const handleGoToLast = () => {
    if (!isActive) return;

    if (isTraceBasedSession) {
      const lastSnapshot = snapshotList[snapshotList.length - 1];
      if (lastSnapshot) {
        goToSnapshot(lastSnapshot.id);
      }
    } else if (totalSnapshots > 0) {
      goToSnapshot(totalSnapshots - 1);
    }
  };

  const handleContinueBackward = () => {
    if (hasBreakpoints) {
      continueToBreakpoint('backward');
    } else if (canStepPrev) {
      stepPrev();
    }
  };

  return (
    <div
      className={`flex items-center gap-1 px-3 py-1.5 bg-transparent border-b border-border/50 ${className || ''}`}
    >
      {/* PRIMARY STEP CONTROLS */}
      <div className="flex items-center border border-border/30 rounded-md overflow-hidden divide-x divide-border/20">
        <HoverCard>
          <HoverCardTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              onClick={stepUp}
              disabled={!canStepNext || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
            >
              <CornerRightUp className="h-3.5 w-3.5" />
              <span>Step Out</span>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side="top">
            <div className="flex flex-col gap-1">
              <span>Exit current call, return to caller</span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] w-fit">Shift+F11</kbd>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              onClick={stepOver}
              disabled={!canStepNext || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              <span>Step Over</span>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side="top">
            <div className="flex flex-col gap-1">
              <span>Skip nested calls, stay at current depth</span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] w-fit">F10</kbd>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              onClick={stepPrev}
              disabled={!canStepPrev || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>Prev</span>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side="top">
            <div className="flex items-center gap-2">
              <span>Previous snapshot</span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">←</kbd>
            </div>
          </HoverCardContent>
        </HoverCard>

        <HoverCard>
          <HoverCardTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              onClick={stepNext}
              disabled={!canStepNext || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-none"
            >
              <ChevronRight className="h-3.5 w-3.5" />
              <span>Next</span>
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side="top">
            <div className="flex items-center gap-2">
              <span>Next snapshot</span>
              <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">→</kbd>
            </div>
          </HoverCardContent>
        </HoverCard>
      </div>

      {/* EVALUATE EXPRESSION */}
      <HoverCard>
        <HoverCardTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsEvalModalOpen(true)}
            disabled={!!evaluateDisabledReason}
            className={`group relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent hover:border-stone-400/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all ${isTraceBasedSession ? 'opacity-70' : ''}`}
          >
            <Braces className="h-3.5 w-3.5 transition-transform group-hover:scale-110 group-hover:rotate-6" />
            <span>Evaluate</span>
            <span className="text-[8px] text-amber-500/70 font-semibold ml-0.5">beta</span>
          </Button>
        </HoverCardTrigger>
        <HoverCardContent side="top">
          <div className="flex flex-col gap-1">
            {evaluateDisabledReason ? (
              <span className="text-amber-400 text-xs">{evaluateDisabledReason}</span>
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="px-1 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] font-bold rounded">BETA</span>
                  {isTraceBasedSession ? 'Limited in trace mode' : 'Evaluate Solidity expressions'}
                </span>
                <span className="text-muted-foreground text-[10px]">May be unstable</span>
              </>
            )}
          </div>
        </HoverCardContent>
      </HoverCard>

      {/* ADVANCED CONTROLS - Dropdown */}
      <DropdownMenu>
        <HoverCard>
          <HoverCardTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                disabled={!isActive}
                className="flex items-center px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </HoverCardTrigger>
          <HoverCardContent side="top">More navigation options</HoverCardContent>
        </HoverCard>
        <DropdownMenuContent align="start" className="w-52">
          <DropdownMenuItem
            onClick={handleGoToFirst}
            disabled={!canStepPrev || isLoading}
          >
            <SkipBack className="h-4 w-4 mr-2" />
            Go to First
            <span className="ml-auto text-xs text-muted-foreground">Home</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleGoToLast}
            disabled={!canStepNext || isLoading}
          >
            <SkipForward className="h-4 w-4 mr-2" />
            Go to Last
            <span className="ml-auto text-xs text-muted-foreground">End</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={stepPrevCall}
            disabled={!canStepPrev || isLoading}
          >
            <ArrowUpFromLine className="h-4 w-4 mr-2" />
            Previous Call
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={stepNextCall}
            disabled={!canStepNext || isLoading}
          >
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Next Call
            <span className="ml-auto text-xs text-muted-foreground">F11</span>
          </DropdownMenuItem>
          {hasBreakpoints && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleContinueBackward}
                disabled={!canStepPrev || isLoading}
              >
                <Pause className="h-4 w-4 mr-2" />
                Continue Backward
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Snapshot Counter */}
      <div className="flex items-center gap-2">
        {isActive && (
          <Badge variant="secondary" className="font-mono text-xs h-7 px-3">
            Step {stepLabel} / {stepCount}
          </Badge>
        )}

        {isLoading && (
          <Badge variant="outline" className="text-xs animate-pulse">
            Loading...
          </Badge>
        )}
      </div>

      {/* Evaluate Expression Modal */}
      <EvaluateModal
        open={isEvalModalOpen}
        onOpenChange={setIsEvalModalOpen}
      />
    </div>
  );
});

DebugToolbar.displayName = 'DebugToolbar';

export default DebugToolbar;
