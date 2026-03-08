import { ethers } from "ethers";
import type {
  TransactionRequest,
  SimulationResult,
  AssetChange,
} from "../../types/transaction";
import type { Chain } from "../../types";

import type { BridgeAnalysisOptions } from "./types";
import { normalizeBlockTag } from "./types";
import { trySimulatorBridge } from "./bridgeSimulation";
import {
  extractRevertDetails,
  parseReasonFromString,
  buildFailureRawTrace,
} from "./revertHandling";

// Re-export for barrel
export { replayTransactionWithSimulator } from "./bridgeSimulation";

export interface SimulationExecutionOptions {
  enableDebug?: boolean;
}

export const simulateTransaction = async (
  transaction: TransactionRequest,
  chain: Chain,
  fromAddress: string,
  provider?: ethers.providers.Provider,
  options: SimulationExecutionOptions = {},
): Promise<SimulationResult> => {
  try {
    if (!transaction.to || !transaction.data) {
      return {
        mode: "rpc",
        success: false,
        error: 'Transaction requires "to" address and "data"',
        warnings: [],
        revertReason: null,
        gasUsed: null,
        gasLimitSuggested: null,
        rawTrace: null,
      };
    }

    const bridgeResult = await trySimulatorBridge(
      transaction,
      chain,
      fromAddress,
      { enableDebug: options.enableDebug === true },
    );
    if (bridgeResult) {
      const isNetworkFailure =
        bridgeResult.success === false &&
        typeof bridgeResult.error === "string" &&
        bridgeResult.error.startsWith("Simulation request failed:");
      if (!isNetworkFailure) {
        return bridgeResult;
      }
    }

    if (provider) {
      const realisticSimulation = await performRealisticSimulation(
        transaction,
        fromAddress,
        provider,
      );
      return realisticSimulation;
    }

    const mockSimulation = await performMockSimulation(
      transaction,
      fromAddress,
    );
    return mockSimulation;
  } catch (error: any) {
    const revertDetails = extractRevertDetails(error);
    const fallbackMessage =
      revertDetails.message ||
      parseReasonFromString(error?.message) ||
      "Simulation failed";
    return {
      mode: "rpc",
      success: false,
      error: fallbackMessage,
      warnings: [],
      revertReason: revertDetails.message ?? fallbackMessage ?? null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
    };
  }
};

const performRealisticSimulation = async (
  transaction: TransactionRequest,
  fromAddress: string,
  provider: ethers.providers.Provider,
): Promise<SimulationResult> => {
  const userBlockTag = normalizeBlockTag(transaction.blockTag);
  const blockTag = userBlockTag
    ? /^\d+$/.test(userBlockTag)
      ? parseInt(userBlockTag, 10)
      : userBlockTag
    : undefined;

  try {
    let gasEstimate: ethers.BigNumber;

    try {
      gasEstimate = await provider.estimateGas({
        from: fromAddress,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || "0x0",
      });
    } catch (error: any) {
      const revertDetails = extractRevertDetails(error);
      const fallbackMessage =
        revertDetails.message ||
        parseReasonFromString(error?.message) ||
        "Gas estimation failed - transaction will likely revert";

      return {
        mode: "rpc",
        success: false,
        error: fallbackMessage,
        warnings: [],
        revertReason: revertDetails.message ?? fallbackMessage ?? null,
        gasUsed: "0",
        gasLimitSuggested: transaction.gasLimit ?? null,
        rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
      };
    }

    try {
      const callResult = await provider.call(
        {
          from: fromAddress,
          to: transaction.to,
          data: transaction.data,
          value: transaction.value || "0x0",
        },
        blockTag,
      );

      const gasLimit = gasEstimate.mul(120).div(100);

      return {
        mode: "rpc",
        success: true,
        error: null,
        warnings: [],
        revertReason: null,
        gasUsed: gasEstimate.toString(),
        gasLimitSuggested: gasLimit.toString(),
        rawTrace: {
          assetChanges: await estimateAssetChanges(transaction, fromAddress),
          returnData: callResult && callResult !== "0x" ? callResult : null,
        },
      };
    } catch (callError: any) {
      const revertDetails = extractRevertDetails(callError);
      const fallbackMessage =
        revertDetails.message ||
        parseReasonFromString(callError?.message) ||
        "Transaction call failed";
      return {
        mode: "rpc",
        success: false,
        error: fallbackMessage,
        warnings: [],
        revertReason: revertDetails.message ?? fallbackMessage ?? null,
        gasUsed: "0",
        gasLimitSuggested: transaction.gasLimit ?? null,
        rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
      };
    }
  } catch (error: any) {
    const revertDetails = extractRevertDetails(error);
    const fallbackMessage =
      revertDetails.message ||
      parseReasonFromString(error?.message) ||
      "Simulation failed";
    return {
      mode: "rpc",
      success: false,
      error: fallbackMessage,
      warnings: [],
      revertReason: revertDetails.message ?? fallbackMessage ?? null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
    };
  }
};

const estimateAssetChanges = async (
  transaction: TransactionRequest,
  fromAddress: string,
): Promise<AssetChange[]> => {
  const changes: AssetChange[] = [];

  if (
    transaction.value &&
    transaction.value !== "0" &&
    transaction.value !== "0x0"
  ) {
    const ethValue = parseFloat(ethers.utils.formatEther(transaction.value));
    changes.push({
      address: fromAddress,
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      amount: `-${ethValue}`,
      changeType: "SEND",
      rawAmount: `-${transaction.value}`,
    });
  }

  if (transaction.data?.startsWith("0xa9059cbb")) {
    changes.push({
      address: fromAddress,
      symbol: "TOKEN",
      name: "Token",
      decimals: 18,
      amount: "-",
      changeType: "SEND",
      rawAmount: "0",
    });
  }

  return changes;
};

const performMockSimulation = async (
  transaction: TransactionRequest,
  fromAddress: string,
): Promise<SimulationResult> => {
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const dataSize = (transaction.data?.length || 0) / 2;
  const baseGas = 21000;
  const dataGas = dataSize * 16;
  const estimatedGas = Math.floor(baseGas + dataGas);

  const mockChanges: AssetChange[] = [];

  if (transaction.data?.startsWith("0xa9059cbb")) {
    mockChanges.push({
      address: fromAddress,
      symbol: "TOKEN",
      name: "Mock Token",
      decimals: 18,
      amount: "-100.0",
      changeType: "SEND",
      rawAmount: "-100000000000000000000",
    });
  }

  if (transaction.value && transaction.value !== "0") {
    const ethValue = parseFloat(ethers.utils.formatEther(transaction.value));
    mockChanges.push({
      address: fromAddress,
      symbol: "ETH",
      name: "Ethereum",
      decimals: 18,
      amount: `-${ethValue}`,
      changeType: "SEND",
      rawAmount: `-${transaction.value}`,
    });
  }

  return {
    mode: "rpc",
    success: true,
    error: null,
    warnings: ["Mock simulation generated without provider access"],
    revertReason: null,
    gasUsed: estimatedGas.toString(),
    gasLimitSuggested: Math.floor(estimatedGas * 1.2).toString(),
    rawTrace: {
      assetChanges: mockChanges,
    },
  };
};
