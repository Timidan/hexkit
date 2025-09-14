import axios from 'axios';
import { ethers } from 'ethers';
import type { Chain } from '../types';

// CORS proxy for development
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';

// Enhanced contract information interface
export interface ContractInfoResult {
  success: boolean;
  address: string;
  chain: Chain;
  contractName?: string;
  abi?: string;
  source?: 'sourcify' | 'blockscout' | 'etherscan';
  explorerName?: string;
  verified?: boolean;
  // NOTE: tokenType is now determined exclusively by ERC165 supportsInterface() calls in the main component
  tokenInfo?: {
    name?: string;
    symbol?: string;
    decimals?: number;
    totalSupply?: string;
  };
  externalFunctions?: Array<{
    name: string;
    signature: string;
    inputs: Array<{ name: string; type: string }>;
    outputs: Array<{ name: string; type: string }>;
    stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
  }>;
  error?: string;
  searchProgress?: Array<{
    source: string;
    status: 'searching' | 'found' | 'not_found' | 'error';
    message?: string;
  }>;
}

// Sourcify API response interface
interface SourcifyResponse {
  match?: any; // Can be "match", "exact_match", or null
  creationMatch?: any;
  runtimeMatch?: any;
  verifiedAt?: string;
  chainId?: string;
  address?: string;
  abi?: any[];
  metadata?: {
    settings?: {
      compilationTarget?: Record<string, string>;
    };
    name?: string;
    compiler?: {
      version?: string;
    };
    language?: string;
    output?: {
      abi?: any[];
    };
  };
}

