import { useCallback, useEffect, useRef } from 'react';
import type { useAutoDiscovery } from './storage-viewer/useAutoDiscovery';

type Discovery = ReturnType<typeof useAutoDiscovery>;

interface Args {
  discovery: Discovery;
  layout: Parameters<Discovery['startScan']>[0]['layout'] | null;
  contractAddress: string;
  chainId: number;
  mappingEntriesForDiscovery: Parameters<Discovery['startScan']>[0]['mappingEntries'];
  isLoading: boolean;
  lookbackBlocks: number;
}

/**
 * Auto-triggers the event scanner once a layout is ready, and exposes manual
 * start/rescan callbacks for the discovery toolbar.
 */
export function useStorageAutoDiscoveryScan({
  discovery,
  layout,
  contractAddress,
  chainId,
  mappingEntriesForDiscovery,
  isLoading,
  lookbackBlocks,
}: Args) {
  const { startScan: discoveryStartScan, stopScan: discoveryStopScan } = discovery;
  const autoScanTriggered = useRef(false);

  useEffect(() => {
    if (
      !autoScanTriggered.current &&
      layout &&
      contractAddress.trim() &&
      !isLoading
    ) {
      autoScanTriggered.current = true;
      discoveryStartScan({
        chainId,
        contractAddress: contractAddress.trim(),
        layout,
        mappingEntries: mappingEntriesForDiscovery,
        lookbackBlocks,
      });
    }
    return () => {
      discoveryStopScan();
      autoScanTriggered.current = false;
    };
  }, [
    layout,
    mappingEntriesForDiscovery,
    contractAddress,
    isLoading,
    chainId,
    lookbackBlocks,
    discoveryStartScan,
    discoveryStopScan,
  ]);

  const handleStartDiscovery = useCallback(() => {
    if (!layout || !contractAddress.trim()) return;
    discoveryStartScan({
      chainId,
      contractAddress: contractAddress.trim(),
      layout,
      mappingEntries: mappingEntriesForDiscovery,
      lookbackBlocks,
    });
  }, [
    layout,
    mappingEntriesForDiscovery,
    contractAddress,
    chainId,
    lookbackBlocks,
    discoveryStartScan,
  ]);

  const handleRescanDiscovery = useCallback(() => {
    if (!layout || !contractAddress.trim()) return;
    discovery.rescan({
      chainId,
      contractAddress: contractAddress.trim(),
      layout,
      mappingEntries: mappingEntriesForDiscovery,
      lookbackBlocks,
    });
  }, [
    layout,
    mappingEntriesForDiscovery,
    contractAddress,
    chainId,
    lookbackBlocks,
    discovery,
  ]);

  const resetAutoScanTrigger = useCallback(() => {
    autoScanTriggered.current = false;
  }, []);

  return { handleStartDiscovery, handleRescanDiscovery, resetAutoScanTrigger };
}
