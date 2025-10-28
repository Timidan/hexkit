import { ethers } from "ethers";
import type { Chain, ExplorerSource } from "../../types";
import type { ContractInfoResult } from "../../types/contractInfo";
import {
  withRetry,
  fetchFromBlockscoutBytecodeDB,
  fetchFromSourcify,
  fetchFromBlockscout,
  fetchFromEtherscan,
  extractExternalFunctions,
  fetchTokenInfo,
} from "../fetchers";
import { contractLookupCache } from "../cache/contractLookupCache";
import {
  consoleTelemetry,
  TelemetryEmitter,
} from "../telemetry/TelemetryEmitter";

export interface ContractLookupOptions {
  progressCallback?: (progress: {
    source: string;
    status: "searching" | "found" | "not_found" | "error";
    message?: string;
  }) => void;
  useCache?: boolean;
  cacheMaxAgeMs?: number;
  signal?: AbortSignal;
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
  preferredSources?: ExplorerSource[];
}

const DEFAULT_CACHE_MAX_AGE = 5 * 60 * 1000;

const TELEMETRY_EVENTS = {
  START: "contract.lookup.start",
  STEP: "contract.lookup.step",
  SUCCESS: "contract.lookup.success",
  FAILURE: "contract.lookup.failure",
  CACHE_HIT: "contract.lookup.cache_hit",
} as const;

type LookupProgress = NonNullable<ContractInfoResult["searchProgress"]>;

export class ContractLookupService {
  private readonly telemetry: TelemetryEmitter;

  constructor(telemetry: TelemetryEmitter = consoleTelemetry) {
    this.telemetry = telemetry;
  }