// Enhanced search function with comprehensive progress tracking
export const fetchContractInfoComprehensive = async (
  address: string,
  chain: Chain
): Promise<ContractInfoResult> => {
  const searchProgress: ContractInfoResult['searchProgress'] = [];
  let finalResult: ContractInfoResult = {
    success: false,
    address,
    chain,
    searchProgress: []
  };

  // Validate address
  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return {
      ...finalResult,
      success: false,
      error: 'Invalid contract address format'
    };
  }

  // Add progress tracking
  const addProgress = (source: string, status: 'searching' | 'found' | 'not_found' | 'error', message?: string) => {
    const progress = { source, status, message };
    searchProgress.push(progress);
    console.log(`🔍 [Progress] ${source}: ${status} - ${message || ''}`);
  };

  try {
    console.log(`🔍 Starting comprehensive search for ${address} on ${chain.name}`);
    
    // Priority 1: Sourcify
    addProgress('Sourcify', 'searching', 'Searching Sourcify for verified contract...');
    const sourcifyResult = await fetchFromSourcify(address, chain.id);
    
    if (sourcifyResult.success) {
      addProgress('Sourcify', 'found', `Found verified contract on Sourcify: ${sourcifyResult.contractName || 'Unknown'}`);
      finalResult = { ...finalResult, ...sourcifyResult };
    } else {
      addProgress('Sourcify', 'not_found', sourcifyResult.error || 'Contract not found on Sourcify');
    }

    // Priority 2: Blockscout (only if Sourcify failed)
    if (!finalResult.success) {
      console.log(`🔍 [DEBUG] Sourcify failed, trying Blockscout...`);
      addProgress('Blockscout', 'searching', 'Searching Blockscout for verified contract...');
      const blockscoutResult = await fetchFromBlockscout(address, chain);
      
      if (blockscoutResult.success) {
        addProgress('Blockscout', 'found', `Found verified contract on Blockscout: ${blockscoutResult.contractName || 'Unknown'}`);
        finalResult = { ...finalResult, ...blockscoutResult };
      } else {
        addProgress('Blockscout', 'not_found', blockscoutResult.error || 'Contract not found on Blockscout');
      }
    }

    // Priority 3: Etherscan (only if both Sourcify and Blockscout failed)
    if (!finalResult.success) {
      console.log(`🔍 [DEBUG] Both Sourcify and Blockscout failed, trying Etherscan...`);
      addProgress('Etherscan', 'searching', 'Searching Etherscan for verified contract...');
      const etherscanResult = await fetchFromEtherscan(address, chain);
      
      if (etherscanResult.success) {
        addProgress('Etherscan', 'found', `Found verified contract on Etherscan: ${etherscanResult.contractName || 'Unknown'}`);
        finalResult = { ...finalResult, ...etherscanResult };
      } else {
        addProgress('Etherscan', 'not_found', etherscanResult.error || 'Contract not found on Etherscan');
      }
    }

    // If we have ABI from any source, extract external functions and detect token type
    if (finalResult.success && finalResult.abi) {
      try {
        const parsedABI = JSON.parse(finalResult.abi);
        
        // Extract external functions
        const externalFunctions = extractExternalFunctions(parsedABI);
        console.log(`🔍 Extracted ${externalFunctions?.length || 0} external functions`);
        
        // NOTE: Token type detection should only be done via ERC165 supportsInterface() calls in the main component
        // This ABI-based detection is deprecated and removed
        
        // NOTE: Token type detection should only be done via ERC165 supportsInterface() calls in the main component
        // We'll fetch token info for any contract that might have token metadata functions
        let tokenInfo;
        if (true) { // Always attempt to fetch token info - ERC165 detection in main component will determine actual type
          addProgress('Token API', 'searching', 'Fetching token metadata...');
          tokenInfo = await fetchTokenInfo(address, parsedABI, chain);
          if (tokenInfo) {
            addProgress('Token API', 'found', `Token: ${tokenInfo.name} (${tokenInfo.symbol})`);
          } else {
            addProgress('Token API', 'not_found', 'Could not fetch token metadata');
          }
        }

        finalResult = {
          ...finalResult,
          externalFunctions,
          tokenInfo,
          searchProgress: [...searchProgress] // Copy to prevent reference issues
        };

        // Log the current state before any fallbacks
        console.log(`🔍 [DEBUG] Before fallbacks - Contract name: "${finalResult.contractName}", Token name: "${tokenInfo?.name}"`);
        
        // If we don't have contract name yet but it's a token, use token name
        if (!finalResult.contractName && tokenInfo?.name) {
          finalResult.contractName = tokenInfo.name;
          console.log(`🔍 [DEBUG] Using token name as contract name: "${tokenInfo.name}"`);
        }

        // If we still don't have a contract name, try to extract from ABI
        if (!finalResult.contractName) {
          console.log(`🔍 [DEBUG] No contract name found, trying ABI extraction...`);
          // Look for contract name in ABI
          const contractABI = parsedABI.find((item: any) => item.type === 'constructor');
          if (contractABI && contractABI.name) {
            finalResult.contractName = contractABI.name;
            console.log(`🔍 [DEBUG] Using constructor name: "${contractABI.name}"`);
          } else {
            // Use a generic name - token type will be determined by ERC165 detection in main component
            const genericName = 'Smart Contract';
            finalResult.contractName = genericName;
            console.log(`🔍 [DEBUG] Using generic name: "${genericName}"`);
          }
        }
        
        // Final state logging
        console.log(`🔍 [DEBUG] Final contract name: "${finalResult.contractName}"`);

      } catch (parseError) {
        console.error('Error parsing ABI:', parseError);
        finalResult.error = `Failed to parse ABI: ${parseError}`;
      }
    }

    console.log(`🔍 Search completed. Success: ${finalResult.success}`);
    return finalResult;

  } catch (error) {
    console.error('Comprehensive contract info fetch error:', error);
    return {
      ...finalResult,
      success: false,
      error: `Network error: ${error}`,
      searchProgress: [...searchProgress]
    };
  }
};

