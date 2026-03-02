import React from 'react';
import { SLOT_TABLE_GRID } from './storageViewerTypes';
import type { StorageIconState } from './storageViewerTypes';
import type { LoadingPhase } from './storage-viewer/useStorageEvidence';

// ─── Skeleton Loading State ──────────────────────────────────────────

export const StorageSkeleton: React.FC<{ phase: LoadingPhase; slotCount: number }> = ({ phase, slotCount }) => {
  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Inline loading indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border-b border-primary/10 text-xs text-muted-foreground">
        <div className="h-3 w-3 rounded-full border border-muted-foreground/30 border-t-primary animate-spin" />
        <span>Reading storage slots{slotCount > 0 ? ` (${slotCount} discovered)` : '\u2026'}</span>
      </div>

      {/* Table header matching actual layout */}
      <div className={`grid ${SLOT_TABLE_GRID} gap-2 px-3 py-1 border-b border-border/30 text-[10px] uppercase tracking-wider text-muted-foreground/50`}>
        <span>Slot</span>
        <span>Variable</span>
        <span>Type</span>
        <span>Value</span>
      </div>

      {/* Skeleton rows matching table grid */}
      <div className="flex-1 overflow-hidden">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className={`grid ${SLOT_TABLE_GRID} gap-2 px-3 py-1.5 border-b border-border/10`}
          >
            <div className="h-3 w-16 bg-muted-foreground/8 rounded animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
            <div className="h-3 bg-muted-foreground/6 rounded animate-pulse" style={{ width: `${35 + (i * 7) % 45}%`, animationDelay: `${i * 60 + 30}ms` }} />
            <div className="h-3 w-12 bg-muted-foreground/6 rounded animate-pulse" style={{ animationDelay: `${i * 60 + 60}ms` }} />
            <div className="h-3 bg-muted-foreground/5 rounded animate-pulse" style={{ width: `${40 + (i * 11) % 40}%`, animationDelay: `${i * 60 + 90}ms` }} />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── 2x2 grid icon -- cells animate sequentially on hover only ──────

export const StorageGridIcon: React.FC<{ size?: number; state?: StorageIconState }> = ({ size = 16, state = 'empty' }) => {
  const cols = 3;
  const rows = 2;
  const gap = 1.5;
  const cell = Math.min((size - gap * (cols - 1)) / cols, (size - gap * (rows - 1)) / rows);
  const gridW = cols * cell + (cols - 1) * gap;
  const gridH = rows * cell + (rows - 1) * gap;
  const ox = (size - gridW) / 2;
  const oy = (size - gridH) / 2;
  const positions: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions.push({ x: ox + c * (cell + gap), y: oy + r * (cell + gap) });
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={`storage-grid-icon storage-grid-${state} text-foreground`}
    >
      <style>{`
        /* Solid rectangle -- visible in empty & valid states */
        .storage-grid-empty .sg-rect { opacity: 0.35; fill: currentColor; }
        .storage-grid-valid .sg-rect { opacity: 1; fill: currentColor; }
        .storage-grid-loading .sg-rect { opacity: 0; }
        .storage-grid-loaded .sg-rect { opacity: 0; }

        /* Grid cells -- hidden in empty & valid, pulsing in loading, static in loaded */
        .storage-grid-empty .sg-cell,
        .storage-grid-valid .sg-cell { opacity: 0; }

        .storage-grid-loading .sg-cell { animation: sgPulse 2.4s ease infinite; }
        .storage-grid-loading .sgd0 { animation-delay: 0s; }
        .storage-grid-loading .sgd1 { animation-delay: 0.2s; }
        .storage-grid-loading .sgd2 { animation-delay: 0.4s; }
        .storage-grid-loading .sgd3 { animation-delay: 0.6s; }
        .storage-grid-loading .sgd4 { animation-delay: 0.8s; }
        .storage-grid-loading .sgd5 { animation-delay: 1.0s; }

        .storage-grid-loaded .sg-cell { opacity: 0.7; }

        @keyframes sgPulse {
          0%,100% { opacity: 0.3; }
          15%,45% { opacity: 1; }
        }
      `}</style>
      {/* Solid rectangle -- collapses into cells on load */}
      <rect
        className="sg-rect"
        x={ox}
        y={oy}
        width={gridW}
        height={gridH}
        rx={2}
      />
      {/* Individual grid cells */}
      {positions.map((pos, i) => (
        <rect
          key={i}
          x={pos.x}
          y={pos.y}
          width={cell}
          height={cell}
          rx={1}
          fill="currentColor"
          className={`sg-cell sgd${i}`}
        />
      ))}
    </svg>
  );
};
