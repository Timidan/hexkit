/**
 * Bridge Simulation Entry Points
 *
 * This module is the main entry point for bridge simulation. It delegates to:
 * - requestBuilding.ts  -- payload construction helpers
 * - responseParsing.ts  -- response normalization and contract extraction
 *
 * Exports: postSimulatorJob, trySimulatorBridge, replayTransactionWithSimulator
 */

import axios from "axios";
import { ethers } from "ethers";
import type {
  TransactionRequest,
  SimulationResult,
} from "../../types/transaction";
import type { Chain } from "../../types";
import { getSimulatorBridgeUrl, getBridgeHeaders } from "../env";
import { cacheRawTraceText } from "../traceRawTextCache";
import { networkAccess } from "../../config/networkAccess";
import { classifySimulationError } from "../errorParser";
import { lookupFunctionSignatures } from "../signatureDatabase";

import {
  type BridgeSimulationResponsePayload,
  type BridgeAnalysisOptions,
  type SourcifyArtifact,
  normalizeBlockTag,
} from "./types";
import { contractEvidence } from "../resolver/contractEvidence";

import {
  buildBridgeTransactionPayload,
  mergeAnalysisOptions,
  inferArtifactSourcePriority,
} from "./requestBuilding";

import { normalizeBridgeResult } from "./responseParsing";

const SIMULATOR_BRIDGE_URL = getSimulatorBridgeUrl();
const SIMULATOR_BRIDGE_ENDPOINT = SIMULATOR_BRIDGE_URL
  ? SIMULATOR_BRIDGE_URL.replace(/\/+$/, "")
  : "";
const selectorFunctionNameCache = new Map<string, string | null>();

async function lookupReplayFunctionName(selector: string | null | undefined): Promise<string | null> {
  const normalizedSelector = typeof selector === "string" ? selector.trim().toLowerCase() : "";
  if (!/^0x[a-f0-9]{8}$/.test(normalizedSelector)) {
    return null;
  }

  if (selectorFunctionNameCache.has(normalizedSelector)) {
    return selectorFunctionNameCache.get(normalizedSelector) ?? null;
  }

  try {
    const response = await lookupFunctionSignatures([normalizedSelector]);
    const match = response?.result?.function?.[normalizedSelector]?.find(
      (entry) => typeof entry?.name === "string" && entry.name.trim().length > 0
    );
    const functionName = match?.name?.split("(")[0]?.trim() || null;
    selectorFunctionNameCache.set(normalizedSelector, functionName);
    return functionName;
  } catch {
    selectorFunctionNameCache.set(normalizedSelector, null);
    return null;
  }
}

