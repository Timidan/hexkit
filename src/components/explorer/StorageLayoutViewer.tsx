import React from 'react';
import {
  CheckCircle2,
  EyeOff,
} from 'lucide-react';
import { Badge } from '../ui/badge';
import ContractAddressInput from '../contract/ContractAddressInput';
import { SUPPORTED_CHAINS } from '../../utils/chains';
import StorageSlotGraph from './storage-viewer/StorageSlotGraph';
import { StorageSkeleton, StorageGridIcon } from './StorageSkeleton';
import { StorageToolbar } from './StorageToolbar';
import { StorageTableView } from './StorageTableView';
import { TreePanel } from './TreePanel';
import { useStorageViewerState } from './useStorageViewerState';

// ─── Main Component ──────────────────────────────────────────────

const StorageLayoutViewer: React.FC = () => {
  const state = useStorageViewerState();

  return (
    <>
      <div className="h-full flex flex-col bg-background">
        {/* ── Top Toolbar ── */}
        <div className="border-b border-border/50 px-4 py-3 space-y-2 flex-shrink-0">
          <div className="flex justify-center">
            <div className="flex items-end gap-3 w-full max-w-lg">
              <ContractAddressInput
                contractAddress={state.contractAddress}
                onAddressChange={state.setContractAddress}
                selectedNetwork={state.selectedChain}
                onNetworkChange={state.setSelectedChain}
                supportedChains={SUPPORTED_CHAINS}
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
                    <CheckCircle2 className="w-2.5 h-2.5" />
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
        </div>

        {/* ── Hidden Slots Info Banner ── */}
        {state.filter === 'resolved' && state.stats.unknown > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border/20 text-xs text-muted-foreground">
            <EyeOff className="h-3 w-3 shrink-0" />
            <span>
              {state.stats.unknown} slot{state.stats.unknown !== 1 ? 's' : ''} hidden — types could not be determined from verified sources
            </span>
            <button
              onClick={() => state.setUserFilter('unknown')}
              className="ml-1 text-primary hover:text-primary/80 underline underline-offset-2 transition-colors"
            >
              Show
            </button>
          </div>
        )}

        {/* ── Main Content: Skeleton / Table / Empty ── */}
        {state.showSkeleton ? (
          <StorageSkeleton phase={state.loadingPhase} slotCount={state.evidence.length} />
        ) : state.showTable ? (
          <div className="flex-1 min-h-0 w-full flex responsive-scroll">
              {/* Left Panel: Collapsible Storage Tree + Probe */}
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

              {/* Right Panel: Slot Table */}
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
                isHistoryView={state.isHistoryView}
                isMappingView={state.isMappingView}
                historyRows={state.historyRows}
                displayRows={state.displayRows}
                keyBySlot={state.keyBySlot}
                tableHeaderRef={state.tableHeaderRef}
                charLimits={state.charLimits}
                expandedSlot={state.expandedSlot}
                toggleSlotExpansion={state.toggleSlotExpansion}
                handleInspect={state.handleInspect}
                handleHistory={state.handleHistory}
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
