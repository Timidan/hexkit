import React from 'react';
import { Bug, Check, X, Loader2, Square, ChevronRight } from 'lucide-react';
import type { DebugPrepState } from '../../types/debug';
import '../../styles/DebugPillButton.css';

const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued...',
  replay_and_collect_trace: 'Replaying transaction...',
  download_verified_sources: 'Downloading sources...',
  analyze_source: 'Analyzing source...',
  instrument_and_recompile: 'Instrumenting contracts...',
  capture_opcode_snapshots: 'Collecting snapshots...',
  tweak_bytecode: 'Replacing bytecode...',
  capture_hook_snapshots: 'Capturing hooks...',
  start_debug_rpc: 'Starting debug server...',
  ready: 'Ready',
};

interface DebugPillButtonProps {
  debugPrepState: DebugPrepState;
  isDebugging: boolean;
  isDebugLoading: boolean;
  debugEnabled?: boolean;
  hasLiveDebugSession: boolean;
  onOpenDebug: () => void;
  onCloseDebug: () => void;
  onCancelPrep: () => void;
}

export const DebugPillButton: React.FC<DebugPillButtonProps> = ({
  debugPrepState,
  isDebugging,
  isDebugLoading,
  debugEnabled,
  hasLiveDebugSession,
  onOpenDebug,
  onCloseDebug,
  onCancelPrep,
}) => {
  const { status, stage, progressPct } = debugPrepState;

  const isPreparing = status === 'queued' || status === 'preparing';
  const isReady = status === 'ready' || hasLiveDebugSession;
  const isFailed = status === 'failed';

  // Derive the visual state
  const debugExplicitlyDisabled = debugEnabled === false;

  const stageLabel = stage
    ? (STAGE_LABELS[stage] || stage)
    : 'Preparing...';

  // ── Debugging (stop) state ──────────────
  if (isDebugging) {
    return (
      <button className="debug-pill debug-pill--debugging" onClick={onCloseDebug}>
        <span className="debug-pill__content">
          <Square size={14} />
          Stop Debugging
        </span>
      </button>
    );
  }

  // ── Preparing state ─────────────────────
  if (isPreparing) {
    return (
      <button className="debug-pill debug-pill--preparing">
        <div className="debug-pill__fill" style={{ width: `${Math.max(2, progressPct)}%` }} />
        <span className="debug-pill__content">
          <Loader2 size={14} className="debug-pill__spinner" />
          <span className="debug-pill__stage">{stageLabel}</span>
          <span className="debug-pill__pct">{progressPct}%</span>
          <button
            className="debug-pill__cancel"
            onClick={(e) => { e.stopPropagation(); onCancelPrep(); }}
            aria-label="Cancel debug preparation"
          >
            <X size={12} />
          </button>
        </span>
      </button>
    );
  }

  // ── Ready state ─────────────────────────
  if (isReady) {
    return (
      <button className="debug-pill debug-pill--ready" onClick={onOpenDebug}>
        <span className="debug-pill__content">
          <Check size={16} strokeWidth={2.5} />
          Open Debugger
          <ChevronRight size={14} />
        </span>
      </button>
    );
  }

  // ── Failed state (persistent until reset) ──────────
  if (isFailed) {
    const failureMessage = debugPrepState.error || 'Debug preparation failed';
    return (
      <button
        className="debug-pill debug-pill--failed"
        onClick={onCancelPrep}
        title={failureMessage}
      >
        <span className="debug-pill__content">
          <X size={14} />
          Prep Failed
        </span>
      </button>
    );
  }

  // ── Idle / default state ────────────────
  const disabled = isDebugLoading || debugExplicitlyDisabled;
  return (
    <button
      className="debug-pill"
      onClick={onOpenDebug}
      disabled={disabled}
      title={debugExplicitlyDisabled ? 'Re-simulate with Debug enabled to access the debugger' : undefined}
    >
      <span className="debug-pill__content">
        <Bug size={16} className={isDebugLoading ? 'debug-pill__spinner' : ''} />
        {isDebugLoading ? 'Connecting...' : 'Debug'}
      </span>
    </button>
  );
};
