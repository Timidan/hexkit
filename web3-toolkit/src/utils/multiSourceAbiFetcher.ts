import axios from 'axios';
import { fetchFromWhatsABI, type WhatsABIResult } from './whatsabiFetcher';
import type { Chain, ABIFetchResult, ExplorerAPI } from '../types';

// Extended result with comprehensive token/contract information
interface ExtendedABIFetchResult extends ABIFetchResult {
  source?: string;
  explorerName?: string;
  contractName?: string;
  compilerVersion?: string;
  sourceCode?: string;
  tokenInfo?: {
    name?: string;
    symbol?: string;
    decimals?: string;
    totalSupply?: string;
    tokenType?: string;
    divisor?: string;
  };
}

interface EtherscanResponse {
  status: string;
  message: string;
  result: string;
}

interface BlockscoutResponse {
  message: string;
  result?: string;
  status?: string;
}

interface EtherscanSourceResponse {
  status: string;
  message: string;
  result: Array<{
    ContractName: string;
    CompilerVersion: string;
    SourceCode: string;
  }>;
}

interface EtherscanTokenInfoResponse {
  status: string;
  message: string;
  result: {
    contractAddress: string;
    tokenName: string;
    symbol: string;
    divisor: string;
    tokenType: string;
    totalSupply: string;
  };
}

interface BlockscoutTokenResponse {
  message: string;
  result?: {
    name: string;
    symbol: string;
    decimals: string;
    totalSupply: string;
    type: string;
  };
}

// Sourcify API response interfaces
interface SourcifyContractResponse {
  matchId?: string;
  creationMatch?: string;
  runtimeMatch?: string;
  verifiedAt?: string;
  match?: string;
  chainId?: string;
  address?: string;
  compilation?: {
    compiler?: {
      version?: string;
    };
    name?: string;
    target?: string;
    language?: string;
  };
  metadata?: {
    output?: {
      abi?: any[];
    };
    settings?: {
      compilationTarget?: Record<string, string>;
    };
  };
  sources?: Record<string, any>;
  deployment?: {
    transactionHash?: string;
    blockNumber?: string;
  };
}

