import type { ComposerQuoteResponse } from './types';

export interface DepositTransaction {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
}

/** Validate and normalize the Composer transaction before simulation/broadcast. */
export function buildDepositTx(
  quote: Pick<ComposerQuoteResponse, 'transactionRequest'>
): DepositTransaction {
  const request = quote.transactionRequest;
  if (!request?.to || !request?.data) {
    throw new Error('LI.FI quote is missing transaction to/data');
  }
  return {
    to: request.to,
    data: request.data,
    value: request.value,
    gasLimit: request.gasLimit,
    gasPrice: request.gasPrice,
  };
}
