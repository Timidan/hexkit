import type { Config } from "@wagmi/core";
import {
  getWalletClient as getWagmiWalletClient,
  waitForTransactionReceipt as wagmiWaitForReceipt,
} from "@wagmi/core";
import type { Address, Hex } from "viem";

import { fetchComposerQuote, fetchCrossChainStatus } from "./earnApi";
import type { EarnToken, LifiStatusResponse } from "./types";
import { formatTxError, isNativeToken, safeApproveErc20 } from "./txUtils";

export type WithdrawComposerRoutePhase =
  | "idle"
  | "route-quoting"
  | "composer-quoted"
  | "composer-approving"
  | "composer-sending"
  | "composer-settling"
  | "done"
  | "failed";

export type WithdrawComposerRouteState =
  | { phase: "idle" }
  | { phase: "route-quoting" }
  | {
      phase: "composer-quoted";
      approvalSpender?: string;
    }
  | {
      phase: "composer-approving";
      approvalSpender: string;
    }
  | {
      phase: "composer-sending";
      approvalSpender?: string;
    }
  | {
      phase: "composer-settling";
      routeTxHash: string;
      lifiStatus?: string;
      lifiSubstatus?: string;
    }
  | {
      phase: "done";
      routeTxHash: string;
      destinationTxHash?: string;
    }
  | {
      phase: "failed";
      message: string;
      failedAfterBroadcast: boolean;
      routeTxHash?: string;
      lifiStatus?: string;
      lifiSubstatus?: string;
    };

export interface ExecuteWithdrawComposerRouteArgs {
  wagmiConfig: Config;
  sourceChainId: number;
  sourceToken: EarnToken;
  sourceAmountRaw: string;
  destinationChainId: number;
  destinationToken: EarnToken;
  userAddress: Address;
  onStateChange: (state: WithdrawComposerRouteState) => void;
  switchChain: (chainId: number) => Promise<void>;
}

const SETTLEMENT_TIMEOUT_MS = 30 * 60 * 1000;
const SETTLEMENT_POLL_INTERVAL_MS = 4_000;
const RECEIPT_TIMEOUT_MS = 180_000;

type SettlementOutcome = "COMPLETED" | "REFUNDED" | "PARTIAL" | "FAILED" | "INVALID";

function readSubstatus(status: LifiStatusResponse): string | undefined {
  return status.substatusMessage ?? status.substatus;
}

function classifyDoneStatus(status: LifiStatusResponse): SettlementOutcome {
  const sub = (status.substatus ?? "").toUpperCase();
  if (sub === "REFUNDED") return "REFUNDED";
  if (sub === "PARTIAL") return "PARTIAL";
  return "COMPLETED";
}

async function waitForComposerSettlement(args: {
  txHash: string;
  fromChain: number;
  toChain: number;
  onUpdate: (status: LifiStatusResponse) => void;
}): Promise<{ outcome: SettlementOutcome; status: LifiStatusResponse }> {
  const deadline = Date.now() + SETTLEMENT_TIMEOUT_MS;
  let consecutiveErrors = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() > deadline) {
      throw new Error("Route settlement timed out after 30 minutes");
    }

    try {
      const status = await fetchCrossChainStatus({
        txHash: args.txHash,
        fromChain: args.fromChain,
        toChain: args.toChain,
      });
      consecutiveErrors = 0;
      args.onUpdate(status);

      if (status.status === "DONE") {
        return { outcome: classifyDoneStatus(status), status };
      }
      if (status.status === "FAILED") {
        return { outcome: "FAILED", status };
      }
      if (status.status === "INVALID") {
        return { outcome: "INVALID", status };
      }
    } catch (err) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 5) throw err;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, SETTLEMENT_POLL_INTERVAL_MS),
    );
  }
}