// Fetch ABI from Sourcify API (highest priority)
const fetchFromSourcify = async (
  contractAddress: string,
  chainId: number
): Promise<ExtendedABIFetchResult> => {
  try {
    console.log(`Fetching ABI from Sourcify: ${contractAddress} on chain ${chainId}`);
    
    // Use Sourcify APIv2 contract lookup endpoint
    const url = `https://sourcify.dev/server/v2/contract/${chainId}/${contractAddress}`;
    
    const response = await axios.get<SourcifyContractResponse>(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Web3-Toolkit/1.0',
        'Accept': 'application/json',
      },
    });

    if (response.data && response.data.match) {
      // Check if contract is verified (has match)
      const matchType = response.data.match;
      
      if (matchType === 'exact_match' || matchType === 'match') {
        // Try to get ABI from metadata
        if (response.data.metadata?.output?.abi) {
          const abi = JSON.stringify(response.data.metadata.output.abi);
          
          // Extract contract name from compilation target
          let contractName: string | undefined;
          if (response.data.compilation?.target) {
            const targetParts = response.data.compilation.target.split(':');
            contractName = targetParts[targetParts.length - 1];
          } else if (response.data.compilation?.name) {
            contractName = response.data.compilation.name;
          }
          
          return {
            success: true,
            abi: abi,
            source: 'sourcify',
            explorerName: 'Sourcify',
            contractName: contractName,
            compilerVersion: response.data.compilation?.compiler?.version,
            sourceCode: response.data.sources ? 'Available' : undefined,
          };
        } else {
          // Try to fetch metadata.json directly
          try {
            const metadataUrl = `https://repo.sourcify.dev/contracts/full_match/${chainId}/${contractAddress}/metadata.json`;
            const metadataResponse = await axios.get(metadataUrl, {
              timeout: 10000,
              maxRedirects: 5, // Follow redirects
              headers: {
                'User-Agent': 'Web3-Toolkit/1.0',
                'Accept': 'application/json',
              },
            });
            
            if (metadataResponse.data && metadataResponse.data.output && metadataResponse.data.output.abi) {
              const abi = JSON.stringify(metadataResponse.data.output.abi);
              
              // Extract contract name from compilation target
              let contractName: string | undefined;
              const compilationTarget = metadataResponse.data.settings?.compilationTarget;
              if (compilationTarget) {
                const targetKeys = Object.keys(compilationTarget);
                if (targetKeys.length > 0) {
                  contractName = compilationTarget[targetKeys[0]];
                }
              }
              
              return {
                success: true,
                abi: abi,
                source: 'sourcify',
                explorerName: 'Sourcify',
                contractName: contractName,
                compilerVersion: metadataResponse.data.compiler?.version,
                sourceCode: 'Available',
              };
            }
          } catch (metadataError) {
            console.log('Failed to fetch Sourcify metadata.json:', metadataError);
          }
        }
      }
      
      return {
        success: false,
        error: `Contract found on Sourcify but no ABI available (match: ${matchType})`,
        source: 'sourcify',
        explorerName: 'Sourcify',
      };
    }

    return {
      success: false,
      error: 'Contract not verified on Sourcify',
      source: 'sourcify',
      explorerName: 'Sourcify',
    };

  } catch (error: any) {
    console.error('Error fetching from Sourcify:', error);

    if (error.response?.status === 404) {
      return {
        success: false,
        error: 'Contract not found on Sourcify',
        source: 'sourcify',
        explorerName: 'Sourcify',
      };
    }

    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: 'Sourcify request timeout',
        source: 'sourcify',
        explorerName: 'Sourcify',
      };
    }

    if (error.response?.status === 429) {
      return {
        success: false,
        error: 'Sourcify rate limit exceeded',
        source: 'sourcify',
        explorerName: 'Sourcify',
      };
    }

    return {
      success: false,
      error: `Sourcify connection error: ${error.message}`,
      source: 'sourcify',
      explorerName: 'Sourcify',
    };
  }
};

// Fetch contract source information from Etherscan-style API
const fetchContractSourceInfo = async (
  contractAddress: string,
  apiUrl: string,
  explorerName: string,
  apiKey?: string
): Promise<{ contractName?: string; compilerVersion?: string; sourceCode?: string }> => {
  try {
    const url = `${apiUrl}?module=contract&action=getsourcecode&address=${contractAddress}${apiKey ? `&apikey=${apiKey}` : ''}`;
    
    const response = await axios.get<EtherscanSourceResponse>(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Web3-Toolkit/1.0',
      },
    });

    if (response.data.status === '1' && response.data.result && response.data.result.length > 0) {
      const sourceInfo = response.data.result[0];
      return {
        contractName: sourceInfo.ContractName || undefined,
        compilerVersion: sourceInfo.CompilerVersion || undefined,
        sourceCode: sourceInfo.SourceCode ? sourceInfo.SourceCode.slice(0, 100) + '...' : undefined // Truncate for memory
      };
    }
  } catch (error) {
    console.warn(`Failed to fetch source info from ${explorerName}:`, error);
  }
  
  return {};
};

// Fetch token information from Etherscan token API
const fetchTokenInfoFromEtherscan = async (
  contractAddress: string,
  apiUrl: string,
  explorerName: string,
  apiKey?: string
): Promise<{ name?: string; symbol?: string; decimals?: string; totalSupply?: string; tokenType?: string; divisor?: string }> => {
  try {
    const url = `${apiUrl}?module=token&action=tokeninfo&contractaddress=${contractAddress}${apiKey ? `&apikey=${apiKey}` : ''}`;
    
    const response = await axios.get<EtherscanTokenInfoResponse>(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Web3-Toolkit/1.0',
      },
    });

    if (response.data.status === '1' && response.data.result) {
      const tokenData = response.data.result;
      return {
        name: tokenData.tokenName || undefined,
        symbol: tokenData.symbol || undefined,
        decimals: tokenData.divisor || undefined,
        totalSupply: tokenData.totalSupply || undefined,
        tokenType: tokenData.tokenType || undefined,
        divisor: tokenData.divisor || undefined,
      };
    }
  } catch (error) {
    console.warn(`Failed to fetch token info from ${explorerName}:`, error);
  }
  
  return {};
};

