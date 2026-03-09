import React from 'react';
import {
  Search,
  ChevronRight,
  Loader2,
  PanelLeftOpen,
  Radar,
  Square,
  RotateCw,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { CopyableCell, ClickableValue } from './StorageCells';
import { SlotRowWithInspector } from './SlotRow';
import { shortHex, simplifyType } from './storageViewerHelpers';
import { ZERO_VALUE, MAPPING_TABLE_GRID, SLOT_TABLE_GRID } from './storageViewerTypes';
import type { DiscoveredMappingKey, ResolvedSlot, PathSegment } from './storageViewerTypes';
import type { useAutoDiscovery } from './storage-viewer/useAutoDiscovery';
import type { LoadingPhase } from './storage-viewer/useStorageEvidence';

export interface StorageTableViewProps {
  // Tree toggle
  treeOpen: boolean;
  setTreeOpen: (open: boolean) => void;
  // Loading state
  isResolvingInBackground: boolean;
  loadingPhase: LoadingPhase;
  postLoadResolving: boolean;
  isLayoutPending: boolean;
  isLoading: boolean;
  // Path navigation
  pathSegments: PathSegment[];
  navigateTo: (segIdx: number) => void;
  // Key input
  keyInput: string;
  setKeyInput: (v: string) => void;
  handleKeyLookup: () => void;
  isLookingUp: boolean;
  resolvedSlots: ResolvedSlot[];
  // Views
  isMappingView: boolean;
  displayRows: ResolvedSlot[];
  keyBySlot: Map<string, DiscoveredMappingKey>;
  // Table header ref + char limits
  tableHeaderRef: React.RefObject<HTMLDivElement | null>;
  charLimits: number[];
  // Row actions
  expandedSlot: string | null;
  toggleSlotExpansion: (slotHex: string) => void;
  handleInspect: (slot: ResolvedSlot) => void;
  // Discovery
  discovery: ReturnType<typeof useAutoDiscovery>;
  mappingEntries: { baseSlot: string }[];
  handleStartDiscovery: () => void;
  handleRescanDiscovery: () => void;
  // Search
  searchQuery: string;
}

export const StorageTableView: React.FC<StorageTableViewProps> = ({
  treeOpen,
  setTreeOpen,
  isResolvingInBackground,
  loadingPhase,
  postLoadResolving,
  isLayoutPending,
  isLoading,
  pathSegments,
  navigateTo,
  keyInput,
  setKeyInput,
  handleKeyLookup,
  isLookingUp,
  resolvedSlots,
  isMappingView,
  displayRows,
  keyBySlot,
  tableHeaderRef,
  charLimits,
  expandedSlot,
  toggleSlotExpansion,
  handleInspect,
  discovery,
  mappingEntries,
  handleStartDiscovery,
  handleRescanDiscovery,
  searchQuery,
}) => (
  <div className="flex-1 min-w-0 flex flex-col h-full">
    <div className="h-full flex flex-col">
      {/* Inline loading banner */}
      {isResolvingInBackground && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5 border-b border-primary/10 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin shrink-0 text-primary" />
          <span>
            {loadingPhase === 'seeding'
              ? 'Reading storage slots\u2026'
              : loadingPhase === 'resolving'
                ? 'Resolving storage layout\u2026'
                : postLoadResolving
                  ? 'Resolving diamond namespace\u2026'
                  : isLayoutPending
                    ? 'Updating slot types\u2026'
                    : isLoading
                      ? 'Resolving storage layout\u2026'
                      : 'Loading\u2026'}
          </span>
        </div>
      )}
      {/* Breadcrumb */}
      {pathSegments.length > 0 && (
        <div className="px-3 py-1.5 flex items-center gap-1 text-xs border-b border-border/30 bg-muted/5">
          {!treeOpen && (
            <button onClick={() => setTreeOpen(true)} className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground/60 hover:text-muted-foreground transition-colors mr-1" title="Show tree">
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => navigateTo(-1)}
            className="text-primary hover:underline"
          >
            Slots
          </button>
          {pathSegments.map((seg, i) => (
            <React.Fragment key={`${seg.baseSlot}-${i}`}>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              {i < pathSegments.length - 1 ? (
                <button
                  onClick={() => navigateTo(i)}
                  className="text-primary hover:underline"
                >
                  {seg.label}
                </button>
              ) : (
                <span className="font-medium">{seg.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {/* Key Input Panel */}
      {pathSegments.length > 0 && (() => {
        const currentSeg = pathSegments[pathSegments.length - 1];
        const isArrayDrillDown = currentSeg.slotKind === 'dynamic_array';
        const keyTypeId = currentSeg.keyTypeId;
        let keyTypeLabel = isArrayDrillDown ? 'Array index (uint256)' : 'uint256';
        if (!isArrayDrillDown && keyTypeId) {
          if (keyTypeId.includes('address') || keyTypeId.startsWith('t_contract')) keyTypeLabel = 'address';
          else if (keyTypeId.includes('bytes32')) keyTypeLabel = 'bytes32';
          else if (keyTypeId.includes('bool')) keyTypeLabel = 'bool';
          else if (/uint\d/.test(keyTypeId)) {
            const m = keyTypeId.match(/uint(\d+)/);
            keyTypeLabel = m ? `uint${m[1]}` : 'uint256';
          } else if (/int\d/.test(keyTypeId)) {
            const m = keyTypeId.match(/int(\d+)/);
            keyTypeLabel = m ? `int${m[1]}` : 'int256';
          }
        }
        const hasInput = keyInput.trim().length > 0;

        let arrayLength: string | null = null;
        if (isArrayDrillDown) {
          const baseSlotHex = currentSeg.baseSlot.toLowerCase();
          const baseSlotEntry = resolvedSlots.find(
            (s) => s.slot.toLowerCase() === baseSlotHex,
          );
          if (baseSlotEntry?.value) {
            try {
              const len = BigInt(baseSlotEntry.value);
              arrayLength = len.toString();
            } catch { /* ignore parse errors */ }
          }
        }

        return (
          <div className="px-3 py-2 border-b border-border/30 bg-muted/5 flex items-center gap-2">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <Input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={keyTypeLabel}
              className="h-7 text-xs font-mono flex-1 max-w-sm"
              onKeyDown={(e) => e.key === 'Enter' && handleKeyLookup()}
            />
            <button
              className="p-1.5 rounded-md hover:bg-muted/40 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              onClick={handleKeyLookup}
              disabled={isLookingUp || !hasInput}
              title="Lookup key"
            >
              {isLookingUp ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-colors ${hasInput ? 'text-primary' : 'text-muted-foreground/50'}`}
                >
                  <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                  <circle cx="12" cy="12" r="3" />
                  {hasInput && (
                    <animateTransform
                      attributeName="transform"
                      type="scale"
                      values="1 1;1 0.1;1 1"
                      keyTimes="0;0.5;1"
                      dur="1.5s"
                      repeatCount="indefinite"
                      additive="sum"
                      calcMode="spline"
                      keySplines="0.4 0 0.2 1;0.4 0 0.2 1"
                    />
                  )}
                </svg>
              )}
            </button>
            {arrayLength !== null && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 font-mono shrink-0">
                Length: {arrayLength}
              </Badge>
            )}
          </div>
        );
      })()}

      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/30 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {!treeOpen && (
            <button onClick={() => setTreeOpen(true)} className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="Show tree">
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
          <span>Slots ({displayRows.length})</span>
        </div>
        {/* Discovery scan controls */}
        {isMappingView && mappingEntries.length > 0 && (
          <div className="flex items-center gap-1">
            {discovery.state.phase === 'scanning' ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] gap-1 text-yellow-400"
                onClick={discovery.stopScan}
              >
                <Square className="h-2.5 w-2.5" />
                Stop
              </Button>
            ) : discovery.state.phase === 'complete' || discovery.state.phase === 'partial' ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] gap-1"
                onClick={handleRescanDiscovery}
              >
                <RotateCw className="h-2.5 w-2.5" />
                Rescan
              </Button>
            ) : discovery.state.phase === 'idle' ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[10px] gap-1"
                onClick={handleStartDiscovery}
              >
                <Radar className="h-2.5 w-2.5" />
                Scan
              </Button>
            ) : null}
            {discovery.state.phase === 'scanning' && discovery.state.progress && (
              <span className="text-[10px] text-muted-foreground">
                {Math.round((discovery.state.progress.scannedBlocks / Math.max(discovery.state.progress.totalBlocks, 1)) * 100)}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
       <div className="min-w-[720px] w-full">
        <>
            {/* Table header */}
            <div ref={tableHeaderRef} className={`grid ${isMappingView ? MAPPING_TABLE_GRID : SLOT_TABLE_GRID} gap-2 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-wider border-b border-border/20 sticky top-0 bg-background z-10 text-left`}>
              {isMappingView ? (
                <>
                  <span>KEY</span>
                  <span>SLOT</span>
                  <span>TYPE</span>
                  <span>VALUE</span>
                </>
              ) : (
                <>
                  <span>SLOT</span>
                  <span>VARIABLE</span>
                  <span>TYPE</span>
                  <span>VALUE</span>
                </>
              )}
            </div>

            {/* Rows */}
            <div>
              {isMappingView ? displayRows.map((slot) => {
                const keyMeta = keyBySlot.get(slot.slot.toLowerCase());
                const keyValue = keyMeta?.key ?? '';
                const isZero = slot.value === ZERO_VALUE;
                const decoded = slot.decodedFields?.[0]?.decoded;
                return (
                  <div
                    key={slot.slot}
                    className={`grid ${MAPPING_TABLE_GRID} gap-2 px-3 py-1.5 text-xs border-b border-border/10 hover:bg-muted/20 transition-colors text-left`}
                  >
                    <div
                      className="min-w-0 flex flex-col items-start gap-1"
                      title={keyMeta?.sourceLabels?.join(', ') || undefined}
                    >
                      <CopyableCell value={keyValue} className="text-primary" maxChars={charLimits[0] || 16} />
                      {keyMeta?.sourceLabel ? (
                        <Badge variant="secondary" className="h-4 px-1.5 text-[9px] leading-none">
                          {keyMeta.sourceLabel}
                        </Badge>
                      ) : null}
                      {(keyMeta?.evidenceCount ?? 0) > 1 ? (
                        <span className="text-[10px] text-muted-foreground">
                          {keyMeta?.evidenceCount} signals
                        </span>
                      ) : null}
                    </div>
                    <CopyableCell value={slot.slot} className="text-muted-foreground" maxChars={charLimits[1] || 16} />
                    <span>
                      <Badge variant="outline" className="text-[11px] h-[18px] rounded-sm">
                        {simplifyType(slot.typeLabel || '')}
                      </Badge>
                    </span>
                    <span className="min-w-0">
                      <ClickableValue
                        value={decoded || slot.value || '\u2014'}
                        rawValue={slot.value || undefined}
                        label={slot.label || slot.slot}
                        dimmed={isZero}
                        maxChars={charLimits[3] || 64}
                      />
                    </span>
                  </div>
                );
              }) : displayRows.map((slot) => (
                  <SlotRowWithInspector
                    key={slot.slot}
                    slot={slot}
                    isExpanded={expandedSlot === slot.slot}
                    onToggle={() => toggleSlotExpansion(slot.slot)}
                    onInspect={() => handleInspect(slot)}
                    charLimits={charLimits}
                    isResolving={isResolvingInBackground}
                  />
              ))}
              {displayRows.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-8">
                  {searchQuery ? 'No matching rows' : 'No rows available for this view'}
                </div>
              )}
            </div>
          </>
       </div>
      </div>
    </div>
  </div>
);