export const postSimulatorJob = async (
  payload: Record<string, unknown>,
  transactionMetadata?: {
    from?: string;
    to?: string;
    data?: string;
    value?: string;
    blockNumber?: number | null;
    nonce?: number | null;
    functionName?: string | null;
    timestamp?: number | null;
    gasPrice?: string | null;
    maxFeePerGas?: string | null;
    maxPriorityFeePerGas?: string | null;
    baseFeePerGas?: string | null;
    effectiveGasPrice?: string | null;
    type?: number | null;
  },
): Promise<SimulationResult | null> => {
  if (!SIMULATOR_BRIDGE_ENDPOINT) {
    return null;
  }

  const url = `${SIMULATOR_BRIDGE_ENDPOINT}/simulate`;

  // Legacy full-sim callers rely on this wrapper to force-enable every
  // collector (call tree, events, storage diff, snapshots). Lite callers
  // opt out via `liteEventsOnly: true` on the payload so their explicit
  // `false` values actually reach the Rust side instead of being coerced
  // back to `true` here. The Rust simulator reads the top-level
  // `liteEventsOnly` field directly and short-circuits Steps 2/3, so the
  // key stays on the payload instead of being stripped.
  const isLite = payload.liteEventsOnly === true;
  if (payload.analysisOptions && typeof payload.analysisOptions === "object") {
    const ao = { ...(payload.analysisOptions as Record<string, unknown>) };
    if (!isLite) {
      const collectStorage =
        (ao.collectStorageDiffs as boolean | undefined) ??
        (ao.collectStorageDiff as boolean | undefined) ??
        true;
      ao.collectStorageDiffs = collectStorage;
      ao.collectStorageDiff = collectStorage;
      if (ao.collectSnapshots === undefined) {
        ao.collectSnapshots = true;
      }
      if (ao.collectEvents === undefined) {
        ao.collectEvents = true;
      }
      if (ao.collectCallTree === undefined) {
        ao.collectCallTree = true;
      }
    }
    payload.analysisOptions = ao;
  }

  try {
    let rawResponseText = "";

    const response = await axios.post(url, payload, {
      headers: getBridgeHeaders(),
      transformResponse: [
        (data: string) => {
          // Guard against excessively large responses (>50MB)
          if (typeof data === "string" && data.length > 50 * 1024 * 1024) {
            throw new Error(
              "Bridge response exceeds maximum size limit (50MB)",
            );
          }
          rawResponseText = data;
          try {
            return JSON.parse(data);
          } catch {
            return data;
          }
        },
      ],
    });

    if (!response?.data || typeof response.data !== "object") {
      return null;
    }

    if (response.data.rawTrace && typeof response.data.rawTrace === "object") {
      // Always cache raw response text — the legacy 3-phase FE decode
      // needs it for source extraction, PC map building, etc.
      // (V2 enrichment is disabled until Stage 2 Rust EDB.)
      cacheRawTraceText(response.data.rawTrace, rawResponseText);
    }

    return await normalizeBridgeResult(
      response.data as BridgeSimulationResponsePayload,
      transactionMetadata,
    );
  } catch (error: any) {
    if (error?.response?.data && typeof error.response.data === "object") {
      const errorData = error.response.data;
      const rawError = errorData.error || "Simulation failed";
      const classified = classifySimulationError(rawError);
      return {
        mode: "edb" as const,
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

    const message =
      error instanceof Error ? error.message : "Unknown network error";
    console.error("[postSimulatorJob] network error:", message);
    const classified = classifySimulationError(message);
    return {
      mode: "edb" as const,
      success: false,
      error: classified.message,
      technicalError: `Simulation request failed: ${message}`,
      warnings: [],
      revertReason: null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: null,
    };
  }
};

export const trySimulatorBridge = async (
  transaction: TransactionRequest,
  chain: Chain,
  fromAddress: string,
  options?: {
    enableDebug?: boolean;
    /**
     * Lite mode for callers that only need event logs (e.g. Transfer-based
     * asset movement extraction). Skips Sourcify/Blockscout/proxy/facet
     * artifact pre-fetching entirely and ships a minimal analysisOptions
     * payload that disables per-opcode snapshot collection on the Rust side.
     * Roughly 5x faster than a full sim for the DepositFlow use case.
     */
    liteEventsOnly?: boolean;
  },
): Promise<SimulationResult | null> => {
  const liteEventsOnly = options?.liteEventsOnly === true;
  const resolution = networkAccess.resolve(chain);
  const rpcUrl = resolution.url;

  if (!rpcUrl) {
    return null;
  }

  let blockNumber: number | null = null;
  let nonce: number | null = null;
  let timestamp: number | null = null;
  let gasPrice: string | null = null;
  let baseFeePerGas: string | null = null;
  let maxFeePerGas: string | null = null;
  let maxPriorityFeePerGas: string | null = null;
  let txType: number | null = null;

  const userBlockTag = normalizeBlockTag(transaction.blockTag);
  const targetBlockTag = userBlockTag
    ? /^\d+$/.test(userBlockTag)
      ? parseInt(userBlockTag, 10)
      : userBlockTag
    : "latest";

  // Lite mode skips pre-flight RPC metadata (block, nonce, fees) — the EDB
  // engine derives what it needs from the RPC URL directly. This avoids
  // 4 sequential round-trips to potentially slow public RPCs, saving 5-30s.
  if (!liteEventsOnly) {
    try {
      const provider = networkAccess.access(chain).provider;

      const currentBlock =
        typeof targetBlockTag === "number"
          ? targetBlockTag
          : await provider.getBlockNumber();
      blockNumber = currentBlock;

      const block = await provider.getBlock(currentBlock);
      timestamp = block?.timestamp || null;
      baseFeePerGas = block?.baseFeePerGas?.toString() || null;

      const fromAddr =
        fromAddress || "0x0000000000000000000000000000000000000000";
      const accountNonce = await provider.getTransactionCount(
        fromAddr,
        currentBlock,
      );
      nonce = accountNonce;

      if (baseFeePerGas) {
        txType = 2;

        try {
          const feeData = await provider.getFeeData();
          maxFeePerGas = feeData.maxFeePerGas?.toString() || null;
          maxPriorityFeePerGas =
            feeData.maxPriorityFeePerGas?.toString() || null;

          if (baseFeePerGas && maxPriorityFeePerGas) {
            const baseFee = ethers.BigNumber.from(baseFeePerGas);
            const priorityFee = ethers.BigNumber.from(maxPriorityFeePerGas);
            const effectivePrice = baseFee.add(priorityFee);
            gasPrice = effectivePrice.toString();
          }
        } catch (err) {
          console.warn(
            "[simulation] EIP-1559 fee data fetch failed:",
            (err as Error)?.message,
          );
        }
      } else {
        txType = 0;
        try {
          const legacyGasPrice = await provider.getGasPrice();
          gasPrice = legacyGasPrice?.toString() || null;
        } catch (err) {
          console.warn(
            "[simulation] Legacy gas price fetch failed:",
            (err as Error)?.message,
          );
        }
      }
    } catch (err) {
      console.warn(
        "[simulation] RPC metadata fetch failed:",
        (err as Error)?.message,
      );
    }
  }

  // Lite mode skips every upstream artifact fetch — Sourcify/Blockscout,
  // diamond facets, proxy implementations. The engine will still emit event
  // logs from the base RPC trace, which is the only data the asset-movement
  // path consumes, so artifact and proxy preflight are unnecessary.
  let sourcifyArtifacts: SourcifyArtifact[] | null = null;
  let sourcifyMetadata: Record<string, unknown> | null = null;
  if (!liteEventsOnly && transaction.to) {
    try {
      const evidence = await contractEvidence.simulate({
        chain,
        root: transaction.to,
        related: [
          ...(transaction.diamondFacetAddresses ?? []),
          ...(transaction.proxyImplementationAddresses ?? []),
        ],
        completeness: "fast",
      });
      sourcifyArtifacts = evidence.simulationArtifacts.length
        ? evidence.simulationArtifacts
        : null;
      sourcifyMetadata = evidence.metadata;
    } catch (err) {
      console.warn(
        "[simulation] Contract evidence resolution failed:",
        (err as Error)?.message,
      );
    }
  }

  // In lite mode we send a bare analysisOptions object that disables every
  // collector except events and flips quickMode on. postSimulatorJob checks
  // for the liteEventsOnly hint on the payload and skips the legacy
  // force-enable branch so these values actually reach the Rust side.
  const analysisOptions = liteEventsOnly
    ? {
        quickMode: true,
        collectSnapshots: false,
        collectCallTree: false,
        collectStorageDiff: false,
        collectStorageDiffs: false,
        collectEvents: true,
        artifactSourcePriority: inferArtifactSourcePriority(sourcifyArtifacts),
      }
    : mergeAnalysisOptions({
        // Debug sessions need snapshot collection for evaluator/navigation support.
        ...(options?.enableDebug === true ? { collectSnapshots: true } : {}),
        artifactSourcePriority: inferArtifactSourcePriority(sourcifyArtifacts),
      });

  const requestPayload: Record<string, unknown> = {
    mode: "local" as const,
    rpcUrl,
    chainId: chain.id,
    transaction: buildBridgeTransactionPayload(transaction, fromAddress),
    analysisOptions,
    enableDebug: options?.enableDebug === true,
    ...(liteEventsOnly ? { liteEventsOnly: true } : {}),
  };

  if (transaction.blockTag !== undefined) {
    const normalizedBlockTagVal = normalizeBlockTag(transaction.blockTag);
    if (normalizedBlockTagVal) {
      requestPayload.blockTag = normalizedBlockTagVal;
    }
  }

  if (transaction.storageOverrides && transaction.storageOverrides.length > 0) {
    requestPayload.storageOverrides = transaction.storageOverrides.map(
      (override) => ({
        address: override.address,
        slot: override.slot,
        value: override.value,
      }),
    );
  }

  if (sourcifyArtifacts) {
    requestPayload.artifacts = sourcifyArtifacts;

    const artifactsInline: Record<string, Record<string, unknown>> = {};
    for (const artifact of sourcifyArtifacts) {
      if (artifact.address) {
        const addr = artifact.address.toLowerCase();
        const sourcesObj: Record<string, { content: string }> = {};
        for (const src of artifact.sources) {
          sourcesObj[src.path] = { content: src.content };
        }

        const hasSettings = artifact.settings && !artifact.missingSettings;
        const normalizedLibraries: Record<string, Record<string, string>> = {};
        if (
          artifact.settings?.libraries &&
          typeof artifact.settings.libraries === "object"
        ) {
          const entries = Object.entries(
            artifact.settings.libraries as Record<string, unknown>,
          );
          const flatLibraries: Record<string, string> = {};
          let hasNested = false;

          for (const [key, value] of entries) {
            if (value && typeof value === "object" && !Array.isArray(value)) {
              hasNested = true;
              normalizedLibraries[key] = value as Record<string, string>;
            } else if (typeof value === "string") {
              flatLibraries[key] = value;
            }
          }

          if (!hasNested && Object.keys(flatLibraries).length > 0) {
            const targetFiles = Object.keys(
              artifact.settings?.compilationTarget || {},
            );
            const libraryFiles =
              targetFiles.length > 0 ? targetFiles : Object.keys(sourcesObj);
            for (const file of libraryFiles) {
              normalizedLibraries[file] = { ...flatLibraries };
            }
          }
        }

        const inputSettings = hasSettings
          ? {
              optimizer: artifact.settings?.optimizer || {
                enabled: false,
                runs: 200,
              },
              evmVersion: artifact.settings?.evmVersion || "paris",
              compilationTarget: artifact.settings?.compilationTarget || {},
              libraries: normalizedLibraries,
              outputSelection: {
                "*": {
                  "*": [
                    "abi",
                    "evm.bytecode",
                    "evm.deployedBytecode",
                    "evm.methodIdentifiers",
                    "metadata",
                    "storageLayout",
                  ],
                  "": ["ast"],
                },
              },
            }
          : null;

        artifactsInline[addr] = {
          input: {
            language: "Solidity",
            sources: sourcesObj,
            settings: inputSettings,
          },
          output: {},
          meta: {
            Name: artifact.contractName,
            ContractName: artifact.contractName,
            CompilerVersion: artifact.compilerVersion || "unknown",
            ABI: artifact.abi || "",
            OptimizationUsed: artifact.settings?.optimizer?.enabled ? "1" : "0",
            Runs: String(artifact.settings?.optimizer?.runs || 200),
            EVMVersion: artifact.settings?.evmVersion || "Default",
          },
          missingSettings: artifact.missingSettings || !hasSettings,
          sources: sourcesObj,
        };
      }
    }

    if (Object.keys(artifactsInline).length > 0) {
      requestPayload.artifacts_inline = artifactsInline;
    }
  }
  if (sourcifyMetadata) {
    requestPayload.metadata = sourcifyMetadata;
  }

  const transactionMetadata = {
    from: fromAddress || "0x0000000000000000000000000000000000000000",
    to: transaction.to,
    data: transaction.data,
    value: transaction.value ? String(transaction.value) : "0",
    blockNumber,
    nonce,
    functionName: transaction.functionName || null,
    timestamp,
    gasPrice,
    maxFeePerGas,
    maxPriorityFeePerGas,
    baseFeePerGas,
    effectiveGasPrice: gasPrice,
    type: txType,
  };

  return postSimulatorJob(requestPayload, transactionMetadata);
};

export const replayTransactionWithSimulator = async (
  chain: Chain,
  txHash: string,
  options?: {
    blockTag?: string | number;
    analysisOptions?: BridgeAnalysisOptions;
    enableDebug?: boolean;
  },
): Promise<SimulationResult | null> => {
  const hash = txHash?.trim();
  if (!hash) {
    return null;
  }

  if (!hash.startsWith("0x")) {
    return null;
  }

  if (!chain?.rpcUrl) {
    return null;
  }

  const resolution = networkAccess.resolve(chain);
  const rpcUrl = resolution.url;

  let transactionMetadata:
    | {
        from?: string;
        to?: string;
        data?: string;
        value?: string;
        blockNumber?: number | null;
        nonce?: number | null;
        functionName?: string | null;
        timestamp?: number | null;
        gasPrice?: string | null;
        maxFeePerGas?: string | null;
        maxPriorityFeePerGas?: string | null;
        baseFeePerGas?: string | null;
        effectiveGasPrice?: string | null;
        type?: number | null;
      }
    | undefined;

  try {
    const provider = networkAccess.access(chain).provider;
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(hash),
      provider.getTransactionReceipt(hash),
    ]);

    if (tx) {
      let timestamp: number | null = null;
      let baseFeePerGas: string | null = null;
      if (tx.blockNumber) {
        try {
          const block = await provider.getBlock(tx.blockNumber);
          if (block) {
            timestamp = block.timestamp;
            baseFeePerGas = block.baseFeePerGas?.toString() ?? null;
          }
        } catch {
          // Could not fetch block for timestamp
        }
      }

      transactionMetadata = {
        from: tx.from,
        to: tx.to ?? undefined,
        data: tx.data,
        value: tx.value?.toString(),
        blockNumber: tx.blockNumber ?? null,
        nonce: tx.nonce ?? null,
        timestamp,
        gasPrice: tx.gasPrice?.toString() ?? null,
        maxFeePerGas: tx.maxFeePerGas?.toString() ?? null,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas?.toString() ?? null,
        baseFeePerGas,
        effectiveGasPrice:
          receipt?.effectiveGasPrice?.toString() ??
          tx.gasPrice?.toString() ??
          null,
        type: tx.type ?? null,
      };

      if (!transactionMetadata.functionName && typeof tx.data === "string" && tx.data.length >= 10) {
        transactionMetadata.functionName = await lookupReplayFunctionName(tx.data.slice(0, 10));
      }
    }
  } catch {
    // Could not fetch transaction metadata, continuing without
  }

  const payload: Record<string, unknown> = {
    mode: "onchain",
    rpcUrl,
    chainId: chain.id,
    txHash: hash,
    analysisOptions: mergeAnalysisOptions({
      ...(options?.analysisOptions ?? {}),
      // Ensure snapshot collection when replay debug is explicitly enabled.
      ...(options?.enableDebug === true ? { collectSnapshots: true } : {}),
    }),
    // Tx-hash replay should return initial results quickly. Live debug sessions
    // are prepared separately through /debug/prepare from the results page.
    enableDebug: false,
  };

  const normalizedBlockTagVal = normalizeBlockTag(options?.blockTag);
  if (normalizedBlockTagVal) {
    payload.blockTag = normalizedBlockTagVal;
  }

  return postSimulatorJob(payload, transactionMetadata);
};
