import React, { useMemo, useState } from "react";
import { useDebug } from "../../contexts/DebugContext";
import { useSimulation } from "../../contexts/SimulationContext";
import { EvaluateModal } from "./EvaluateModal";
import { DebugToolbarShell } from "./shells/DebugToolbarShell";

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

  const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);

  const isActive = session !== null;
  const debugExplicitlyDisabled =
    (contractContext as { debugEnabled?: boolean } | null | undefined)?.debugEnabled === false;
  const prepInProgress =
    debugPrepState?.status === "queued" || debugPrepState?.status === "preparing";
  const evaluateDisabledReason: string | null = prepInProgress
    ? `Debug session preparing${debugPrepState?.stage ? ` (${debugPrepState.stage})` : ""}...`
    : !isActive
      ? debugExplicitlyDisabled
        ? "Enable Debug mode during simulation to use expression evaluation"
        : "No active debug session"
      : null;
  const isTraceBasedSession = session?.sessionId?.startsWith("trace-") ?? false;

  const traceSnapshotIndexById = useMemo(() => {
    if (!isTraceBasedSession) return null;
    return new Map(snapshotList.map((snap, index) => [snap.id, index]));
  }, [isTraceBasedSession, snapshotList]);
  const currentTraceIndex =
    currentSnapshotId === null
      ? -1
      : traceSnapshotIndexById?.get(currentSnapshotId) ?? -1;

  const canStepPrev =
    isActive &&
    currentSnapshotId !== null &&
    (isTraceBasedSession ? currentTraceIndex > 0 : currentSnapshotId > 0);
  const canStepNext =
    isActive &&
    currentSnapshotId !== null &&
    (isTraceBasedSession
      ? currentTraceIndex >= 0 && currentTraceIndex < snapshotList.length - 1
      : currentSnapshotId < totalSnapshots - 1);
  const stepCount = isTraceBasedSession ? snapshotList.length : totalSnapshots;
  const stepLabel: number | string =
    currentSnapshotId === null
      ? "-"
      : isTraceBasedSession
        ? currentTraceIndex >= 0
          ? currentTraceIndex + 1
          : "-"
        : currentSnapshotId + 1;
  const hasActiveBreakpoints = breakpoints.filter((bp) => bp.enabled).length > 0;

  const handleGoToFirst = () => {
    if (!isActive) return;
    if (isTraceBasedSession) {
      const firstSnapshot = snapshotList[0];
      if (firstSnapshot) goToSnapshot(firstSnapshot.id);
    } else {
      goToSnapshot(0);
    }
  };

  const handleGoToLast = () => {
    if (!isActive) return;
    if (isTraceBasedSession) {
      const lastSnapshot = snapshotList[snapshotList.length - 1];
      if (lastSnapshot) goToSnapshot(lastSnapshot.id);
    } else if (totalSnapshots > 0) {
      goToSnapshot(totalSnapshots - 1);
    }
  };

  const handleContinueBackward = () => {
    if (hasActiveBreakpoints) {
      continueToBreakpoint("backward");
    } else if (canStepPrev) {
      stepPrev();
    }
  };

  return (
    <>
      <DebugToolbarShell
        className={className}
        isActive={isActive}
        isLoading={isLoading}
        stepLabel={stepLabel}
        totalSteps={stepCount}
        canStepPrev={canStepPrev}
        canStepNext={canStepNext}
        onStepPrev={stepPrev}
        onStepNext={stepNext}
        onStepOut={stepUp}
        onStepOver={stepOver}
        onGoToFirst={handleGoToFirst}
        onGoToLast={handleGoToLast}
        onStepPrevCall={stepPrevCall}
        onStepNextCall={stepNextCall}
        onContinueBackward={handleContinueBackward}
        hasBreakpoints={hasActiveBreakpoints}
        onOpenEvaluate={() => setIsEvalModalOpen(true)}
        evaluateDisabledReason={evaluateDisabledReason}
        evaluateBeta
      />
      <EvaluateModal open={isEvalModalOpen} onOpenChange={setIsEvalModalOpen} />
    </>
  );
});

DebugToolbar.displayName = "DebugToolbar";

export default DebugToolbar;