// Fetch contract source information from Blockscout API
const fetchContractSourceInfoFromBlockscout = async (
  contractAddress: string,
  apiUrl: string,
  explorerName: string
): Promise<{ contractName?: string; compilerVersion?: string }> => {
  try {
    // Try multiple endpoints to get contract source info from Blockscout
    const endpoints = [
      `${apiUrl}?module=contract&action=getsourcecode&address=${contractAddress}`,
      `${apiUrl}/v2/smart-contracts/${contractAddress}`,
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          timeout: 10000,
          headers: {
            'User-Agent': 'Web3-Toolkit/1.0',
            'Accept': 'application/json',
          },
        });

        // Handle Etherscan-style response from Blockscout
        if (response.data.status === '1' && response.data.result && response.data.result.length > 0) {
          const sourceInfo = response.data.result[0];
          return {
            contractName: sourceInfo.ContractName || undefined,
            compilerVersion: sourceInfo.CompilerVersion || undefined,
          };
        }

        // Handle Blockscout v2 API response
        if (response.data.name || response.data.contract_name) {
          return {
            contractName: response.data.name || response.data.contract_name || undefined,
            compilerVersion: response.data.compiler_version || undefined,
          };
        }

        // Handle nested contract data
        if (response.data.result && (response.data.result.name || response.data.result.contract_name)) {
          return {
            contractName: response.data.result.name || response.data.result.contract_name || undefined,
            compilerVersion: response.data.result.compiler_version || undefined,
          };
        }
        
      } catch (endpointError) {
        continue; // Try next endpoint
      }
    }
  } catch (error) {
    console.warn(`Failed to fetch contract source info from ${explorerName} Blockscout:`, error);
  }
  
  return {};
};

// Fetch token information from Blockscout token API
const fetchTokenInfoFromBlockscout = async (
  contractAddress: string,
  apiUrl: string,
  explorerName: string
): Promise<{ name?: string; symbol?: string; decimals?: string; totalSupply?: string; tokenType?: string }> => {
  try {
    const url = `${apiUrl}?module=token&action=getToken&contractaddress=${contractAddress}`;
    
    const response = await axios.get<BlockscoutTokenResponse>(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Web3-Toolkit/1.0',
      },
    });

    if (response.data.result) {
      const tokenData = response.data.result;
      return {
        name: tokenData.name || undefined,
        symbol: tokenData.symbol || undefined,
        decimals: tokenData.decimals || undefined,
        totalSupply: tokenData.totalSupply || undefined,
        tokenType: tokenData.type || undefined,
      };
    }
  } catch (error) {
    console.warn(`Failed to fetch token info from ${explorerName} Blockscout:`, error);
  }
  
  return {};
};

