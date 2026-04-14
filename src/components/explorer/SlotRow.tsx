import React from 'react';
import { ArrowRight, ClockCounterClockwise, Stack, Sparkle } from '@phosphor-icons/react';
import { Badge } from '../ui/badge';
import { CopyButton } from '../ui/copy-button';
import { CopyableCell, ClickableValue } from './StorageCells';
import {
  cleanLabel,
  simplifyType,
  getDecodedSummary,
  getDecodeKindDescription,
  getDecodeKindLabel,
  getProvenanceLabel,
} from './storageViewerHelpers';
import { ZERO_VALUE, SLOT_TABLE_GRID } from './storageViewerTypes';
import type { ResolvedSlot } from './storageViewerTypes';
import PackingVisualizer from './storage-viewer/PackingVisualizer';
import { cn } from '../../lib/utils';

export interface SlotRowWithInspectorProps {
  slot: ResolvedSlot;
  isExpanded: boolean;
  onToggle: () => void;
  onInspect: () => void;
  charLimits: number[];
  isResolving?: boolean;
}

export const SlotRowWithInspector: React.FC<SlotRowWithInspectorProps> = React.memo(({
  slot,
  isExpanded,
  onToggle,
  onInspect,
  charLimits,
  isResolving,
}) => {
  const isZero = slot.value === ZERO_VALUE;
  const isReference = slot.kind === 'mapping' || slot.kind === 'dynamic_array';
  const hasMutation = slot.before !== undefined || slot.after !== undefined;
  const decodedSummary = getDecodedSummary(slot);
  return (
    <div className="border-b border-border/10">
      <div className="relative group">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
          className={`w-full grid ${SLOT_TABLE_GRID} gap-2 px-3 py-1.5 text-xs hover:bg-muted/20 transition-colors cursor-pointer text-left ${
            isExpanded ? 'bg-primary/5 border-l-2 border-l-primary' : ''
          }`}
        >
          <CopyableCell value={slot.slot} className="text-muted-foreground" maxChars={charLimits[0] || 16} />
          <span className="text-xs truncate min-w-0">
            {slot.isPacked && slot.decodedFields && slot.decodedFields.length > 1 ? (
              <span className="text-foreground truncate">
                {slot.decodedFields.map((f) => {
                  const name = f.label.includes('.') ? f.label.split('.').pop() : f.label;
                  return name || f.typeLabel;
                }).join(', ')}
              </span>
            ) : slot.label ? (
              <span className="text-foreground truncate">{cleanLabel(slot.label)}</span>
            ) : (
              <span className={cn("text-muted-foreground/50 italic", isResolving && "slot-badge-shimmer")}>unknown</span>
            )}
          </span>
          <span>
            {slot.isPacked && slot.decodedFields && slot.decodedFields.length > 1 ? (
              <span className="flex flex-nowrap gap-1">
                {slot.decodedFields.map((field, i) => (
                  <Badge key={i} variant="outline" className="text-[11px] h-[18px] rounded-sm whitespace-nowrap">
                    {simplifyType(field.typeLabel)}
                  </Badge>
                ))}
              </span>
            ) : (
              <Badge variant="outline" className={cn("text-[11px] h-[18px] rounded-sm", slot.decodeKind === 'unknown' && isResolving && "slot-badge-shimmer")}>
                {simplifyType(slot.typeLabel || '')}
              </Badge>
            )}
          </span>
          <span className="min-w-0">
            {isReference ? (
              <span className="font-mono text-xs text-cyan-400 italic">mapping</span>
            ) : (
              <ClickableValue
                value={decodedSummary || slot.value || '\u2014'}
                rawValue={slot.value || undefined}
                label={slot.label || slot.slot}
                dimmed={isZero}
                maxChars={charLimits[3] || 64}
              />
            )}
          </span>
        </div>
        <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-1">
          {isReference ? (
            <button
              onClick={(e) => { e.stopPropagation(); onInspect(); }}
              className="text-[10px] px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
            >
              Inspect
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/30 hover:bg-muted/80 transition-colors"
            >
              Detail
            </button>
          )}
        </div>
      </div>

      {isExpanded && <InlineInspector slot={slot} />}
    </div>
  );
});
SlotRowWithInspector.displayName = 'SlotRowWithInspector';

interface InlineInspectorProps {
  slot: ResolvedSlot;
}