export async function executeWithdrawComposerRoute(
  args: ExecuteWithdrawComposerRouteArgs,
): Promise<void> {
  const {
    wagmiConfig,
    sourceChainId,
    sourceToken,
    sourceAmountRaw,
    destinationChainId,
    destinationToken,
    userAddress,
    onStateChange,
    switchChain,
  } = args;

  let routeTxHash: string | null = null;
  let lastStatus: LifiStatusResponse | null = null;

  const fail = (err: unknown): never => {
    const message = formatTxError(err);
    onStateChange({
      phase: "failed",
      message,
      failedAfterBroadcast: routeTxHash !== null,
      routeTxHash: routeTxHash ?? undefined,
      lifiStatus: lastStatus?.status,
      lifiSubstatus: lastStatus ? readSubstatus(lastStatus) : undefined,
    });
    throw err instanceof Error ? err : new Error(message);
  };

  let quote;
  try {
    onStateChange({ phase: "route-quoting" });
    quote = await fetchComposerQuote({
      fromChain: sourceChainId,
      toChain: destinationChainId,
      fromToken: sourceToken.address,
      toToken: destinationToken.address,
      fromAddress: userAddress,
      toAddress: userAddress,
      fromAmount: sourceAmountRaw,
    });
  } catch (err) {
    fail(err);
    return;
  }

  onStateChange({
    phase: "composer-quoted",
    approvalSpender: quote.estimate.approvalAddress,
  });

  try {
    await switchChain(sourceChainId);
  } catch (err) {
    fail(err);
    return;
  }

  let walletClient;
  try {
    walletClient = await getWagmiWalletClient(wagmiConfig, {
      chainId: sourceChainId,
    });
    if (!walletClient) {
      throw new Error("No wallet client available on source chain");
    }
  } catch (err) {
    fail(err);
    return;
  }

  if (!isNativeToken(sourceToken.address)) {
    try {
      onStateChange({
        phase: "composer-approving",
        approvalSpender: quote.estimate.approvalAddress,
      });
      await safeApproveErc20({
        wagmiConfig,
        walletClient,
        token: sourceToken.address as Address,
        spender: quote.estimate.approvalAddress as Address,
        amount: BigInt(sourceAmountRaw),
        owner: userAddress,
        chainId: sourceChainId,
        timeoutMs: RECEIPT_TIMEOUT_MS,
      });
    } catch (err) {
      fail(err);
      return;
    }
  }

  onStateChange({
    phase: "composer-sending",
    approvalSpender: isNativeToken(sourceToken.address)
      ? undefined
      : quote.estimate.approvalAddress,
  });

  try {
    const hash = await walletClient.sendTransaction({
      to: quote.transactionRequest.to as Address,
      data: quote.transactionRequest.data as Hex,
      value: quote.transactionRequest.value
        ? BigInt(quote.transactionRequest.value)
        : undefined,
      gas: quote.transactionRequest.gasLimit
        ? BigInt(quote.transactionRequest.gasLimit)
        : undefined,
      chain: { id: sourceChainId } as any,
    });
    routeTxHash = hash;

    onStateChange({
      phase: "composer-settling",
      routeTxHash: hash,
    });

    const receipt = await wagmiWaitForReceipt(wagmiConfig, {
      hash,
      chainId: sourceChainId,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    if (receipt.status === "reverted") {
      throw new Error("Route transaction reverted onchain");
    }
  } catch (err) {
    fail(err);
    return;
  }

  const lockedRouteTxHash = routeTxHash;
  if (!lockedRouteTxHash) {
    fail(new Error("Route transaction hash missing after broadcast"));
    return;
  }

  if (sourceChainId === destinationChainId) {
    onStateChange({
      phase: "done",
      routeTxHash: lockedRouteTxHash,
      destinationTxHash: lockedRouteTxHash,
    });
    return;
  }

  let result: Awaited<ReturnType<typeof waitForComposerSettlement>>;
  try {
    result = await waitForComposerSettlement({
      txHash: lockedRouteTxHash,
      fromChain: sourceChainId,
      toChain: destinationChainId,
      onUpdate: (status) => {
        lastStatus = status;
        onStateChange({
          phase: "composer-settling",
          routeTxHash: lockedRouteTxHash,
          lifiStatus: status.status,
          lifiSubstatus: readSubstatus(status),
        });
      },
    });
  } catch (err) {
    fail(err);
    return;
  }

  lastStatus = result.status;
  if (result.outcome !== "COMPLETED") {
    fail(
      new Error(
        `LI.FI route ${result.outcome.toLowerCase()}${
          readSubstatus(result.status) ? `: ${readSubstatus(result.status)}` : ""
        }`,
      ),
    );
    return;
  }

  onStateChange({
    phase: "done",
    routeTxHash: lockedRouteTxHash,
    destinationTxHash: result.status.receiving?.txHash,
  });
}