// Fetch ABI from Etherscan-style API
const fetchFromEtherscan = async (
  contractAddress: string,
  apiUrl: string,
  explorerName: string,
  apiKey?: string
): Promise<ExtendedABIFetchResult> => {
  try {
    const url = `${apiUrl}?module=contract&action=getabi&address=${contractAddress}${apiKey ? `&apikey=${apiKey}` : ''}`;
    console.log(`Fetching ABI from ${explorerName} (Etherscan API): ${contractAddress}`);
    
    const response = await axios.get<EtherscanResponse>(url, {
      timeout: 15000, // 15 second timeout
      headers: {
        'User-Agent': 'Web3-Toolkit/1.0',
      },
    });

    if (response.data.status === '1' && response.data.result) {
      try {
        JSON.parse(response.data.result);
        
        // Fetch additional contract information and token info in parallel
        const [sourceInfo, tokenInfo] = await Promise.allSettled([
          fetchContractSourceInfo(contractAddress, apiUrl, explorerName, apiKey),
          fetchTokenInfoFromEtherscan(contractAddress, apiUrl, explorerName, apiKey)
        ]);
        
        const contractSource = sourceInfo.status === 'fulfilled' ? sourceInfo.value : {};
        const tokenData = tokenInfo.status === 'fulfilled' ? tokenInfo.value : {};
        
        return {
          success: true,
          abi: response.data.result,
          source: 'etherscan',
          explorerName,
          contractName: contractSource.contractName,
          compilerVersion: contractSource.compilerVersion,
          sourceCode: contractSource.sourceCode,
          tokenInfo: Object.keys(tokenData).length > 0 ? tokenData : undefined,
        };
      } catch (jsonError) {
        return {
          success: false,
          error: `Invalid ABI format from ${explorerName}`,
          source: 'etherscan',
          explorerName,
        };
      }
    } else if (response.data.status === '0') {
      const message = response.data.message || response.data.result;
      
      if (message && message.includes('Contract source code not verified')) {
        return {
          success: false,
          error: `Contract not verified on ${explorerName}`,
          source: 'etherscan',
          explorerName,
        };
      }
      
      if (message === 'NOTOK' || message === 'No data found') {
        return {
          success: false,
          error: apiKey ? `Contract not found on ${explorerName}` : `Rate limited on ${explorerName} - API key may help`,
          source: 'etherscan',
          explorerName,
        };
      }
      
      return {
        success: false,
        error: `${explorerName}: ${message || 'Failed to fetch ABI'}`,
        source: 'etherscan',
        explorerName,
      };
    }

    return {
      success: false,
      error: `Unexpected response from ${explorerName}`,
      source: 'etherscan',
      explorerName,
    };
  } catch (error: any) {
    console.error(`Error fetching from ${explorerName}:`, error);

    if (error.code === 'ECONNABORTED') {
      return {
        success: false,
        error: `${explorerName} request timeout`,
        source: 'etherscan',
        explorerName,
      };
    }

    if (error.response?.status === 403) {
      return {
        success: false,
        error: `${explorerName} API access denied`,
        source: 'etherscan',
        explorerName,
      };
    }

    if (error.response?.status === 429) {
      return {
        success: false,
        error: `${explorerName} rate limit exceeded`,
        source: 'etherscan',
        explorerName,
      };
    }

    return {
      success: false,
      error: `${explorerName} connection error: ${error.message}`,
      source: 'etherscan',
      explorerName,
    };
  }
};

