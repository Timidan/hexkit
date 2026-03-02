import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../ui/dialog';
import type { ResolvedSlot } from '../../../types/debug';

interface StorageSlotGraphProps {
  isOpen: boolean;
  onClose: () => void;
  resolvedSlots: ResolvedSlot[];
}

/* ── Intensity: log2-ish bucketing from slot value hex ── */
function intensity(hex: string | undefined): number {
  if (!hex || /^0x0*$/.test(hex)) return 0;
  const stripped = hex.replace(/^0x0*/, '');
  const bits = stripped.length * 4;
  if (bits <= 4) return 1;
  if (bits <= 32) return 2;
  if (bits <= 96) return 3;
  if (bits <= 192) return 4;
  return 5;
}

const COLORS = [
  '#161616', // 0 - empty
  '#3b1111', // 1
  '#5c1a1a', // 2
  '#8b2020', // 3
  '#b91c1c', // 4
  '#ef4444', // 5 - full
];

const StorageSlotGraph: React.FC<StorageSlotGraphProps> = ({
  isOpen,
  onClose,
  resolvedSlots,
}) => {
  const { cells, nonZero, total } = useMemo(() => {
    const mapped = resolvedSlots.map((s) => ({
      slot: s.slot,
      label: s.label || s.slot.slice(0, 12) + '…',
      type: s.typeLabel || 'unknown',
      level: intensity(s.value),
    }));
    return {
      cells: mapped,
      nonZero: mapped.filter((c) => c.level > 0).length,
      total: mapped.length,
    };
  }, [resolvedSlots]);

  const pct = total > 0 ? ((nonZero / total) * 100).toFixed(1) : '0';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <style>{`.slot-graph-cell{transition:transform .1s}.slot-graph-cell:hover{transform:scale(2);z-index:10;box-shadow:0 0 6px rgba(239,68,68,.5)}`}</style>
        <DialogHeader>
          <DialogTitle className="text-base">Storage Slot Graph</DialogTitle>
          <DialogDescription>
            Each cell is one storage slot. Hover for details.
          </DialogDescription>
        </DialogHeader>

        {/* Legend */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Empty</span>
          {COLORS.map((c, i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: c }}
            />
          ))}
          <span>Full</span>
        </div>

        {/* Grid */}
        <div
          className="max-h-[60vh] overflow-y-auto rounded-md p-3"
          style={{ background: '#0a0a0a' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, 10px)',
              gap: '3px',
            }}
          >
            {cells.map((c, i) => (
              <div
                key={i}
                title={`${c.slot.slice(0, 14)}… · ${c.label} · ${c.type}`}
                className="slot-graph-cell"
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  background: COLORS[c.level],
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="text-[11px] text-muted-foreground flex items-center gap-4">
          <span>{total} slots</span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: '#ef4444' }}
            />
            {nonZero} non-zero
          </span>
          <span>{pct}% density</span>
          {/* Density bar */}
          <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: '#1a1a1a' }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #5c1a1a, #ef4444)',
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StorageSlotGraph;
