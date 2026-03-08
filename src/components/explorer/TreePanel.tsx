import React from 'react';
import {
  ChevronRight,
  ChevronDown,
  Eye,
  Loader2,
  Plus,
  Trash2,
  Layers,
  PanelLeftClose,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { CopyButton } from '../ui/copy-button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '../ui/collapsible';
import { shortHex } from './storageViewerHelpers';
import type { ResolvedSlot, SlotMode, MappingKey } from './storageViewerTypes';
import type { useAutoDiscovery } from './storage-viewer/useAutoDiscovery';

export interface TreePanelProps {
  treeGroups: Record<string, ResolvedSlot[]>;
  treeExpandedGroups: Set<string>;
  toggleTreeGroup: (group: string) => void;
  expandedSlot: string | null;
  handleInspect: (slot: ResolvedSlot) => void;
  toggleSlotExpansion: (slotHex: string) => void;
  discovery: ReturnType<typeof useAutoDiscovery>;
  setTreeOpen: (open: boolean) => void;
  probeMode: SlotMode;
  setProbeMode: (mode: SlotMode) => void;
  baseSlotInput: string;
  setBaseSlotInput: (input: string) => void;
  mappingKey: MappingKey;
  setMappingKey: (key: MappingKey) => void;
  arrayIndex: string;
  setArrayIndex: (index: string) => void;
  nestedKeys: MappingKey[];
  addNestedKey: () => void;
  removeNestedKey: (i: number) => void;
  updateNestedKey: (i: number, field: 'type' | 'value', val: string) => void;
  computedSlot: { hex: string; raw: bigint; error: string | null };
  handleProbeSlot: () => void;
  manualSlotReading: boolean;
  contractAddress: string;
}

export const TreePanel: React.FC<TreePanelProps> = ({
  treeGroups,
  treeExpandedGroups,
  toggleTreeGroup,
  expandedSlot,
  handleInspect,
  toggleSlotExpansion,
  discovery,
  setTreeOpen,
  probeMode,
  setProbeMode,
  baseSlotInput,
  setBaseSlotInput,
  mappingKey,
  setMappingKey,
  arrayIndex,
  setArrayIndex,
  nestedKeys,
  addNestedKey,
  removeNestedKey,
  updateNestedKey,
  computedSlot,
  handleProbeSlot,
  manualSlotReading,
  contractAddress,
}) => (
  <div className="w-full md:w-[240px] md:min-w-[200px] md:max-w-[320px] border-r border-border/30 flex flex-col h-full">
    <div className="px-2 py-1.5 flex items-center justify-between border-b border-border/30">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Storage Tree</span>
      <button onClick={() => setTreeOpen(false)} className="p-0.5 rounded hover:bg-muted/40 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="Collapse tree">
        <PanelLeftClose className="h-3.5 w-3.5" />
      </button>
    </div>
      <ScrollArea className="flex-1">
        <div className="py-1">
          {(['variables', 'mappings', 'arrays', 'proxy', 'unknown'] as const).map(
            (group) => {
              const items = treeGroups[group];
              if (items.length === 0) return null;
              const isExpanded = treeExpandedGroups.has(group);
              const groupLabel = group.charAt(0).toUpperCase() + group.slice(1);

              return (
                <div key={group}>
                  <button
                    onClick={() => toggleTreeGroup(group)}
                    className="w-full flex items-center gap-1 px-2 py-1 text-xs hover:bg-muted/30 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <span className="font-medium">{groupLabel}</span>
                    <Badge variant="secondary" className="text-[10px] h-4 ml-auto">
                      {items.length}
                    </Badge>
                  </button>
                  {isExpanded && (
                    <div className="ml-3">
                      {items.map((slot) => {
                        const isActive = expandedSlot === slot.slot;
                        return (
                          <button
                            key={slot.slot}
                            onClick={() => {
                              if (slot.kind === 'mapping' || slot.kind === 'dynamic_array') {
                                handleInspect(slot);
                              } else {
                                toggleSlotExpansion(slot.slot);
                              }
                            }}
                            className={`w-full text-left px-2 py-0.5 text-xs truncate hover:bg-muted/20 transition-colors flex items-center gap-1 ${
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground'
                            }`}
                          >
                            {slot.isPacked && (
                              <Layers className="h-2.5 w-2.5 text-cyan-400 shrink-0" />
                            )}
                            <span className="truncate flex-1">
                              {slot.label
                                ? slot.label.replace(/\s*\(.*$/, '')
                                : shortHex(slot.slot, 4, 4)}
                            </span>
                            {slot.kind === 'mapping' && (() => {
                              const keyCount = discovery.getKeyCountForSlot(slot.slot);
                              return keyCount > 0 ? (
                                <Badge variant="secondary" className="text-[9px] h-3.5 px-1 shrink-0 text-cyan-400">
                                  {keyCount}
                                </Badge>
                              ) : null;
                            })()}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            },
          )}
        </div>

        {/* Slot Derivation / Probe section */}
        <Collapsible>
          <div className="border-t border-border/30 px-2 py-1.5">
            <CollapsibleTrigger className="w-full flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="h-3 w-3 transition-transform [[data-state=open]>&]:rotate-90" />
              Probe Slot
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="px-2 pb-2 space-y-1.5">
              <Select value={probeMode} onValueChange={(v) => setProbeMode(v as SlotMode)}>
                <SelectTrigger className="h-6 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple Variable</SelectItem>
                  <SelectItem value="mapping">Mapping</SelectItem>
                  <SelectItem value="array">Dynamic Array</SelectItem>
                  <SelectItem value="nested">Nested Mapping</SelectItem>
                </SelectContent>
              </Select>

              <Input
                value={baseSlotInput}
                onChange={(e) => setBaseSlotInput(e.target.value)}
                placeholder="Base slot (0 or 0x...)"
                className="h-6 text-xs font-mono"
              />

              {probeMode === 'mapping' && (
                <div className="space-y-1">
                  <Select value={mappingKey.type} onValueChange={(v) => setMappingKey({ ...mappingKey, type: v })}>
                    <SelectTrigger className="h-6 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="address">address</SelectItem>
                      <SelectItem value="uint256">uint256</SelectItem>
                      <SelectItem value="bytes32">bytes32</SelectItem>
                      <SelectItem value="uint8">uint8</SelectItem>
                      <SelectItem value="int256">int256</SelectItem>
                      <SelectItem value="bool">bool</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    value={mappingKey.value}
                    onChange={(e) => setMappingKey({ ...mappingKey, value: e.target.value })}
                    placeholder={mappingKey.type === 'address' ? '0x...' : '42'}
                    className="h-6 text-xs font-mono"
                  />
                </div>
              )}

              {probeMode === 'array' && (
                <Input
                  value={arrayIndex}
                  onChange={(e) => setArrayIndex(e.target.value)}
                  placeholder="Array index"
                  className="h-6 text-xs font-mono"
                />
              )}

              {probeMode === 'nested' && (
                <div className="space-y-1">
                  {nestedKeys.map((key, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[10px] h-5 shrink-0 w-5 justify-center p-0">{i + 1}</Badge>
                      <Select value={key.type} onValueChange={(v) => updateNestedKey(i, 'type', v)}>
                        <SelectTrigger className="h-6 text-[11px] w-20 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="address">address</SelectItem>
                          <SelectItem value="uint256">uint256</SelectItem>
                          <SelectItem value="bytes32">bytes32</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={key.value}
                        onChange={(e) => updateNestedKey(i, 'value', e.target.value)}
                        placeholder={key.type === 'address' ? '0x...' : '0'}
                        className="h-6 text-[11px] font-mono flex-1 min-w-0"
                      />
                      {nestedKeys.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-5 w-5 shrink-0" onClick={() => removeNestedKey(i)}>
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="h-5 text-[11px] gap-1 w-full" onClick={addNestedKey}>
                    <Plus className="h-2.5 w-2.5" />
                    Add Key
                  </Button>
                </div>
              )}

              {computedSlot.error && (
                <div className="text-[11px] text-destructive">{computedSlot.error}</div>
              )}
              {computedSlot.hex && (
                <div className="flex items-center gap-1 text-[11px]">
                  <code className="font-mono text-muted-foreground truncate flex-1 min-w-0">
                    {shortHex(computedSlot.hex, 8, 6)}
                  </code>
                  <CopyButton value={computedSlot.hex} ariaLabel="Copy slot" iconSize={10} />
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs gap-1 w-full"
                onClick={handleProbeSlot}
                disabled={manualSlotReading || !contractAddress.trim() || !computedSlot.hex}
              >
                {manualSlotReading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                Read Slot
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </ScrollArea>
    </div>
);
