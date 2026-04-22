import type {
  TransactionRequest,
  SimulationResult,
} from "../../types/transaction";
import type { Chain } from "../../types";

import { trySimulatorBridge } from "./bridgeSimulation";
import {
  extractRevertDetails,
  parseReasonFromString,
  buildFailureRawTrace,
} from "./revertHandling";
import { classifySimulationError } from "../errorParser";

export interface SimulationExecutionOptions {
  enableDebug?: boolean;
  /**
   * When true, request a lite sim from EDB: no per-opcode snapshots, no
   * source instrumentation, no pre-flight Sourcify/Blockscout artifact
   * fetching. The response still carries event logs (Transfer-level
   * movements), which is all the asset-movement path consumes. Roughly 5x
   * faster on DepositFlow-style calls.
   */
  liteEventsOnly?: boolean;
}

export const simulateTransaction = async (
  transaction: TransactionRequest,
  chain: Chain,
  fromAddress: string,
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
      {
        enableDebug: options.enableDebug === true,
        liteEventsOnly: options.liteEventsOnly === true,
      },
    );
    if (options.enableDebug === true) {
      if (!bridgeResult) {
        const classified = classifySimulationError("debug_bootstrap_failed: bridge_unreachable");
        return {
          mode: "edb",
          success: false,
          error: classified.message,
          technicalError: classified.technicalDetails,
          warnings: [],
          revertReason: null,
          gasUsed: null,
          gasLimitSuggested: null,
          rawTrace: null,
        };
      }

      if (bridgeResult.success !== false && !bridgeResult.debugSession?.sessionId) {
        const classified = classifySimulationError("debug_bootstrap_failed: no_live_session_returned");
        return {
          ...bridgeResult,
          success: false,
          error: classified.message,
          technicalError:
            bridgeResult.technicalError ||
            bridgeResult.error ||
            classified.technicalDetails,
          debugSession: null,
          rawTrace: null,
        };
      }

      return bridgeResult;
    }

    if (bridgeResult) {
      return bridgeResult;
    }

    // Bridge was unreachable (null result) — return a clear failure instead
    // of falling through to estimateGas/mock which can't produce asset
    // movements or meaningful trace data.
    const classified = classifySimulationError("bridge_unreachable");
    return {
      mode: "edb",
      success: false,
      error: classified.message,
      technicalError: classified.technicalDetails,
      warnings: [],
      revertReason: null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: null,
    };
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

