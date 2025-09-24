import { useEffect, useMemo, useRef, useState } from 'react';
import type { Chain } from '../types';
import type { ContractInfoResult } from '../types/contractInfo';
import {
  defaultContractLookupService,
  type ContractLookupOptions,
} from '../utils/services/ContractLookupService';

interface UseContractLookupOptions extends Partial<ContractLookupOptions> {
  auto?: boolean;
}

interface UseContractLookupState {
  loading: boolean;
  result: ContractInfoResult | null;
  error: string | null;
}

export const useContractLookup = (
  address: string | null | undefined,
  chain: Chain | null | undefined,
  options: UseContractLookupOptions = {}
) => {
  const { auto = true, progressCallback, signal, ...rest } = options;
  const [state, setState] = useState<UseContractLookupState>({
    loading: Boolean(auto && address && chain),
    result: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const mergedOptions = useMemo<ContractLookupOptions>(() => {
    const controller = signal ? undefined : new AbortController();
    abortRef.current = controller ?? null;
    return {
      progressCallback,
      signal: signal ?? controller?.signal,
      ...rest,
    };
  }, [progressCallback, rest, signal]);

  const runLookup = useMemo(
    () =>
      async () => {
        if (!address || !chain) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: !address || !chain ? 'Missing address or chain' : prev.error,
          }));
          return;
        }

        setState({ loading: true, result: null, error: null });

        try {
          const result = await defaultContractLookupService.fetchContractInfo(
            address,
            chain,
            mergedOptions
          );
          setState({ loading: false, result, error: null });
        } catch (error) {
          setState({
            loading: false,
            result: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    [address, chain, mergedOptions]
  );

  useEffect(() => {
    if (!auto) return undefined;
    runLookup();

    return () => {
      abortRef.current?.abort();
    };
  }, [auto, runLookup]);

  return {
    ...state,
    refetch: runLookup,
    cancel: () => abortRef.current?.abort(),
  };
};