  async fetchContractInfo(
    address: string,
    chain: Chain,
    options: ContractLookupOptions = {}
  ): Promise<ContractInfoResult> {
    const {
      progressCallback,
      useCache = true,
      cacheMaxAgeMs = DEFAULT_CACHE_MAX_AGE,
      signal,
      etherscanApiKey,
      blockscoutApiKey,
      preferredSources,
    } = options;

    const searchProgress: LookupProgress = [];

    const addProgress = (
      source: string,
      status: "searching" | "found" | "not_found" | "error",
      message?: string
    ) => {
      const progress = { source, status, message };
      searchProgress.push(progress);
      progressCallback?.(progress);
      this.telemetry.emit(TELEMETRY_EVENTS.STEP, {
        address,
        chainId: chain.id,
        source,
        status,
        message,
      });
    };

    const baseResult: ContractInfoResult = {
      success: false,
      address,
      chain,
      searchProgress: [],
    };

    if (!address || !address.startsWith("0x") || address.length !== 42) {
      return {
        ...baseResult,
        error: "Invalid contract address format",
      };
    }

    if (useCache) {
      const cached = contractLookupCache.get(address, chain.id, {
        maxAgeMs: cacheMaxAgeMs,
      });
      if (cached) {
        this.telemetry.emit(TELEMETRY_EVENTS.CACHE_HIT, {
          address,
          chainId: chain.id,
          success: cached.success,
        });
        return {
          ...cached,
          searchProgress: cached.searchProgress || [],
        };
      }
    }

    this.telemetry.emit(TELEMETRY_EVENTS.START, {
      address,
      chainId: chain.id,
    });

    try {
      const result = await this.performLookup(
        address,
        chain,
        addProgress,
        searchProgress,
        {
          signal,
          etherscanApiKey,
          blockscoutApiKey,
          preferredSources,
        }
      );

      if (useCache && result.success) {
        contractLookupCache.set(address, chain.id, result);
      }

      this.telemetry.emit(TELEMETRY_EVENTS.SUCCESS, {
        address,
        chainId: chain.id,
        success: result.success,
        source: result.source,
      });

      return result;
    } catch (error) {
      this.telemetry.emit(TELEMETRY_EVENTS.FAILURE, {
        address,
        chainId: chain.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        ...baseResult,
        error: `Network error: ${error}`,
        searchProgress,
      };
    }
  }

  private async performLookup(
    address: string,
    chain: Chain,
    addProgress: (
      source: string,
      status: "searching" | "found" | "not_found" | "error",
      message?: string
    ) => void,
    searchProgress: LookupProgress,
    options: {
      signal?: AbortSignal;
      etherscanApiKey?: string;
      blockscoutApiKey?: string;
      preferredSources?: ExplorerSource[];
    } = {}
  ): Promise<ContractInfoResult> {
    const { signal, etherscanApiKey, blockscoutApiKey, preferredSources } =
      options;
    let finalResult: ContractInfoResult = {
      success: false,
      address,
      chain,
      searchProgress: [],
    };

    const telemetryRetry =
      (source: string) =>
      (error: unknown, attempt: number, nextDelay: number) => {
        this.telemetry.emit("contract.lookup.retry", {
          source,
          attempt,
          delayMs: nextDelay,
          error: error instanceof Error ? error.message : String(error),
        });
      };

    const integrateAbiDetails = async (
      result: ContractInfoResult
    ): Promise<ContractInfoResult> => {
      if (!result.success || !result.abi) {
        return result;
      }

      try {
        const parsedABI = JSON.parse(result.abi);
        const externalFunctions = extractExternalFunctions(parsedABI);

        let tokenInfo = result.tokenInfo;
        if (!tokenInfo) {
          addProgress("Token API", "searching", "Fetching token metadata...");
          tokenInfo = await fetchTokenInfo(address, parsedABI, chain);
          if (tokenInfo) {
            addProgress(
              "Token API",
              "found",
              `Token: ${tokenInfo.name} (${tokenInfo.symbol})`
            );
          } else {
            addProgress(
              "Token API",
              "not_found",
              "Could not fetch token metadata"
            );
          }
        }

        const updatedResult: ContractInfoResult = {
          ...result,
          externalFunctions,
          tokenInfo,
          searchProgress: [...searchProgress],
        };

        if (!updatedResult.contractName && tokenInfo?.name) {
          updatedResult.contractName = tokenInfo.name;
        }

        if (!updatedResult.contractName) {
          const contractABI = parsedABI.find(
            (item: any) => item.type === "constructor"
          );
          updatedResult.contractName = contractABI?.name || "Smart Contract";
        }

        return updatedResult;
      } catch (parseError) {
        return {
          ...result,
          success: false,
          error: `Failed to parse ABI: ${parseError}`,
        };
      }
    };

    const SOURCE_TIMEOUT_MS = 6000;

    class SourceTimeoutError extends Error {
      sourceKey: ExplorerSource;

      constructor(message: string, sourceKey: ExplorerSource) {
        super(message);
        this.name = "SourceTimeoutError";
        this.sourceKey = sourceKey;
      }
    }

    type SourceOutcomeStatus = "success" | "not_found" | "error" | "timeout";

    interface SourceOutcome {
      status: SourceOutcomeStatus;
      sourceKey: ExplorerSource;
      result?: Partial<ContractInfoResult>;
      error?: string;
    }

    interface SourceConfig {
      key: ExplorerSource;
      label: string;
      startMessage: string;
      successMessage: (result: Partial<ContractInfoResult>) => string;
      notFoundMessage: string;
      fetch: () => Promise<Partial<ContractInfoResult>>;
    }

    const withSourceTimeout = async <T>(
      promise: Promise<T>,
      config: SourceConfig
    ): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(
            new SourceTimeoutError(
              `${config.label} timed out after ${SOURCE_TIMEOUT_MS / 1000}s`,
              config.key
            )
          );
        }, SOURCE_TIMEOUT_MS);

