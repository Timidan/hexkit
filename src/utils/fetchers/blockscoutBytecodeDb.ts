import axios from 'axios';
import { ethers } from 'ethers';
import type { Chain } from '../../types';
import type { ContractInfoResult } from '../../types/contractInfo';
import { getBlockscoutBytecodeDbUrl } from '../env';
import { withRetry } from './common';

interface BlockscoutBytecodeSource {
  contractName?: string;
  compilerVersion?: string;
  compilerSettings?: string;
  sourceFiles?: Record<string, string>;
  abi?: string | Record<string, unknown> | unknown[];
  constructorArguments?: string;
  matchType?: string;
  sourceType?: string;
}

interface BlockscoutBytecodeSearchResponse {
  ethBytecodeDbSources?: BlockscoutBytecodeSource[];
  sourcifySources?: BlockscoutBytecodeSource[];
  allianceSources?: BlockscoutBytecodeSource[];
}

export const fetchFromBlockscoutBytecodeDB = async (
  address: string,
  chain: Chain
): Promise<Partial<ContractInfoResult>> => {
  try {
    const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
    const deployedBytecode = await withRetry(() => provider.getCode(address));

    if (!deployedBytecode || deployedBytecode === '0x') {
      return {
        success: false,
        error: 'Contract has no runtime bytecode on this chain',
      };
    }

    const requestBody = {
      bytecode: deployedBytecode,
      bytecodeType: 'DEPLOYED_BYTECODE',
      chain: String(chain.id),
      address,
      onlyLocal: false,
    };

    const response = await withRetry(() =>
      axios.post<BlockscoutBytecodeSearchResponse>(
        `${getBlockscoutBytecodeDbUrl()}/api/v2/bytecodes/sources:search-all`,
        requestBody,
        {
          timeout: 20000,
        }
      )
    );

    const pickSource = (
      payload: BlockscoutBytecodeSearchResponse
    ): BlockscoutBytecodeSource | undefined => {
      const prioritized = [
        payload.ethBytecodeDbSources,
        payload.sourcifySources,
        payload.allianceSources,
      ];

      for (const collection of prioritized) {
        if (collection && collection.length > 0) {
          return collection[0];
        }
      }

      return undefined;
    };

    const primarySource = pickSource(response.data);

    if (!primarySource) {
      return {
        success: false,
        error: 'No matching source found in Blockscout Bytecode DB',
      };
    }

    const normalizeAbi = (
      rawAbi: BlockscoutBytecodeSource['abi']
    ): string | undefined => {
      if (!rawAbi) return undefined;
      if (typeof rawAbi === 'string') {
        try {
          JSON.parse(rawAbi);
          return rawAbi;
        } catch (parseErr) {
          console.warn(
            '🔍 [EBD] ABI string is not valid JSON, discarding.',
            parseErr
          );
          return undefined;
        }
      }
      try {
        return JSON.stringify(rawAbi);
      } catch (jsonErr) {
        console.warn('🔍 [EBD] Failed to stringify ABI object.', jsonErr);
        return undefined;
      }
    };

    const abi = normalizeAbi(primarySource.abi);

    if (!abi) {
      return {
        success: false,
        error: 'Blockscout Bytecode DB returned a match without ABI',
      };
    }

    const contractName = primarySource.contractName || 'Smart Contract';

    return {
      success: true,
      abi,
      contractName,
      source: 'blockscout-bytecode',
      explorerName: 'Blockscout Bytecode DB',
      verified: true,
    };
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const errorMessage =
        status === 404
          ? 'No matching source found in Blockscout Bytecode DB'
          : `Blockscout Bytecode DB error: ${error.message}`;

      console.warn('Blockscout Bytecode DB request failed:', errorMessage);
      return {
        success: false,
        error: errorMessage,
      };
    }

    console.error('Blockscout Bytecode DB unexpected error:', error);
    return {
      success: false,
      error: `Blockscout Bytecode DB error: ${String(error)}`,
    };
  }
};
