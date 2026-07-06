import React from 'react';
import {
  CheckCircle,
  EyeSlash,
  Sparkle,
  CircleNotch,
} from '@phosphor-icons/react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import ContractAddressInput from '../contract/ContractAddressInput';
import { getExplorerChains } from '../../utils/chains';
import StorageSlotGraph from './storage-viewer/StorageSlotGraph';
import { StorageSkeleton, StorageGridIcon } from './StorageSkeleton';
import { StorageToolbar } from './StorageToolbar';
import { StorageTableView } from './StorageTableView';
import { TreePanel } from './TreePanel';
import { useStorageViewerState } from './useStorageViewerState';
import { useBtlExplain } from '@/lib/btl/useBtlExplain';
import { safeParseJson } from '@/lib/btl/client';
import BtlExplanation from '@/components/btl/BtlExplanation';
import { SlotAnnotationChips, type SlotAnnotation } from '@/components/btl/SlotAnnotationChips';

const LLM_MODE =
  (import.meta.env.VITE_LLM_MODE as "live" | "fixture" | "off" | undefined) ??
  "live";

// Cap the annotated slot count so the request body stays well under the 64KB
// proxy limit even for contracts with hundreds of resolved slots.
const ANNOTATE_ROW_CAP = 30;

const StorageLayoutViewer: React.FC = () => {
  const state = useStorageViewerState();
  // Only chains with a configured explorer API — the storage loader needs
  // source/ABI data and would otherwise fall over with "No … API available".
  const explorerChains = React.useMemo(() => getExplorerChains(), []);

  const {
    explain: explainSlots,
    text: slotAnnotations,
    meta: slotAnnotationsMeta,
    loading: annotateLoading,
    error: annotateError,
  } = useBtlExplain({ jsonMode: true, maxTokens: 2000 });

  // BTL returns structured per-slot JSON; parse it into chips. On a parse
  // miss we fall back to showing the raw text so nothing is lost.
  const parsedAnnotations = React.useMemo((): { slots: SlotAnnotation[]; summary: string | null } | null => {
    if (!slotAnnotations) return null;
    const json = safeParseJson(slotAnnotations) as { slots?: unknown; summary?: unknown } | null;
    if (!json || !Array.isArray(json.slots)) return null;
    const slots = json.slots
      .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof (s as { note?: unknown }).note === 'string')
      .map((s) => ({
        slot: (s.slot as string) ?? null,
        label: (s.label as string) ?? null,
        note: s.note as string,
        unusual: !!s.unusual,
      }));
    return { slots, summary: typeof json.summary === 'string' ? json.summary : null };
  }, [slotAnnotations]);

  const handleAnnotateSlots = () => {
    const rows = state.displayRows.slice(0, ANNOTATE_ROW_CAP).map((row) => ({
      slot: row.slot,
      label: row.label ?? null,
      typeLabel: row.typeLabel ?? null,
      value: row.value ?? null,
      decodedFields: row.decodedFields ?? null,
    }));
    const payload = {
      contractName: state.contractMeta?.name ?? null,
      slots: rows,
    };
    const userText = JSON.stringify(payload).slice(0, 60_000);
    void explainSlots(
      'You are a storage-layout analyst. Given a contract\'s resolved storage slots, return ONLY a JSON object of this exact shape: ' +
        '{ "slots": [ { "slot": string (the slot key), "label": string (the variable name, or "" if none), "note": string (ONE concise plain-English sentence: what this slot holds), "unusual": boolean (true only if the slot is odd, mislabeled, suspect, or noteworthy) } ], "summary": string (one sentence overall) }. ' +
        "Include exactly one entry per input slot, in the same order. Return JSON only — no prose, no code fences.",
      userText,
    );
  };

  return (
    <>
      <div className="h-full flex flex-col bg-background">
        <div className="border-b border-border/50 px-4 py-3 space-y-2 flex-shrink-0">
          <div className="flex justify-center">
            <div className="flex items-end gap-3 w-full max-w-lg">
              <ContractAddressInput
                contractAddress={state.contractAddress}
                onAddressChange={state.setContractAddress}
                selectedNetwork={state.selectedChain}
                onNetworkChange={state.setSelectedChain}
                supportedChains={explorerChains}
                isLoading={state.isLoading || state.isFetchPending}
                error={state.error}
                onFetchABI={state.handleFetch}
                onCancel={state.handleCancel}
                fetchIcon={<StorageGridIcon size={16} state={state.iconState} />}
                fetchLabel="Load storage layout"
                className="flex-1"
              />
              {state.hasSession && (
                <div className="pb-1.5">
                  <Badge variant="outline" className="text-[10px] h-5 text-green-400 border-green-400/30 gap-1 whitespace-nowrap">
                    <CheckCircle className="w-2.5 h-2.5" />
                    EDB Enhanced
                  </Badge>
                </div>
              )}
            </div>
          </div>

          {state.hasData && (
            <StorageToolbar
              contractMeta={state.contractMeta}
              layoutConfidence={state.layoutConfidence}
              stats={state.stats}
              filter={state.filter}
              setUserFilter={state.setUserFilter}
              searchQuery={state.searchQuery}
              setSearchQuery={state.setSearchQuery}
              mappingEntries={state.mappingEntries}
              discovery={state.discovery}
              handleExportCsv={state.handleExportCsv}
              setSlotGraphOpen={state.setSlotGraphOpen}
            />
          )}

          {state.hasData && state.displayRows.length > 0 && LLM_MODE !== 'off' && (
            <div className="space-y-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs gap-1.5"
                onClick={handleAnnotateSlots}
                disabled={annotateLoading}
              >
                {annotateLoading ? (
                  <>
                    <CircleNotch className="h-3 w-3 animate-spin" />
                    Annotating...
                  </>
                ) : (
                  <>
                    <Sparkle className="h-3 w-3" />
                    Annotate slots with AI
                  </>
                )}
              </Button>

              {(slotAnnotations || annotateLoading || annotateError) && (
                <BtlExplanation
                  text={null}
                  meta={slotAnnotationsMeta}
                  loading={annotateLoading}
                  error={annotateError}
                  title="Slot annotations"
                >
                  {parsedAnnotations ? (
                    <SlotAnnotationChips
                      slots={parsedAnnotations.slots}
                      summary={parsedAnnotations.summary}
                    />
                  ) : slotAnnotations ? (
                    // Parse miss — show raw text so nothing is lost.
                    <p className="whitespace-pre-wrap text-xs text-foreground/80">
                      {slotAnnotations}
                    </p>
                  ) : null}
                </BtlExplanation>
              )}
            </div>
          )}
        </div>

        {state.filter === 'resolved' && state.stats.unknown > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border/20 text-xs text-muted-foreground">
            <EyeSlash className="h-3 w-3 shrink-0" />
            <span>
              {state.stats.unknown} slot{state.stats.unknown !== 1 ? 's' : ''} hidden — types could not be determined from available source data
            </span>
            <button
              onClick={() => state.setUserFilter('unknown')}
              className="ml-1 text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
            >
              Show
            </button>
          </div>
        )}

        {state.showSkeleton ? (
          <StorageSkeleton phase={state.loadingPhase} slotCount={state.evidence.length} />
        ) : state.showTable ? (
          <div className="flex-1 min-h-0 w-full flex responsive-scroll">
              {state.treeOpen && (
              <TreePanel
                treeGroups={state.treeGroups}
                treeExpandedGroups={state.treeExpandedGroups}
                toggleTreeGroup={state.toggleTreeGroup}
                expandedSlot={state.expandedSlot}
                handleInspect={state.handleInspect}
                toggleSlotExpansion={state.toggleSlotExpansion}
                discovery={state.discovery}
                setTreeOpen={state.setTreeOpen}
                probeMode={state.probeMode}
                setProbeMode={state.setProbeMode}
                baseSlotInput={state.baseSlotInput}
                setBaseSlotInput={state.setBaseSlotInput}
                mappingKey={state.mappingKey}
                setMappingKey={state.setMappingKey}
                arrayIndex={state.arrayIndex}
                setArrayIndex={state.setArrayIndex}
                nestedKeys={state.nestedKeys}
                addNestedKey={state.addNestedKey}
                removeNestedKey={state.removeNestedKey}
                updateNestedKey={state.updateNestedKey}
                computedSlot={state.computedSlot}
                handleProbeSlot={state.handleProbeSlot}
                manualSlotReading={state.manualSlotReading}
                contractAddress={state.contractAddress}
              />
              )}

              <StorageTableView
                treeOpen={state.treeOpen}
                setTreeOpen={state.setTreeOpen}
                isResolvingInBackground={state.isResolvingInBackground}
                loadingPhase={state.loadingPhase}
                postLoadResolving={state.postLoadResolving}
                isLayoutPending={state.isLayoutPending}
                isLoading={state.isLoading}
                pathSegments={state.pathSegments}
                navigateTo={state.navigateTo}
                keyInput={state.keyInput}
                setKeyInput={state.setKeyInput}
                handleKeyLookup={state.handleKeyLookup}
                isLookingUp={state.isLookingUp}
                resolvedSlots={state.resolvedSlots}
                isMappingView={state.isMappingView}
                displayRows={state.displayRows}
                keyBySlot={state.keyBySlot}
                tableHeaderRef={state.tableHeaderRef}
                charLimits={state.charLimits}
                expandedSlot={state.expandedSlot}
                toggleSlotExpansion={state.toggleSlotExpansion}
                handleInspect={state.handleInspect}
                discovery={state.discovery}
                mappingEntries={state.mappingEntries}
                handleStartDiscovery={state.handleStartDiscovery}
                handleRescanDiscovery={state.handleRescanDiscovery}
                searchQuery={state.searchQuery}
              />
          </div>
        ) : (state.isLoading || state.isFetchPending) ? (
          <StorageSkeleton phase={state.loadingPhase === 'idle' ? 'seeding' : state.loadingPhase} slotCount={0} />
        ) : null}
      </div>
      <StorageSlotGraph
        isOpen={state.slotGraphOpen}
        onClose={() => state.setSlotGraphOpen(false)}
        resolvedSlots={state.resolvedSlots}
      />
    </>
  );
};

export default StorageLayoutViewer;
