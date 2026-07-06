// Extracted from DepositFlow's simulation-path tx build. Takes a Composer
// quote (structurally — see ComposerQuoteResponse in ./types) and maps its
// transactionRequest into the shape simulateAssetMovements expects. Throws
// when to/data are missing since the REVM sim can't proceed without them.
export interface DepositTx {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
}

export function buildDepositTx(quote: {
  transactionRequest?: {
    to?: string;
    data?: string;
    value?: string;
    gasLimit?: string;
    gasPrice?: string;
  };
}): DepositTx {
  const tr = quote?.transactionRequest;
  if (!tr?.to || !tr?.data) {
    throw new Error("buildDepositTx: quote.transactionRequest missing to/data");
  }
  return {
    to: tr.to,
    data: tr.data,
    value: tr.value,
    gasLimit: tr.gasLimit,
    gasPrice: tr.gasPrice,
  };
}