// Fetch from Sourcify with enhanced contract name extraction
const fetchFromSourcify = async (address: string, chainId: number): Promise<Partial<ContractInfoResult>> => {
  try {
    console.log(`🔍 [Sourcify] Fetching contract: ${address} on chain ${chainId}`);
    
    // Step 1: Check if contract is verified and fetch ABI/metadata in one call
    const checkUrl = `/api/sourcify/server/v2/contract/${chainId}/${address}?fields=abi,metadata`;
    const response = await axios.get<SourcifyResponse>(checkUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
    });

    // Check if contract is verified (has match, creationMatch, or runtimeMatch)
    console.log(`🔍 [Sourcify] Response status: ${response.status}`);
    console.log(`🔍 [Sourcify] Response data:`, {
      match: !!response.data.match,
      creationMatch: !!response.data.creationMatch,
      runtimeMatch: !!response.data.runtimeMatch,
      hasAbi: !!(response.data.abi && Array.isArray(response.data.abi)),
      abiLength: response.data.abi?.length || 0
    });
    
    // Handle 304 Not Modified responses - they should have the data
    const hasValidData = response.data.match || response.data.creationMatch || response.data.runtimeMatch || 
                         (response.status === 304 && response.data.abi && Array.isArray(response.data.abi));
    
    if (hasValidData) {
      console.log(`🔍 [Sourcify] Contract verified on Sourcify`);
      
      // Extract ABI from response if available
      let abi = null;
      if (response.data.abi && Array.isArray(response.data.abi)) {
        abi = JSON.stringify(response.data.abi);
        console.log(`🔍 [Sourcify] ABI found in response, ${response.data.abi.length} functions`);
      }

      // Extract metadata if available
      let contractName: string | undefined;
      if (response.data.metadata) {
        const metadata = response.data.metadata;
        
        // Extract contract name from compilation target
        const compilationTarget = metadata.settings?.compilationTarget;
        if (compilationTarget) {
          const targetKeys = Object.keys(compilationTarget);
          if (targetKeys.length > 0) {
            contractName = compilationTarget[targetKeys[0]];
            console.log(`🔍 [Sourcify] Contract name from compilation target: ${contractName}`);
          }
        }

        // Try to get name from contract name field if available
        if (!contractName && metadata.name) {
          contractName = metadata.name;
          console.log(`🔍 [Sourcify] Contract name from metadata: ${contractName}`);
        }

        // Additional fallback: try to extract from contract name in settings
        if (!contractName && metadata.settings) {
          const settings = metadata.settings;
          if (settings.compilationTarget) {
            const filenames = Object.keys(settings.compilationTarget);
            if (filenames.length > 0) {
              const filename = filenames[0];
              // Extract contract name from filename if it ends with .sol
              if (filename.endsWith('.sol')) {
                const nameParts = filename.split('/');
                const lastPart = nameParts[nameParts.length - 1];
                if (lastPart.endsWith('.sol')) {
                  contractName = lastPart.slice(0, -4);
                  console.log(`🔍 [Sourcify] Contract name from filename: ${contractName}`);
                }
              }
            }
          }
        }
      }

      if (abi) {
        return {
          success: true,
          contractName,
          abi,
          source: 'sourcify',
          explorerName: 'Sourcify',
          verified: true
        };
      } else {
        console.log(`🔍 [Sourcify] No ABI found in response`);
      }
    } else {
      console.log(`🔍 [Sourcify] Contract not verified - no matches found`);
      console.log(`🔍 [Sourcify] Full response data:`, JSON.stringify(response.data, null, 2));
    }

    return { success: false, error: 'Contract not verified on Sourcify' };

  } catch (error: any) {
    if (error.response?.status === 404) {
      return { success: false, error: 'Contract not found on Sourcify' };
    }
    console.error(`🔍 [Sourcify] Error:`, error);
    return { success: false, error: `Sourcify error: ${error.message}` };
  }
};

// Helper function to fetch with better error handling
const fetchWithFallback = async (url: string) => {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
    });
    return response;
  } catch (error) {
    console.warn(`Failed to fetch ${url}:`, error);
    return null;
  }
};

