// Wraps @wagmi/core's send + waitForReceipt so the EarnAdapter surfaces an
// SDK-neutral ExecutionResult. The provider injects Config via buildEvmEarnAdapter.
import type { Config } from "wagmi";
import {
  sendTransaction,
  waitForTransactionReceipt,
  switchChain as wagmiSwitchChain,
  getAccount,
} from "@wagmi/core";
import type { EvmChainDescriptor } from "../../../../chains/types";
import type {
  PreparedTx,
  ExecutionResult,
} from "../../adapter/types";
import type { Hex } from "../../../../chains/types/evm";
import { evmExplorerTxUrl } from "./evmExplorer";

export interface EvmSubmitDeps {
  config: Config;
  /** How long to wait for receipt confirmation before timing out. */
  receiptTimeoutMs?: number;
}

/**
 * Submit a prepared EVM transaction. Ensures the wallet is on the right
 * chain before sending; returns an ExecutionResult once the tx is broadcast
 * (status "submitted"). Callers should call `waitForEvmTxReceipt` next to
 * block on confirmation.
 */
export async function submitEvmTx(
  deps: EvmSubmitDeps,
  tx: PreparedTx<EvmChainDescriptor>,
): Promise<ExecutionResult<EvmChainDescriptor>> {
  if (tx.request.family !== "evm") {
    throw new Error(`submitEvmTx: expected EVM envelope, got ${tx.request.family}`);
  }

  const envelope = tx.request;
  const chainId = envelope.chainId as number;

  // If the wallet's current chain doesn't match the tx's chain, switch.
  // wagmi's switchChain is idempotent — no-op when already on the right chain.
  const acct = getAccount(deps.config);
  if (acct.chainId !== chainId) {
    await wagmiSwitchChain(deps.config, { chainId });
  }

  const hash = await sendTransaction(deps.config, {
    chainId,
    to: envelope.to,
    data: envelope.data,
    value: envelope.value,
    gas: envelope.gasLimit,
  });

  return {
    chain: tx.chain,
    txId: hash as unknown as Hex,
    status: "submitted",
    explorerUrl: evmExplorerTxUrl(tx.chain, hash as unknown as Hex),
  };
}

/**
 * Block on receipt. Updates the ExecutionResult's status to "confirmed" or
 * "failed" based on receipt.status, and attaches the raw receipt for
 * callers that want to inspect gasUsed / logs.
 */
export async function waitForEvmTxReceipt(
  deps: EvmSubmitDeps,
  result: ExecutionResult<EvmChainDescriptor>,
  options?: { timeoutMs?: number },
): Promise<ExecutionResult<EvmChainDescriptor>> {
  const chainId = result.chain.chainId as number;
  const receipt = await waitForTransactionReceipt(deps.config, {
    chainId,
    hash: result.txId as unknown as `0x${string}`,
    timeout: options?.timeoutMs ?? deps.receiptTimeoutMs ?? 120_000,
  });

  return {
    ...result,
    status: receipt.status === "success" ? "confirmed" : "failed",
    rawReceipt: receipt,
  };
}
