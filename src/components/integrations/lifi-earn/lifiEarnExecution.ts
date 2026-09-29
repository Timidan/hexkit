import { ethers } from 'ethers';
import type { Chain } from '../../../types';
import type { AssetMovementResult } from '../../../utils/transaction-simulation/simulateAssetMovements';
import { buildDepositTx, type DepositTransaction } from './buildDepositTx';
import type { ComposerQuoteResponse } from './types';

interface EarnWalletClient {
  sendTransaction(request: {
    to: `0x${string}`;
    data: `0x${string}`;
    value?: bigint;
    gas?: bigint;
    chain: { id: number };
  }): Promise<string>;
}

interface LifiEarnExecutionDependencies {
  switchChain(chainId: number): Promise<void>;
  getWalletClient(chainId: number): Promise<EarnWalletClient | null>;
  waitForReceipt(input: {
    txHash: string;
    chainId: number;
  }): Promise<{ status: string }>;
  simulate(
    transaction: DepositTransaction,
    chain: Chain,
    owner: string
  ): Promise<AssetMovementResult>;
}

interface QuoteExecutionInput {
  executionId: string;
  operationLabel?: string;
  chain: Chain;
  refreshQuote(): Promise<ComposerQuoteResponse | null>;
  onBroadcast?: (txHash: string) => void;
}

export interface LifiEarnExecutionModule {
  simulateQuote(input: Omit<QuoteExecutionInput, 'executionId' | 'onBroadcast' | 'operationLabel'> & {
    owner: string;
  }): Promise<{ result: AssetMovementResult; quote: ComposerQuoteResponse }>;
  executeQuote(input: QuoteExecutionInput): Promise<{
    txHash: string;
    quote: ComposerQuoteResponse;
  }>;
  ensureApproval(input: {
    chain: Chain;
    tokenAddress: string;
    spender: string;
    currentAllowance: bigint;
  }): Promise<string[]>;
}

function ensureSuccessfulReceipt(receipt: { status: string }, label: string) {
  if (receipt.status === 'reverted') {
    throw new Error(`${label} transaction reverted onchain`);
  }
}

export function createLifiEarnExecution(
  dependencies: LifiEarnExecutionDependencies
): LifiEarnExecutionModule {
  const activeExecutions = new Set<string>();

  const requireFreshQuote = async (
    refreshQuote: () => Promise<ComposerQuoteResponse | null>
  ): Promise<ComposerQuoteResponse> => {
    const refreshed = await refreshQuote();
    if (!refreshed) {
      throw new Error('A fresh LI.FI quote is required before execution');
    }
    return refreshed;
  };

  const walletFor = async (chainId: number): Promise<EarnWalletClient> => {
    await dependencies.switchChain(chainId);
    const wallet = await dependencies.getWalletClient(chainId);
    if (!wallet) {
      throw new Error('No wallet client available. Please connect your wallet.');
    }
    return wallet;
  };

  const sendQuote = async (
    wallet: EarnWalletClient,
    chainId: number,
    quote: ComposerQuoteResponse
  ): Promise<string> => {
    const transaction = buildDepositTx(quote);
    return wallet.sendTransaction({
      to: transaction.to as `0x${string}`,
      data: transaction.data as `0x${string}`,
      value: transaction.value ? BigInt(transaction.value) : undefined,
      gas: transaction.gasLimit ? BigInt(transaction.gasLimit) : undefined,
      chain: { id: chainId },
    });
  };

  return {
    async simulateQuote(input) {
      const quote = await requireFreshQuote(input.refreshQuote);
      const result = await dependencies.simulate(
        buildDepositTx(quote),
        input.chain,
        input.owner
      );
      return { result, quote };
    },

    async executeQuote(input) {
      if (activeExecutions.has(input.executionId)) {
        throw new Error(`Earn execution ${input.executionId} is already active`);
      }
      activeExecutions.add(input.executionId);

      try {
        const quote = await requireFreshQuote(input.refreshQuote);
        const wallet = await walletFor(input.chain.id);
        const txHash = await sendQuote(wallet, input.chain.id, quote);
        try {
          input.onBroadcast?.(txHash);
        } catch {
          // Observers must not interrupt confirmation of an already-broadcast tx.
        }
        const receipt = await dependencies.waitForReceipt({
          txHash,
          chainId: input.chain.id,
        });
        ensureSuccessfulReceipt(receipt, input.operationLabel ?? 'Deposit');
        return { txHash, quote };
      } finally {
        activeExecutions.delete(input.executionId);
      }
    },

    async ensureApproval(input) {
      const wallet = await walletFor(input.chain.id);
      const iface = new ethers.utils.Interface([
        'function approve(address spender, uint256 amount) returns (bool)',
      ]);
      const hashes: string[] = [];

      const approve = async (amount: ethers.BigNumberish, label: string) => {
        const data = iface.encodeFunctionData('approve', [
          input.spender,
          amount,
        ]) as `0x${string}`;
        const txHash = await wallet.sendTransaction({
          to: input.tokenAddress as `0x${string}`,
          data,
          chain: { id: input.chain.id },
        });
        hashes.push(txHash);
        const receipt = await dependencies.waitForReceipt({
          txHash,
          chainId: input.chain.id,
        });
        ensureSuccessfulReceipt(receipt, label);
      };

      if (input.currentAllowance > 0n) {
        await approve(ethers.constants.Zero, 'Allowance reset');
      }
      await approve(ethers.constants.MaxUint256, 'Approval');
      return hashes;
    },
  };
}