// Fetch from Blockscout with enhanced contract name extraction
const fetchFromBlockscout = async (address: string, chain: Chain): Promise<Partial<ContractInfoResult>> => {
  try {
    console.log(`🔍 [Blockscout] Fetching contract: ${address} on ${chain.name}`);
    
    const blockscoutExplorer = chain.explorers?.find(e => e.type === 'blockscout');
    if (!blockscoutExplorer) {
      return { success: false, error: 'No Blockscout API available for this network' };
    }

    // Try multiple Blockscout endpoints for ABI
    const blockscoutProxy = chain.id === 137 ? '/api/polygon-blockscout' : 
                           chain.id === 42161 ? '/api/arbitrum-blockscout' : 
                           '/api/blockscout';
    
    const abiEndpoints = [
      `${blockscoutProxy}?module=contract&action=getabi&address=${address}`,
      `${blockscoutProxy}/v2/smart-contracts/${address}`,
    ];

    let abiResult: { abi: string; contractName?: string } | null = null;

    for (const endpoint of abiEndpoints) {
      try {
        console.log(`🔍 [Blockscout] Trying ABI endpoint: ${endpoint}`);
        const response = await axios.get(endpoint, {
          timeout: 10000,
          headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
        });

        // Handle Etherscan-style response
        if (response.data.status === '1' && response.data.result) {
          abiResult = { abi: response.data.result };
          break;
        }

        // Handle Blockscout v2 API response
        if (response.data.abi && Array.isArray(response.data.abi)) {
          abiResult = { 
            abi: JSON.stringify(response.data.abi),
            contractName: response.data.name || response.data.contract_name
          };
          break;
        }

      } catch (endpointError) {
        console.warn(`🔍 [Blockscout] Endpoint failed: ${endpoint}`);
        continue;
      }
    }

    if (!abiResult) {
      return { success: false, error: 'Contract not found on Blockscout' };
    }

    // If we have ABI but no contract name, try to fetch it separately
    if (!abiResult.contractName) {
      try {
        console.log(`🔍 [Blockscout] Fetching contract name separately...`);
        const nameEndpoints = [
          `${blockscoutProxy}?module=contract&action=getsourcecode&address=${address}`,
          `${blockscoutProxy}/v2/smart-contracts/${address}`,
        ];

        for (const nameEndpoint of nameEndpoints) {
          try {
            const nameResponse = await axios.get(nameEndpoint, {
              timeout: 10000,
              headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
            });

            // Handle Etherscan-style response
            if (nameResponse.data.status === '1' && nameResponse.data.result?.[0]) {
              abiResult.contractName = nameResponse.data.result[0].ContractName;
              console.log(`🔍 [Blockscout] Contract name from source code: ${abiResult.contractName}`);
              break;
            }

            // Handle Blockscout v2 API response
            if (nameResponse.data.name || nameResponse.data.contract_name) {
              abiResult.contractName = nameResponse.data.name || nameResponse.data.contract_name;
              console.log(`🔍 [Blockscout] Contract name from v2 API: ${abiResult.contractName}`);
              break;
            }
          } catch (nameError) {
            continue;
          }
        }
      } catch (error) {
        console.warn('Could not fetch contract name from Blockscout');
      }
    }

    return {
      success: true,
      contractName: abiResult.contractName,
      abi: abiResult.abi,
      source: 'blockscout',
      explorerName: blockscoutExplorer.name,
      verified: true
    };

  } catch (error: any) {
    return { success: false, error: `Blockscout error: ${error.message}` };
  }
};