const InlineInspector: React.FC<InlineInspectorProps> = ({ slot }) => {
  const isZero = slot.value === ZERO_VALUE;
  const hasDecodedFields = slot.decodedFields && slot.decodedFields.length > 0;
  const hasPackingViz = slot.isPacked && slot.decodedFields && slot.decodedFields.length > 1;
  const hasMutation = slot.before !== undefined || slot.after !== undefined;

  return (
    <div className="px-3 py-3 bg-muted/5 border-t border-border/20 space-y-3">
      <div>
        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          <Sparkle className="h-3 w-3 text-primary" />
          Resolution
        </div>
        <div className="bg-muted/10 rounded border border-border/20 p-2 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] h-5">
                {getDecodeKindLabel(slot.decodeKind)}
              </Badge>
              <Badge variant="outline" className="text-[10px] h-5">
                {slot.confidence} confidence
              </Badge>
              {hasMutation && (
                <Badge variant="outline" className="text-[10px] h-5 text-amber-300 border-amber-500/30">
                  <ClockCounterClockwise className="h-2.5 w-2.5 mr-1" />
                  Changed
                </Badge>
              )}
              {slot.provenance.map((source) => (
                <Badge key={source} variant="secondary" className="text-[10px] h-5">
                  {getProvenanceLabel(source)}
                </Badge>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {getDecodeKindDescription(slot)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground mb-0.5 flex items-center justify-between">
            Slot
            <CopyButton value={slot.slot} ariaLabel="Copy slot" iconSize={10} />
          </div>
          <code className="block text-xs font-mono bg-muted/20 rounded px-2 py-1 break-all">
            {slot.slot}
          </code>
        </div>

        {slot.value && (
          <div>
            <div className="text-xs text-muted-foreground mb-0.5 flex items-center justify-between">
              Raw Value
              <CopyButton value={slot.value} ariaLabel="Copy value" iconSize={10} />
            </div>
            <code
              className={`block text-xs font-mono bg-muted/20 rounded px-2 py-1 break-all ${
                isZero ? 'text-muted-foreground/40' : ''
              }`}
            >
              {slot.value}
            </code>
          </div>
        )}
      </div>

      {hasDecodedFields && !isZero && (
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            Decoded Values
            {slot.isPacked && (
              <Badge variant="outline" className="text-[9px] h-3.5 text-cyan-400 border-cyan-400/30">
                packed
              </Badge>
            )}
          </div>
          <div className="bg-muted/10 rounded border border-border/20 overflow-hidden">
            <div className="grid grid-cols-[minmax(80px,1fr)_80px_minmax(80px,1fr)_auto] gap-2 px-2 py-1 text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border/20 bg-muted/10 text-left">
              <span>Variable</span>
              <span>Type</span>
              <span>Value</span>
              <span className="w-4" />
            </div>
            {slot.decodedFields!
              .filter((field) => {
                if (slot.decodeKind === 'unknown' && field.typeLabel === 'zero') return false;
                return true;
              })
              .map((field, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[minmax(80px,1fr)_80px_minmax(80px,1fr)_auto] gap-2 px-2 py-1.5 text-xs border-b border-border/10 last:border-b-0 hover:bg-muted/10 text-left"
                >
                  <span className="font-medium truncate">
                    {field.label || <span className="text-muted-foreground/50 italic">-</span>}
                  </span>
                  <Badge variant="outline" className="text-[11px] h-[18px] w-fit">
                    {field.typeLabel}
                  </Badge>
                  <span className="font-mono truncate">{field.decoded}</span>
                  <CopyButton value={field.decoded} ariaLabel={`Copy ${field.label}`} iconSize={10} />
                </div>
              ))}
          </div>
        </div>
      )}

      {hasPackingViz && (
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Stack className="h-3 w-3 text-cyan-400" />
            Slot Packing Layout
          </div>
          <div className="bg-muted/10 rounded border border-border/20 p-2">
            <PackingVisualizer fields={slot.decodedFields!} rawHex={slot.value} />
          </div>
        </div>
      )}

      {(slot.before || slot.after) && (
        <div>
          <div className="text-xs text-muted-foreground mb-0.5">State Diff</div>
          <div className="flex items-center gap-2 text-xs bg-muted/10 rounded border border-border/20 px-2 py-1.5">
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground mb-0.5">Before</div>
              <code className="font-mono text-red-400/80 text-xs break-all block">
                {slot.before || '\u2014'}
              </code>
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-muted-foreground mb-0.5">After</div>
              <code className="font-mono text-green-400 text-xs break-all block">
                {slot.after || '\u2014'}
              </code>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
