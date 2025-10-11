import { ethers } from 'ethers';
import type { Chain } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';
import {
  withRetry,
  fetchFromBlockscoutBytecodeDB,
  fetchFromSourcify,
  fetchFromBlockscout,
  fetchFromEtherscan,
  extractExternalFunctions,
  fetchTokenInfo,
} from '../fetchers';
import { contractLookupCache } from '../cache/contractLookupCache';
import {
  consoleTelemetry,
  TelemetryEmitter,
} from '../telemetry/TelemetryEmitter';

export interface ContractLookupOptions {
  progressCallback?: (progress: {
    source: string;
    status: 'searching' | 'found' | 'not_found' | 'error';
    message?: string;
  }) => void;
  useCache?: boolean;
  cacheMaxAgeMs?: number;
  signal?: AbortSignal;
  etherscanApiKey?: string;
  blockscoutApiKey?: string;
}

const DEFAULT_CACHE_MAX_AGE = 5 * 60 * 1000;

const TELEMETRY_EVENTS = {
  START: 'contract.lookup.start',
  STEP: 'contract.lookup.step',
  SUCCESS: 'contract.lookup.success',
  FAILURE: 'contract.lookup.failure',
  CACHE_HIT: 'contract.lookup.cache_hit',
} as const;

type LookupProgress = NonNullable<ContractInfoResult['searchProgress']>;

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
    } = options;

    const searchProgress: LookupProgress = [];

    const addProgress = (
      source: string,
      status: 'searching' | 'found' | 'not_found' | 'error',
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

    if (!address || !address.startsWith('0x') || address.length !== 42) {
      return {
        ...baseResult,
        error: 'Invalid contract address format',
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
      status: 'searching' | 'found' | 'not_found' | 'error',
      message?: string
    ) => void,
    searchProgress: LookupProgress,
    options: {
      signal?: AbortSignal;
      etherscanApiKey?: string;
      blockscoutApiKey?: string;
    } = {}
  ): Promise<ContractInfoResult> {
    const { signal, etherscanApiKey, blockscoutApiKey } = options;
    let finalResult: ContractInfoResult = {
      success: false,
      address,
      chain,
      searchProgress: [],
    };

    const telemetryRetry = (source: string) =>
      (error: unknown, attempt: number, nextDelay: number) => {
        this.telemetry.emit('contract.lookup.retry', {
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
          addProgress('Token API', 'searching', 'Fetching token metadata...');
          tokenInfo = await fetchTokenInfo(address, parsedABI, chain);
          if (tokenInfo) {
            addProgress(
              'Token API',
              'found',
              `Token: ${tokenInfo.name} (${tokenInfo.symbol})`
            );
          } else {
            addProgress(
              'Token API',
              'not_found',
              'Could not fetch token metadata'
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
            (item: any) => item.type === 'constructor'
          );
          updatedResult.contractName = contractABI?.name || 'Smart Contract';
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

    addProgress(
      'Sourcify',
      'searching',
      'Searching Sourcify for verified contract...'
    );
    const sourcifyResult = await withRetry(
      () => fetchFromSourcify(address, chain),
      {
        retries: 2,
        delayMs: 400,
        signal,
        onRetry: telemetryRetry('Sourcify'),
      }
    );

    if (sourcifyResult.success) {
      addProgress(
        'Sourcify',
        'found',
        `Found verified contract on Sourcify: ${sourcifyResult.contractName || 'Unknown'}`
      );
      finalResult = await integrateAbiDetails({
        ...finalResult,
        ...sourcifyResult,
        success: true,
      });
    } else {
      addProgress(
        'Sourcify',
        'not_found',
        sourcifyResult.error || 'Contract not found on Sourcify'
      );
    }

    if (!finalResult.success) {
      addProgress(
        'Blockscout',
        'searching',
        'Searching Blockscout for verified contract...'
      );
      const blockscoutResult = await withRetry(
        () => fetchFromBlockscout(address, chain, blockscoutApiKey),
        {
          retries: 2,
          delayMs: 500,
          signal,
          onRetry: telemetryRetry('Blockscout'),
        }
      );

      if (blockscoutResult.success) {
        addProgress(
          'Blockscout',
          'found',
          `Found verified contract on Blockscout: ${blockscoutResult.contractName || 'Unknown'}`
        );
        finalResult = await integrateAbiDetails({
          ...finalResult,
          ...blockscoutResult,
          success: true,
        });
      } else {
        addProgress(
          'Blockscout',
          'not_found',
          blockscoutResult.error || 'Contract not found on Blockscout'
        );
      }
    }

    if (!finalResult.success) {
      addProgress(
        'Etherscan',
        'searching',
        'Searching Etherscan for verified contract...'
      );
      const etherscanResult = await withRetry(
        () => fetchFromEtherscan(address, chain, etherscanApiKey),
        {
          retries: 2,
          delayMs: 500,
          signal,
          onRetry: telemetryRetry('Etherscan'),
        }
      );

      if (etherscanResult.success) {
        addProgress(
          'Etherscan',
          'found',
          `Found verified contract on Etherscan: ${etherscanResult.contractName || 'Unknown'}`
        );
        finalResult = await integrateAbiDetails({
          ...finalResult,
          ...etherscanResult,
          success: true,
        });
      } else {
        addProgress(
          'Etherscan',
          'not_found',
          etherscanResult.error || 'Contract not found on Etherscan'
        );
      }
    }

    if (!finalResult.success) {
      addProgress(
        'Blockscout EBD',
        'searching',
        "Searching Blockscout's shared bytecode database..."
      );
      const bytecodeDbResult = await withRetry(
        () => fetchFromBlockscoutBytecodeDB(address, chain),
        {
          retries: 1,
          delayMs: 800,
          signal,
          onRetry: telemetryRetry('Blockscout EBD'),
        }
      );

      if (bytecodeDbResult.success) {
        addProgress(
          'Blockscout EBD',
          'found',
          `Recovered sources from Blockscout Bytecode DB: ${bytecodeDbResult.contractName || 'Unknown'}`
        );
        finalResult = { ...finalResult, ...bytecodeDbResult };
      } else {
        addProgress(
          'Blockscout EBD',
          'not_found',
          bytecodeDbResult.error || 'Sources not found in Blockscout Bytecode DB'
        );
      }
    }

    if (!finalResult.success) {
      const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
      try {
        const code = await provider.getCode(address);
        if (!code || code === '0x') {
          addProgress(
            'RawProbe',
            'error',
            'Contract has no runtime bytecode on this chain'
          );
        } else {
          addProgress('RawProbe', 'searching', 'Inspecting bytecode (raw probe)');

          const erc165 = new ethers.Contract(
            address,
            ['function supportsInterface(bytes4 interfaceId) external view returns (bool)'],
            provider
          );
          let supports165 = false;
          try {
            supports165 = await erc165.supportsInterface('0x01ffc9a7');
          } catch {
            supports165 = false;
          }

          if (supports165) {
            addProgress('RawProbe', 'found', 'ERC165 supported, contract likely modern');
          } else {
            addProgress(
              'RawProbe',
              'not_found',
              'No ERC165 support detected via raw probe'
            );
          }
        }
      } catch (rawErr) {
        addProgress('RawProbe', 'error', String(rawErr));
      }
    }

    finalResult = {
      ...finalResult,
      searchProgress: [...searchProgress],
    };

    return finalResult;
  }
}

export const defaultContractLookupService = new ContractLookupService();
