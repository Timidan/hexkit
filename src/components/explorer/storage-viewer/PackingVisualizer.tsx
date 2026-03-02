/**
 * PackingVisualizer
 *
 * Horizontal 32-byte lane showing how variables are packed within a storage slot.
 * Byte 31 on the left (MSB), byte 0 on the right (LSB), matching Solidity layout.
 *
 * Each field is a colored segment with hover tooltip showing label, type, offset, decoded value.
 * Unclaimed bytes shown as neutral dark gray segments.
 */

import React, { useMemo } from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '../../ui/hover-card';
import { Badge } from '../../ui/badge';
import type { DecodedSlotField } from '../../../types/debug';

interface PackingVisualizerProps {
  fields: DecodedSlotField[];
  rawHex?: string;
}

/** Color palette for Solidity types */
function typeColor(typeLabel: string): { bg: string; border: string; text: string } {
  const t = typeLabel.toLowerCase();
  if (t === 'address' || t.startsWith('contract '))
    return { bg: 'bg-blue-500/20', border: 'border-blue-500/40', text: 'text-blue-400' };
  if (t === 'bool')
    return { bg: 'bg-amber-500/20', border: 'border-amber-500/40', text: 'text-amber-400' };
  if (t.startsWith('uint'))
    return { bg: 'bg-green-500/20', border: 'border-green-500/40', text: 'text-green-400' };
  if (t.startsWith('int'))
    return { bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', text: 'text-emerald-400' };
  if (t.startsWith('bytes'))
    return { bg: 'bg-cyan-500/20', border: 'border-cyan-500/40', text: 'text-cyan-400' };
  if (t.startsWith('enum'))
    return { bg: 'bg-purple-500/20', border: 'border-purple-500/40', text: 'text-purple-400' };
  if (t === 'string')
    return { bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400' };
  return { bg: 'bg-gray-500/20', border: 'border-gray-500/40', text: 'text-gray-400' };
}

/** Segment in the byte lane */
interface ByteSegment {
  startByte: number; // byte offset from right (LSB = 0)
  endByte: number;   // exclusive
  field?: DecodedSlotField;
  isGap: boolean;
}

const PackingVisualizer: React.FC<PackingVisualizerProps> = ({ fields, rawHex }) => {
  /** Build segments for the 32-byte lane */
  const segments = useMemo((): ByteSegment[] => {
    if (fields.length === 0) return [];

    // Sort fields by offset (ascending)
    const sorted = [...fields].sort((a, b) => a.offset - b.offset);

    const result: ByteSegment[] = [];
    let cursor = 0;

    for (const field of sorted) {
      // Gap before this field
      if (field.offset > cursor) {
        result.push({
          startByte: cursor,
          endByte: field.offset,
          isGap: true,
        });
      }

      // The field itself
      result.push({
        startByte: field.offset,
        endByte: field.offset + field.size,
        field,
        isGap: false,
      });

      cursor = field.offset + field.size;
    }

    // Gap after last field (up to 32 bytes)
    if (cursor < 32) {
      result.push({
        startByte: cursor,
        endByte: 32,
        isGap: true,
      });
    }

    return result;
  }, [fields]);

  // Reverse for display (MSB left, LSB right)
  const displaySegments = useMemo(() => [...segments].reverse(), [segments]);

  const totalBytes = 32;

  return (
    <>
      <div className="space-y-2">
        {/* Byte lane */}
        <div className="relative">
          {/* MSB/LSB labels */}
          <div className="flex justify-between text-[9px] text-muted-foreground/60 mb-0.5 font-mono">
            <span>byte 31 (MSB)</span>
            <span>byte 0 (LSB)</span>
          </div>

          {/* The bar */}
          <div className="flex h-7 rounded-md overflow-hidden border border-border/30">
            {displaySegments.map((seg, i) => {
              const widthPct = ((seg.endByte - seg.startByte) / totalBytes) * 100;
              const colors = seg.field ? typeColor(seg.field.typeLabel) : null;

              if (seg.isGap) {
                return (
                  <HoverCard key={i}>
                    <HoverCardTrigger asChild>
                      <div
                        className="h-full bg-muted/10 border-r border-border/20 flex items-center justify-center cursor-default"
                        style={{ width: `${widthPct}%`, minWidth: widthPct > 3 ? undefined : '2px' }}
                      >
                        {widthPct > 8 && (
                          <span className="text-[8px] text-muted-foreground/30 truncate px-0.5">
                            unused
                          </span>
                        )}
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent side="top" className="text-xs">
                      <div>Unused bytes [{seg.startByte}..{seg.endByte - 1}]</div>
                      <div className="text-muted-foreground">{seg.endByte - seg.startByte} bytes</div>
                    </HoverCardContent>
                  </HoverCard>
                );
              }

              return (
                <HoverCard key={i}>
                  <HoverCardTrigger asChild>
                    <div
                      className={`h-full ${colors!.bg} border-r ${colors!.border} flex items-center justify-center cursor-pointer transition-colors hover:opacity-80`}
                      style={{ width: `${widthPct}%`, minWidth: widthPct > 3 ? undefined : '4px' }}
                    >
                      {widthPct > 12 && (
                        <span className={`text-[9px] font-medium truncate px-1 ${colors!.text}`}>
                          {seg.field!.label.split('.').pop()}
                        </span>
                      )}
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent side="top" className="max-w-xs">
                    <div className="space-y-1">
                      <div className="font-medium text-xs">{seg.field!.label}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Type: {seg.field!.typeLabel}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Offset: byte {seg.field!.offset} | Size: {seg.field!.size} byte{seg.field!.size !== 1 ? 's' : ''}
                      </div>
                      {seg.field!.decoded && (
                        <div className="text-[11px] font-mono">
                          Value: {seg.field!.decoded}
                        </div>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
          </div>

          {/* Byte offset rulers - show key positions */}
          <div className="flex justify-between text-[8px] text-muted-foreground/40 mt-0.5 font-mono">
            <span>31</span>
            <span>24</span>
            <span>16</span>
            <span>8</span>
            <span>0</span>
          </div>
        </div>

        {/* Field breakdown legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {fields.map((field, i) => {
            const colors = typeColor(field.typeLabel);
            return (
              <div key={i} className="flex items-center gap-1 text-[10px]">
                <div className={`w-2 h-2 rounded-sm ${colors.bg} border ${colors.border}`} />
                <span className={colors.text}>
                  {field.label.split('.').pop()}
                </span>
                <Badge variant="outline" className="text-[9px] h-3.5 px-1">
                  {field.typeLabel}
                </Badge>
                <span className="text-muted-foreground">
                  [{field.offset}:{field.offset + field.size - 1}]
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default PackingVisualizer;