// Fetch ABI from Blockscout API
const fetchFromBlockscout = async (
  contractAddress: string,
  apiUrl: string,
  explorerName: string
): Promise<ExtendedABIFetchResult> => {
  try {
    // Blockscout uses different endpoints - try multiple approaches
    const endpoints = [
      `${apiUrl}?module=contract&action=getabi&address=${contractAddress}`,
      `${apiUrl}/v2/smart-contracts/${contractAddress}`,
      `${apiUrl}/api/eth-rpc?module=contract&action=getabi&address=${contractAddress}`,
    ];

    console.log(`Fetching ABI from ${explorerName} (Blockscout API): ${contractAddress}`);
    
    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(endpoint, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Web3-Toolkit/1.0',
            'Accept': 'application/json',
          },
        });

        // Handle Etherscan-style response from Blockscout
        if (response.data.status === '1' && response.data.result) {
          try {
            JSON.parse(response.data.result);
            
            // Fetch additional contract information and token info in parallel
            const [sourceInfo, tokenInfo] = await Promise.allSettled([
              fetchContractSourceInfoFromBlockscout(contractAddress, apiUrl, explorerName),
              fetchTokenInfoFromBlockscout(contractAddress, apiUrl, explorerName)
            ]);
            
            const contractSource = sourceInfo.status === 'fulfilled' ? sourceInfo.value : {};
            const tokenData = tokenInfo.status === 'fulfilled' ? tokenInfo.value : {};
            
            return {
              success: true,
              abi: response.data.result,
              source: 'blockscout',
              explorerName,
              contractName: contractSource.contractName,
              compilerVersion: contractSource.compilerVersion,
              tokenInfo: Object.keys(tokenData).length > 0 ? tokenData : undefined,
            };
          } catch (jsonError) {
            continue; // Try next endpoint
          }
        }

        // Handle Blockscout v2 API response
        if (response.data.abi && Array.isArray(response.data.abi)) {
          // Fetch additional contract information and token info in parallel
          const [sourceInfo, tokenInfo] = await Promise.allSettled([
            fetchContractSourceInfoFromBlockscout(contractAddress, apiUrl, explorerName),
            fetchTokenInfoFromBlockscout(contractAddress, apiUrl, explorerName)
          ]);
          
          const contractSource = sourceInfo.status === 'fulfilled' ? sourceInfo.value : {};
          const tokenData = tokenInfo.status === 'fulfilled' ? tokenInfo.value : {};
          
          return {
            success: true,
            abi: JSON.stringify(response.data.abi),
            source: 'blockscout',
            explorerName,
            contractName: contractSource.contractName,
            compilerVersion: contractSource.compilerVersion,
            tokenInfo: Object.keys(tokenData).length > 0 ? tokenData : undefined,
          };
        }

        // Handle nested ABI in smart contract data
        if (response.data.result && response.data.result.abi) {
          // Fetch additional contract information and token info in parallel
          const [sourceInfo, tokenInfo] = await Promise.allSettled([
            fetchContractSourceInfoFromBlockscout(contractAddress, apiUrl, explorerName),
            fetchTokenInfoFromBlockscout(contractAddress, apiUrl, explorerName)
          ]);
          
          const contractSource = sourceInfo.status === 'fulfilled' ? sourceInfo.value : {};
          const tokenData = tokenInfo.status === 'fulfilled' ? tokenInfo.value : {};
          
          return {
            success: true,
            abi: JSON.stringify(response.data.result.abi),
            source: 'blockscout',
            explorerName,
            contractName: contractSource.contractName,
            compilerVersion: contractSource.compilerVersion,
            tokenInfo: Object.keys(tokenData).length > 0 ? tokenData : undefined,
          };
        }

      } catch (endpointError) {
        continue; // Try next endpoint
      }
    }

    return {
      success: false,
      error: `No ABI found on ${explorerName} Blockscout`,
      source: 'blockscout',
      explorerName,
    };

  } catch (error: any) {
    console.error(`Error fetching from ${explorerName} Blockscout:`, error);
    
    return {
      success: false,
      error: `${explorerName} Blockscout error: ${error.message}`,
      source: 'blockscout',
      explorerName,
    };
  }
};

