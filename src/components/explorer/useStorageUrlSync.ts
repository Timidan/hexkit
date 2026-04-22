import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { isAddress } from 'ethers/lib/utils';
import type { Chain } from '../../types';
import { getExplorerChains, getChainById } from '../../utils/chains';

interface Args {
  selectedChain: Chain;
  setSelectedChain: (chain: Chain) => void;
  contractAddress: string;
  setContractAddress: (addr: string) => void;
  handleFetch: () => Promise<void> | void;
}

/**
 * Reads ?address=&chainId= from the URL, syncs state, then triggers a fetch
 * once the state has settled. Decoupled from the fetch itself so the main
 * hook keeps ownership of the AbortController plumbing.
 */
export function useStorageUrlSync({
  selectedChain,
  setSelectedChain,
  contractAddress,
  setContractAddress,
  handleFetch,
}: Args) {
  const location = useLocation();
  const pendingUrlFetchRef = useRef<{ address: string; chainId: number } | null>(
    null,
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedAddress = params.get('address')?.trim();
    if (!requestedAddress || !isAddress(requestedAddress)) return;

    const requestedChainIdRaw = params.get('chainId');
    const requestedChainId = requestedChainIdRaw
      ? Number.parseInt(requestedChainIdRaw, 10)
      : Number.NaN;
    const fallbackChain = getChainById(1) || getExplorerChains()[0];
    const nextChain = getChainById(requestedChainId) || fallbackChain;

    if (selectedChain.id !== nextChain.id) {
      setSelectedChain(nextChain);
    }
    if (
      contractAddress.trim().toLowerCase() !== requestedAddress.toLowerCase()
    ) {
      setContractAddress(requestedAddress);
    }

    pendingUrlFetchRef.current = {
      address: requestedAddress.toLowerCase(),
      chainId: nextChain.id,
    };
  }, [location.search]);

  useEffect(() => {
    const pending = pendingUrlFetchRef.current;
    if (!pending) return;

    const currentAddress = contractAddress.trim().toLowerCase();
    if (!currentAddress || currentAddress !== pending.address) return;
    if (selectedChain.id !== pending.chainId) return;

    pendingUrlFetchRef.current = null;
    void handleFetch();
  }, [contractAddress, selectedChain.id, handleFetch]);
}