// Fetch from Etherscan with enhanced contract name extraction
const fetchFromEtherscan = async (address: string, chain: Chain): Promise<Partial<ContractInfoResult>> => {
  try {
    console.log(`🔍 [Etherscan] Fetching contract: ${address} on ${chain.name}`);
    
    const etherscanExplorer = chain.explorers?.find(e => e.type === 'etherscan');
    if (!etherscanExplorer) {
      return { success: false, error: 'No Etherscan API available for this network' };
    }

    // Fetch ABI and contract name in parallel
    const [abiResponse, nameResponse] = await Promise.allSettled([
      axios.get(`/api/${etherscanExplorer.type === 'etherscan' && chain.id === 8453 ? 'basescan' : etherscanExplorer.type === 'etherscan' && chain.id === 1 ? 'etherscan' : etherscanExplorer.type === 'etherscan' && chain.id === 137 ? 'polygonscan' : etherscanExplorer.type}?module=contract&action=getabi&address=${address}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
      }),
      axios.get(`/api/${etherscanExplorer.type === 'etherscan' && chain.id === 8453 ? 'basescan' : etherscanExplorer.type === 'etherscan' && chain.id === 1 ? 'etherscan' : etherscanExplorer.type === 'etherscan' && chain.id === 137 ? 'polygonscan' : etherscanExplorer.type}?module=contract&action=getsourcecode&address=${address}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
      })
    ]);

    // Check ABI response
    if (abiResponse.status === 'fulfilled' && abiResponse.value.data.status === '1') {
      const abi = abiResponse.value.data.result;
      let contractName: string | undefined;

      // Extract contract name from source code response
      if (nameResponse.status === 'fulfilled' && nameResponse.value.data.status === '1') {
        const sourceResult = nameResponse.value.data.result?.[0];
        if (sourceResult?.ContractName) {
          contractName = sourceResult.ContractName;
          console.log(`🔍 [Etherscan] Contract name: ${contractName}`);
        }
      }

      // Also try to get token info if available
      let tokenInfo: ContractInfoResult['tokenInfo'] | undefined;
      try {
        const tokenResponse = await axios.get(`/api/${etherscanExplorer.type === 'etherscan' && chain.id === 8453 ? 'basescan' : etherscanExplorer.type === 'etherscan' && chain.id === 1 ? 'etherscan' : etherscanExplorer.type === 'etherscan' && chain.id === 137 ? 'polygonscan' : etherscanExplorer.type}?module=token&action=tokeninfo&contractaddress=${address}`, {
          timeout: 10000,
          headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
        });
        
        if (tokenResponse.data.status === '1' && tokenResponse.data.result) {
          const tokenData = tokenResponse.data.result;
          tokenInfo = {
            name: tokenData.tokenName,
            symbol: tokenData.symbol,
            decimals: parseInt(tokenData.divisor || '18'),
            totalSupply: tokenData.totalSupply
          };
          console.log(`🔍 [Etherscan] Token info: ${tokenInfo.name} (${tokenInfo.symbol})`);
        }
      } catch (tokenError) {
        console.log('Could not fetch token info from Etherscan');
      }

      return {
        success: true,
        contractName,
        abi,
        source: 'etherscan',
        explorerName: etherscanExplorer.name,
        verified: true,
        tokenInfo
      };
    }

    return { success: false, error: 'Contract not found on Etherscan' };

  } catch (error: any) {
    return { success: false, error: `Etherscan error: ${error.message}` };
  }
};

// Extract external functions from ABI
const extractExternalFunctions = (abi: any[]): ContractInfoResult['externalFunctions'] => {
  if (!abi || !Array.isArray(abi)) return [];
  
  return abi
    .filter(item => item.type === 'function' && (item.stateMutability === 'view' || item.stateMutability === 'pure' || item.stateMutability === 'nonpayable' || item.stateMutability === 'payable'))
    .map(func => ({
      name: func.name,
      signature: `${func.name}(${func.inputs?.map((input: any) => input.type).join(',') || ''})`,
      inputs: func.inputs?.map((input: any) => ({ name: input.name || '', type: input.type })) || [],
      outputs: func.outputs?.map((output: any) => ({ name: output.name || '', type: output.type })) || [],
      stateMutability: func.stateMutability
    }));
};

// NOTE: Token type detection should only be done via ERC165 supportsInterface() calls
// This ABI-based function is deprecated and should not be used
// ERC165 interface detection is handled in the main component with proper contract calls

