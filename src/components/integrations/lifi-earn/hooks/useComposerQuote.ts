import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchComposerQuote } from "../earnApi";

interface UseComposerQuoteParams {
  fromChain: number;
  toChain: number;
  fromToken: string;
  toToken: string;
  fromAddress: string;
  toAddress: string;
  fromAmount: string;
  enabled?: boolean;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function useComposerQuote(params: UseComposerQuoteParams) {
  const { enabled = true, ...quoteParams } = params;

  // Debounce the amount to avoid firing a request on every keystroke
  const debouncedAmount = useDebouncedValue(quoteParams.fromAmount, 500);

  const stableParams = { ...quoteParams, fromAmount: debouncedAmount };

  return useQuery({
    queryKey: ["composer-quote", stableParams],
    queryFn: () => fetchComposerQuote(stableParams),
    enabled:
      enabled &&
      !!stableParams.fromAddress &&
      !!debouncedAmount &&
      debouncedAmount !== "0",
    staleTime: 30 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
