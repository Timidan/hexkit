import axios from 'axios';
import { ethers } from 'ethers';
import type { Chain } from '../types';

// Enhanced contract information interface
export interface ContractInfoResult {
  success: boolean;
  address: string;
  chain: Chain;
  contractName?: string;
  abi?: string;
  source?: 'sourcify' | 'blockscout' | 'etherscan';
  verified?: boolean;
  tokenType?: 'ERC20' | 'ERC721' | 'ERC1155' | 'UNKNOWN';
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
  matchId?: string;
  creationMatch?: string;
  runtimeMatch?: string;
  verifiedAt?: string;
  match?: string;
  chainId?: string;
  address?: string;
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
        console.log(`🔍 Extracted ${externalFunctions.length} external functions`);
        
        // Detect token type
        const tokenType = detectTokenType(parsedABI);
        console.log(`🔍 Detected token type: ${tokenType}`);
        
        // If it's a token, fetch token info
        let tokenInfo;
        if (tokenType !== 'UNKNOWN') {
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
          tokenType,
          tokenInfo,
          searchProgress: [...searchProgress] // Copy to prevent reference issues
        };

        // If we don't have contract name yet but it's a token, use token name
        if (!finalResult.contractName && tokenInfo?.name) {
          finalResult.contractName = tokenInfo.name;
          console.log(`🔍 Using token name as contract name: ${tokenInfo.name}`);
        }

        // If we still don't have a contract name, try to extract from ABI
        if (!finalResult.contractName) {
          // Look for contract name in ABI
          const contractABI = parsedABI.find((item: any) => item.type === 'constructor');
          if (contractABI && contractABI.name) {
            finalResult.contractName = contractABI.name;
          } else {
            // Use a generic name based on token type
            finalResult.contractName = tokenType !== 'UNKNOWN' ? `${tokenType} Token` : 'Unknown Contract';
          }
        }

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
    
    // Step 1: Check if contract is verified
    const checkUrl = `https://sourcify.dev/server/v2/contract/${chainId}/${address}`;
    const response = await axios.get<SourcifyResponse>(checkUrl, {
      timeout: 10000,
      headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
    });

    if (response.data.creationMatch || response.data.runtimeMatch) {
      const matchType = response.data.creationMatch || response.data.runtimeMatch;
      console.log(`🔍 [Sourcify] Contract verified with match: ${matchType}`);
      
      // Try full_match first
      let metadataUrl = `https://repo.sourcify.dev/contracts/full_match/${chainId}/${address}/metadata.json`;
      let metadataResponse = await fetchWithFallback(metadataUrl);
      
      // If full_match fails, try partial_match
      if (!metadataResponse?.data?.output?.abi && matchType === 'exact_match') {
        console.log(`🔍 [Sourcify] Trying partial match...`);
        metadataUrl = `https://repo.sourcify.dev/contracts/partial_match/${chainId}/${address}/metadata.json`;
        metadataResponse = await fetchWithFallback(metadataUrl);
      }

      if (metadataResponse?.data?.output?.abi) {
        // Extract contract name from compilation target
        let contractName: string | undefined;
        const compilationTarget = metadataResponse.data.settings?.compilationTarget;
        if (compilationTarget) {
          const targetKeys = Object.keys(compilationTarget);
          if (targetKeys.length > 0) {
            contractName = compilationTarget[targetKeys[0]];
            console.log(`🔍 [Sourcify] Contract name from compilation target: ${contractName}`);
          }
        }

        // Also try to get name from contract name field if available
        if (!contractName && metadataResponse.data.name) {
          contractName = metadataResponse.data.name;
          console.log(`🔍 [Sourcify] Contract name from metadata: ${contractName}`);
        }

        return {
          success: true,
          contractName,
          abi: JSON.stringify(metadataResponse.data.output.abi),
          source: 'sourcify',
          verified: true
        };
      }
    }

    return { success: false, error: 'Contract not verified on Sourcify' };

  } catch (error: any) {
    if (error.response?.status === 404) {
      return { success: false, error: 'Contract not found on Sourcify' };
    }
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
    const abiEndpoints = [
      `${blockscoutExplorer.url}?module=contract&action=getabi&address=${address}`,
      `${blockscoutExplorer.url}/v2/smart-contracts/${address}`,
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
          `${blockscoutExplorer.url}?module=contract&action=getsourcecode&address=${address}`,
          `${blockscoutExplorer.url}/v2/smart-contracts/${address}`,
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
      axios.get(`${etherscanExplorer.url}?module=contract&action=getabi&address=${address}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Web3-Toolkit/1.0' }
      }),
      axios.get(`${etherscanExplorer.url}?module=contract&action=getsourcecode&address=${address}`, {
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
        const tokenResponse = await axios.get(`${etherscanExplorer.url}?module=token&action=tokeninfo&contractaddress=${address}`, {
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

// Detect token type from ABI
const detectTokenType = (abi: any[]): 'ERC20' | 'ERC721' | 'ERC1155' | 'UNKNOWN' => {
  const functions = abi
    .filter(item => item.type === 'function')
    .map(item => item.name);

  // ERC20 detection
  const erc20Functions = ['totalSupply', 'balanceOf', 'transfer', 'allowance', 'approve', 'transferFrom'];
  if (erc20Functions.every(func => functions.includes(func))) {
    return 'ERC20';
  }

  // ERC721 detection
  const erc721Functions = ['ownerOf', 'tokenURI', 'balanceOf', 'transferFrom', 'approve'];
  if (erc721Functions.every(func => functions.includes(func))) {
    return 'ERC721';
  }

  // ERC1155 detection
  const erc1155Functions = ['balanceOf', 'balanceOfBatch', 'setApprovalForAll', 'isApprovedForAll'];
  if (erc1155Functions.every(func => functions.includes(func))) {
    return 'ERC1155';
  }

  return 'UNKNOWN';
};

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
          const tokenResponse = await axios.get(`${explorer.url}?module=token&action=tokeninfo&contractaddress=${address}`, {
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
          const tokenResponse = await axios.get(`${explorer.url}?module=token&action=getToken&contractaddress=${address}`, {
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