// Fetch token information using ABI with multiple fallback strategies
const fetchTokenInfo = async (
  address: string,
  abi: any[],
  chain: Chain
): Promise<ContractInfoResult['tokenInfo']> => {
  console.log(`🔍 [Token] Fetching token info for ${address}`);
  
  try {
    // Use working RPC endpoints for different networks
    let rpcUrl = chain.rpcUrl;
    if (chain.id === 1) {
      rpcUrl = "https://eth.llamarpc.com";
    } else if (chain.id === 8453) {
      rpcUrl = "https://mainnet.base.org";
    } else if (chain.id === 137) {
      rpcUrl = "https://polygon-rpc.com/";
    }

    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(address, abi, provider);

    // Try to fetch token info based on detected type
    const functions = abi.filter(item => item.type === 'function').map(item => item.name);

    // Strategy 1: Direct contract calls (most reliable)
    if (functions.includes('name') && functions.includes('symbol')) {
      console.log(`🔍 [Token] Using direct contract calls...`);
      
      const calls = [];
      if (functions.includes('name')) calls.push(contract.name());
      if (functions.includes('symbol')) calls.push(contract.symbol());
      if (functions.includes('decimals')) calls.push(contract.decimals());
      if (functions.includes('totalSupply')) calls.push(contract.totalSupply());

      const results = await Promise.allSettled(calls);
      
      const tokenInfo: ContractInfoResult['tokenInfo'] = {
        name: results[0]?.status === 'fulfilled' ? results[0].value : undefined,
        symbol: results[1]?.status === 'fulfilled' ? results[1].value : undefined,
        decimals: results[2]?.status === 'fulfilled' ? Number(results[2].value) : undefined,
        totalSupply: results[3]?.status === 'fulfilled' ? results[3].value?.toString() : undefined
      };

      console.log(`🔍 [Token] Direct call results:`, tokenInfo);
      
      // If we got at least name and symbol, return it
      if (tokenInfo.name && tokenInfo.symbol) {
        return tokenInfo;
      }
    }

    // Strategy 2: Try static call (some tokens require this)
    console.log(`🔍 [Token] Trying static calls...`);
    try {
      const name = await contract.callStatic.name().catch(() => undefined);
      const symbol = await contract.callStatic.symbol().catch(() => undefined);
      const decimals = await contract.callStatic.decimals().catch(() => undefined);
      
      if (name && symbol) {
        console.log(`🔍 [Token] Static call successful: ${name} (${symbol})`);
        return { name, symbol, decimals: Number(decimals) || 18 };
      }
    } catch (staticError) {
      console.log(`🔍 [Token] Static call failed:`, staticError);
    }

    // Strategy 3: Try to get from explorer APIs as fallback
    console.log(`🔍 [Token] Trying explorer APIs as fallback...`);
    for (const explorer of chain.explorers || []) {
      try {
        if (explorer.type === 'etherscan') {
          const tokenResponse = await axios.get(`/api/${chain.id === 8453 ? 'basescan' : chain.id === 1 ? 'etherscan' : chain.id === 137 ? 'polygonscan' : explorer.type}?module=token&action=tokeninfo&contractaddress=${address}`, {
            timeout: 5000,
            headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
          });
          
          if (tokenResponse.data.status === '1' && tokenResponse.data.result) {
            const tokenData = tokenResponse.data.result;
            const tokenInfo = {
              name: tokenData.tokenName,
              symbol: tokenData.symbol,
              decimals: parseInt(tokenData.divisor || '18'),
              totalSupply: tokenData.totalSupply
            };
            console.log(`🔍 [Token] Got from ${explorer.name}: ${tokenInfo.name} (${tokenInfo.symbol})`);
            return tokenInfo;
          }
        } else if (explorer.type === 'blockscout') {
          const blockscoutProxy = chain.id === 137 ? '/api/polygon-blockscout' : 
                                 chain.id === 42161 ? '/api/arbitrum-blockscout' : 
                                 '/api/blockscout';
          const tokenResponse = await axios.get(`${blockscoutProxy}?module=token&action=getToken&contractaddress=${address}`, {
            timeout: 5000,
            headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
          });
          
          if (tokenResponse.data.result) {
            const tokenData = tokenResponse.data.result;
            const tokenInfo = {
              name: tokenData.name,
              symbol: tokenData.symbol,
              decimals: parseInt(tokenData.decimals || '18'),
              totalSupply: tokenData.totalSupply
            };
            console.log(`🔍 [Token] Got from ${explorer.name}: ${tokenInfo.name} (${tokenInfo.symbol})`);
            return tokenInfo;
          }
        }
      } catch (explorerError) {
        console.warn(`🔍 [Token] Explorer ${explorer.name} failed:`, explorerError);
      }
    }

    console.log(`🔍 [Token] Could not fetch token info for ${address}`);
    return undefined;

  } catch (error) {
    console.error('Error fetching token info:', error);
    return undefined;
  }
};