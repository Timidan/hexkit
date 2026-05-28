import { useComposerQuote } from "./useComposerQuote";

interface UseWithdrawQuoteParams {
  chainId: number;
  /** Vault share token address (the token being redeemed). */
  vaultAddress: string;
  /** Underlying token address (what the user receives). */
  underlyingAddress: string;
  /** Connected wallet address. */
  walletAddress: string;
  /** Amount in the share token's smallest unit. */
  fromAmount: string;
  enabled?: boolean;
}

export function useWithdrawQuote(params: UseWithdrawQuoteParams) {
  // Redeem quote only: vault share token -> underlying on the vault chain.
  // Cross-chain withdraw routing starts after this tx confirms and the UI has
  // measured the actual underlying balance delta.
  return useComposerQuote({
    fromChain: params.chainId,
    toChain: params.chainId,
    fromToken: params.vaultAddress,
    toToken: params.underlyingAddress,
    fromAddress: params.walletAddress,
    toAddress: params.walletAddress,
    fromAmount: params.fromAmount,
    enabled: params.enabled,
  });
}