        promise.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          }
        );
      });

    const executeSource = async (
      config: SourceConfig
    ): Promise<SourceOutcome> => {
      addProgress(config.label, "searching", config.startMessage);

      if (signal?.aborted) {
        const errorMessage = "Lookup cancelled";
        addProgress(config.label, "error", errorMessage);
        return { status: "error", sourceKey: config.key, error: errorMessage };
      }

      try {
        const result = await withSourceTimeout(config.fetch(), config);

        if (result.success && result.abi) {
          addProgress(config.label, "found", config.successMessage(result));
          return { status: "success", sourceKey: config.key, result };
        }

        const failureMessage =
          result.error && result.error.trim().length > 0
            ? result.error
            : config.notFoundMessage;

        addProgress(config.label, "not_found", failureMessage);
        return {
          status: "not_found",
          sourceKey: config.key,
          error: failureMessage,
        };
      } catch (error) {
        const timeoutError = error as SourceTimeoutError;
        const isTimeout = timeoutError instanceof SourceTimeoutError;
        const message = isTimeout
          ? timeoutError.message
          : error instanceof Error
            ? error.message
            : String(error);

        addProgress(config.label, "error", message);

        return {
          status: isTimeout ? "timeout" : "error",
          sourceKey: isTimeout ? timeoutError.sourceKey : config.key,
          error: message,
        };
      }
    };

    const baseConfigs: SourceConfig[] = [
      {
        key: "sourcify",
        label: "Sourcify",
        startMessage: "Sourcify • verifying source",
        successMessage: (result) =>
          `Sourcify ✓ ${result.contractName || "Verified contract"}`,
        notFoundMessage: "Sourcify ✗ Not verified",
        fetch: () =>
          withRetry(() => fetchFromSourcify(address, chain), {
            retries: 1,
            delayMs: 350,
            signal,
            onRetry: telemetryRetry("Sourcify"),
          }),
      },
      {
        key: "blockscout",
        label: "Blockscout",
        startMessage: "Blockscout • verifying source",
        successMessage: (result) =>
          `Blockscout ✓ ${result.contractName || "Verified contract"}`,
        notFoundMessage: "Blockscout ✗ Not verified",
        fetch: () =>
          withRetry(
            () =>
              fetchFromBlockscout(
                address,
                chain,
                blockscoutApiKey ?? etherscanApiKey
              ),
            {
              retries: 2,
              delayMs: 500,
              signal,
              onRetry: telemetryRetry("Blockscout"),
            }
          ),
      },
      {
        key: "etherscan",
        label: "Etherscan",
        startMessage: "Etherscan • verifying source",
        successMessage: (result) =>
          `Etherscan ✓ ${result.contractName || "Verified contract"}`,
        notFoundMessage: "Etherscan ✗ Not verified",
        fetch: () =>
          withRetry(() => fetchFromEtherscan(address, chain, etherscanApiKey), {
            retries: 2,
            delayMs: 500,
            signal,
            onRetry: telemetryRetry("Etherscan"),
          }),
      },
    ];

    const preferredSet = new Set<ExplorerSource>(
      (preferredSources ?? []).filter((source): source is ExplorerSource =>
        ["sourcify", "blockscout", "etherscan"].includes(source)
      )
    );

    const preferredConfigs = baseConfigs.filter((config) =>
      preferredSet.has(config.key)
    );
    const fallbackConfigs = baseConfigs.filter(
      (config) => !preferredSet.has(config.key)
    );
    const groupedConfigs = preferredConfigs.length
      ? [preferredConfigs, fallbackConfigs]
      : [baseConfigs];

    const failureSummary = new Map<ExplorerSource, string>();
    let primaryOutcome: SourceOutcome | null = null;

    const executeGroup = async (
      configs: SourceConfig[]
    ): Promise<SourceOutcome | null> => {
      if (configs.length === 0) {
        return null;
      }

      const tasks = configs.map((config) =>
        (async () => {
          const outcome = await executeSource(config);

          if (outcome.status === "success" && outcome.result) {
            return outcome;
          }

          const message =
            outcome.error && outcome.error.trim().length > 0
              ? outcome.error
              : config.notFoundMessage;

          failureSummary.set(config.key, message);
          throw outcome;
        })()
      );

      let groupOutcome: SourceOutcome | null = null;

      try {
        groupOutcome = await Promise.any(tasks);
      } catch (aggregateError) {
        if (aggregateError instanceof AggregateError) {
          for (const reason of aggregateError.errors) {
            const outcome = reason as SourceOutcome;
            if (!outcome || typeof outcome !== "object") {
              continue;
            }

            const sourceKey = outcome.sourceKey;
            if (!failureSummary.has(sourceKey)) {
              const fallbackMessage =
                outcome.error && outcome.error.trim().length > 0
                  ? outcome.error
                  : configs.find((cfg) => cfg.key === sourceKey)
                      ?.notFoundMessage || "Explorer lookup failed";
              failureSummary.set(sourceKey, fallbackMessage);
            }
          }
        }
      } finally {
        await Promise.allSettled(tasks);
      }

      return groupOutcome;
    };

    for (const configs of groupedConfigs) {
      const outcome = await executeGroup(configs);
      if (outcome?.status === "success" && outcome.result) {
        primaryOutcome = outcome;
        break;
      }
    }

    if (primaryOutcome?.status === "success" && primaryOutcome.result) {
      finalResult = await integrateAbiDetails({
        ...finalResult,
        ...primaryOutcome.result,
        success: true,
      });
    }

    const explorerFailureSummary =
      failureSummary.size > 0
        ? Array.from(failureSummary.entries())
            .map(([sourceKey, message]) => `${sourceKey}: ${message}`)
            .join("; ")
        : undefined;

    if (!finalResult.success) {
      addProgress(
        "Blockscout EBD",
        "searching",
        "Searching Blockscout's shared bytecode database..."
      );
      const bytecodeDbResult = await withRetry(
        () => fetchFromBlockscoutBytecodeDB(address, chain),
        {
          retries: 1,
          delayMs: 800,
          signal,
          onRetry: telemetryRetry("Blockscout EBD"),
        }
      );

      if (bytecodeDbResult.success) {
        addProgress(
          "Blockscout EBD",
          "found",
          `Recovered sources from Blockscout Bytecode DB: ${bytecodeDbResult.contractName || "Unknown"}`
        );
        finalResult = await integrateAbiDetails({
          ...finalResult,
          ...bytecodeDbResult,
          success: true,
        });
      } else {
        addProgress(
          "Blockscout EBD",
          "not_found",
          bytecodeDbResult.error ||
            "Sources not found in Blockscout Bytecode DB"
        );
      }
    }

    if (!finalResult.success) {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
      try {
        const code = await provider.getCode(address);
        if (!code || code === "0x") {
          addProgress(
            "RawProbe",
            "error",
            "Contract has no runtime bytecode on this chain"
          );
        } else {
          addProgress(
            "RawProbe",
            "searching",
            "Inspecting bytecode (raw probe)"
          );

          const erc165 = new ethers.Contract(
            address,
            [
              "function supportsInterface(bytes4 interfaceId) external view returns (bool)",
            ],
            provider
          );
          let supports165 = false;
          try {
            supports165 = await erc165.supportsInterface("0x01ffc9a7");
          } catch {
            supports165 = false;
          }

          if (supports165) {
            addProgress(
              "RawProbe",
              "found",
              "ERC165 supported, contract likely modern"
            );
          } else {
            addProgress(
              "RawProbe",
              "not_found",
              "No ERC165 support detected via raw probe"
            );
          }
        }
      } catch (rawErr) {
        addProgress("RawProbe", "error", String(rawErr));
      }
    }

    finalResult = {
      ...finalResult,
      searchProgress: [...searchProgress],
    };

    if (!finalResult.success) {
      finalResult = {
        ...finalResult,
        error:
          finalResult.error ||
          explorerFailureSummary ||
          "Verified ABI not found across supported explorers",
      };
    }

    return finalResult;
  }
}

export const defaultContractLookupService = new ContractLookupService();