// Multi-source ABI fetching with priority order: Sourcify -> Blockscout -> Etherscan -> WhatsABI
export const fetchContractABIMultiSource = async (
  contractAddress: string,
  chain: Chain,
  etherscanApiKey?: string,
  provider?: any // Optional provider for WhatsABI
): Promise<ExtendedABIFetchResult> => {
  // Validate contract address
  if (!contractAddress || contractAddress.length !== 42 || !contractAddress.startsWith('0x')) {
    return {
      success: false,
      error: 'Invalid contract address format',
    };
  }

  // CRITICAL: Check if contract actually exists on this network before trying APIs
  try {
    const ethProvider = provider || new (await import('ethers')).ethers.providers.JsonRpcProvider(chain.rpcUrl, {
      name: chain.name,
      chainId: chain.id
    });
    
    const bytecode = await ethProvider.getCode(contractAddress);
    if (!bytecode || bytecode === '0x') {
      return {
        success: false,
        error: `No contract deployed at ${contractAddress} on ${chain.name}`,
      };
    }
    console.log(`✅ Contract exists at ${contractAddress} on ${chain.name} (${bytecode.length} chars)`);
  } catch (error) {
    return {
      success: false,
      error: `Failed to check contract existence on ${chain.name}: ${error}`,
    };
  }

  const attempts: ExtendedABIFetchResult[] = [];

  // Priority 1: Try Sourcify first (highest quality verification)
  try {
    console.log(`🔍 Trying Sourcify first for ${contractAddress} on ${chain.name}...`);
    const sourcifyResult = await fetchFromSourcify(contractAddress, chain.id);
    attempts.push(sourcifyResult);
    
    if (sourcifyResult.success) {
      console.log(`✅ ABI fetched successfully from ${sourcifyResult.explorerName} (${sourcifyResult.source})`);
      return sourcifyResult;
    }
  } catch (error) {
    console.error('Sourcify error:', error);
    attempts.push({
      success: false,
      error: `Sourcify failed: ${error}`,
      source: 'sourcify',
      explorerName: 'Sourcify',
    });
  }

  // Priority 2 & 3: Try configured chain explorers (Blockscout then Etherscan)
  // Sort explorers by priority: blockscout first, then etherscan
  const sortedExplorers = [...chain.explorers].sort((a, b) => {
    if (a.type === 'blockscout' && b.type === 'etherscan') return -1;
    if (a.type === 'etherscan' && b.type === 'blockscout') return 1;
    return 0;
  });

  for (const explorer of sortedExplorers) {
    try {
      console.log(`🔍 Trying ${explorer.name} (${explorer.type}) for ${contractAddress}...`);
      let result: ExtendedABIFetchResult;

      if (explorer.type === 'etherscan') {
        result = await fetchFromEtherscan(
          contractAddress,
          explorer.url,
          explorer.name,
          etherscanApiKey
        );
      } else if (explorer.type === 'blockscout') {
        result = await fetchFromBlockscout(
          contractAddress,
          explorer.url,
          explorer.name
        );
      } else {
        continue;
      }

      attempts.push(result);

      // If we got a successful result, return it immediately
      if (result.success) {
        console.log(`✅ ABI fetched successfully from ${result.explorerName} (${result.source})`);
        return result;
      }

    } catch (error) {
      console.error(`Error with ${explorer.name}:`, error);
      attempts.push({
        success: false,
        error: `${explorer.name} failed: ${error}`,
        source: explorer.type,
        explorerName: explorer.name,
      });
    }
  }

  // Priority 4: Final fallback - WhatsABI (works with ANY contract)
  try {
    console.log(`🔍 Trying WhatsABI as final fallback for ${contractAddress}...`);
    const whatsabiResult = await fetchFromWhatsABI(contractAddress, chain, provider);
    attempts.push(whatsabiResult);
    
    if (whatsabiResult.success) {
      console.log(`✅ ABI extracted successfully using WhatsABI (${whatsabiResult.confidence} confidence)`);
      return whatsabiResult;
    }
  } catch (error) {
    console.error('WhatsABI error:', error);
    attempts.push({
      success: false,
      error: `WhatsABI failed: ${error}`,
      source: 'whatsabi',
      explorerName: 'WhatsABI',
    });
  }

  // No successful fetch - return most informative error
  const errors = attempts.map(a => `${a.explorerName}: ${a.error}`).join('; ');
  
  return {
    success: false,
    error: `ABI not found on ${chain.name}. Tried: ${errors}`,
  };
};

// Search for contract across all supported networks
export const searchContractAcrossNetworks = async (
  contractAddress: string,
  etherscanApiKey?: string
): Promise<Array<{ chain: Chain; result: ExtendedABIFetchResult }>> => {
  const { SUPPORTED_CHAINS } = await import('./chains');
  const results: Array<{ chain: Chain; result: ExtendedABIFetchResult }> = [];

  // Search all networks in parallel for faster results
  const promises = SUPPORTED_CHAINS.map(async (chain) => {
    const result = await fetchContractABIMultiSource(contractAddress, chain, etherscanApiKey);
    return { chain, result };
  });

  const allResults = await Promise.allSettled(promises);
  
  for (const promiseResult of allResults) {
    if (promiseResult.status === 'fulfilled') {
      results.push(promiseResult.value);
    }
  }

  // Sort results - successful ones first, then by explorer preference
  return results.sort((a, b) => {
    if (a.result.success && !b.result.success) return -1;
    if (!a.result.success && b.result.success) return 1;
    return 0;
  });
};