import { ethers } from 'ethers';
import axios from 'axios';
import type { Chain } from '../types';

// Diamond Standard (EIP-2535) interfaces and utilities
// Reference: https://eips.ethereum.org/EIPS/eip-2535

export interface DiamondFacet {
  facetAddress: string;
  functionSelectors: string[];
  facetName?: string;
  verified?: boolean;
}

export interface DiamondInfo {
  isDiamond: boolean;
  facets: DiamondFacet[];
  totalFunctions: number;
  loupeSupport: {
    facets: boolean;
    facetFunctionSelectors: boolean;
    facetAddresses: boolean;
    facetAddress: boolean;
    supportsInterface: boolean;
  };
}

// Diamond Loupe function signatures (EIP-2535 standard)
const DIAMOND_LOUPE_SIGNATURES = {
  facets: '0x7a0ed627', // facets() returns (Facet[] memory facets_)
  facetFunctionSelectors: '0xadfca15e', // facetFunctionSelectors(address _facet) returns (bytes4[] memory _functionSelectors)
  facetAddresses: '0x52ef6b2c', // facetAddresses() returns (address[] memory facetAddresses_)
  facetAddress: '0xcdffacc6', // facetAddress(bytes4 _functionSelector) returns (address facetAddress_)
  supportsInterface: '0x01ffc9a7' // supportsInterface(bytes4 interfaceId) returns (bool)
};

// EIP-2535 Diamond interface ID
const DIAMOND_INTERFACE_ID = '0x48e2b093';

// Sourcify Diamond Response interface
interface SourcifyDiamondFacet {
  name: string;
  address: string;
  functions: Array<{
    name: string;
    selector: string;
    signature: string;
  }>;
}

interface SourcifyDiamondInfo {
  contractName: string;
  contractAddress: string;
  chainId: number;
  facets: SourcifyDiamondFacet[];
  totalFunctions: number;
  isVerified: boolean;
}

/**
 * Detects if a contract implements the Diamond Standard (EIP-2535)
 */
export async function detectDiamondContract(
  contractAddress: string,
  provider: ethers.providers.Provider
): Promise<DiamondInfo> {
  console.log(`[DiamondStandard] Checking if ${contractAddress} is a Diamond contract...`);
  console.log(`[DiamondStandard] Provider network:`, await provider.getNetwork().catch(() => 'unknown'));
  
  const result: DiamondInfo = {
    isDiamond: false,
    facets: [],
    totalFunctions: 0,
    loupeSupport: {
      facets: false,
      facetFunctionSelectors: false,
      facetAddresses: false,
      facetAddress: false,
      supportsInterface: false
    }
  };

  try {
    // Check if contract exists
    const code = await provider.getCode(contractAddress);
    console.log(`[DiamondStandard] Contract code length: ${code.length} characters`);
    if (code === '0x') {
      console.log('[DiamondStandard] No contract found at address');
      return result;
    }
    console.log('[DiamondStandard] Contract found at address');

    // Create contract instance for checking loupe functions
    const contract = new ethers.Contract(contractAddress, [
      'function facets() external view returns (tuple(address facetAddress, bytes4[] functionSelectors)[] memory facets_)',
      'function facetFunctionSelectors(address _facet) external view returns (bytes4[] memory functionSelectors_)',
      'function facetAddresses() external view returns (address[] memory facetAddresses_)',
      'function facetAddress(bytes4 _functionSelector) external view returns (address facetAddress_)',
      'function supportsInterface(bytes4 interfaceId) external view returns (bool)'
    ], provider);

    // Test each loupe function
    console.log('[DiamondStandard] Testing Diamond Loupe functions...');
    const loupeTests = await Promise.allSettled([
      // Test facets() function
      contract.facets().then(() => {
        console.log('[DiamondStandard] facets() function works');
        return true;
      }).catch((err: unknown) => {
        console.log('[DiamondStandard] facets() function failed:', (err instanceof Error ? err.message : String(err)));
        return false;
      }),
      
      // Test facetFunctionSelectors() function
      contract.facetFunctionSelectors(contractAddress).then(() => {
        console.log('[DiamondStandard] facetFunctionSelectors() function works');
        return true;
      }).catch((err: unknown) => {
        console.log('[DiamondStandard] facetFunctionSelectors() function failed:', (err instanceof Error ? err.message : String(err)));
        return false;
      }),
      
      // Test facetAddresses() function  
      contract.facetAddresses().then(() => {
        console.log('[DiamondStandard] facetAddresses() function works');
        return true;
      }).catch((err: unknown) => {
        console.log('[DiamondStandard] facetAddresses() function failed:', (err instanceof Error ? err.message : String(err)));
        return false;
      }),
      
      // Test facetAddress() function with a common selector (e.g., facets())
      contract.facetAddress(DIAMOND_LOUPE_SIGNATURES.facets).then(() => {
        console.log('[DiamondStandard] facetAddress() function works');
        return true;
      }).catch((err: unknown) => {
        console.log('[DiamondStandard] facetAddress() function failed:', (err instanceof Error ? err.message : String(err)));
        return false;
      }),
      
      // Test supportsInterface() function
      contract.supportsInterface('0x01ffc9a7').then(() => {
        console.log('[DiamondStandard] supportsInterface() function works');
        return true;
      }).catch((err: unknown) => {
        console.log('[DiamondStandard] supportsInterface() function failed:', (err instanceof Error ? err.message : String(err)));
        return false;
      })
    ]);

    // Extract results
    result.loupeSupport.facets = loupeTests[0].status === 'fulfilled' ? loupeTests[0].value : false;
    result.loupeSupport.facetFunctionSelectors = loupeTests[1].status === 'fulfilled' ? loupeTests[1].value : false;
    result.loupeSupport.facetAddresses = loupeTests[2].status === 'fulfilled' ? loupeTests[2].value : false;
    result.loupeSupport.facetAddress = loupeTests[3].status === 'fulfilled' ? loupeTests[3].value : false;
    result.loupeSupport.supportsInterface = loupeTests[4].status === 'fulfilled' ? loupeTests[4].value : false;
    
    console.log('[DiamondStandard] Loupe function test results:', result.loupeSupport);

    // Check if this contract supports the Diamond interface
    let supportsDiamondInterface = false;
    if (result.loupeSupport.supportsInterface) {
      try {
        supportsDiamondInterface = await contract.supportsInterface(DIAMOND_INTERFACE_ID);
      } catch (error) {
        console.log('Could not check Diamond interface support');
      }
    }

    // Determine if this is a Diamond contract
    // A Diamond should support at least the core loupe functions
    const minimalDiamondSupport = result.loupeSupport.facets || 
                                 (result.loupeSupport.facetAddresses && result.loupeSupport.facetAddress);

    console.log('[DiamondStandard] Diamond determination:');
    console.log('  - Minimal diamond support:', minimalDiamondSupport);
    console.log('  - Supports diamond interface:', supportsDiamondInterface);
    console.log('  - Final decision:', minimalDiamondSupport || supportsDiamondInterface);

    if (minimalDiamondSupport || supportsDiamondInterface) {
      result.isDiamond = true;
      console.log('[DiamondStandard] Diamond contract detected!');
      
      // If it's a Diamond, try to fetch the facets
      if (result.loupeSupport.facets) {
        try {
          const facetsData = await contract.facets();
          result.facets = facetsData.map((facet: any) => ({
            facetAddress: facet.facetAddress || facet[0],
            functionSelectors: facet.functionSelectors || facet[1] || []
          }));
          
          result.totalFunctions = result.facets.reduce((total, facet) => 
            total + (facet.functionSelectors?.length || 0), 0
          );
          
          console.log(`[DiamondStandard] Found ${result.facets.length} facets with ${result.totalFunctions} total functions`);
        } catch (error) {
          console.log('Could not fetch facet details:', error);
        }
      }
    } else {
      console.log('[DiamondStandard] Regular contract (not Diamond Standard)');
    }

    return result;

  } catch (error) {
    console.error('Error detecting Diamond contract:', error);
    return result;
  }
}

/**
 * Gets detailed facet information including names if available
 */
export async function getDetailedFacetInfo(
  diamondAddress: string,
  facets: DiamondFacet[],
  provider: ethers.providers.Provider
): Promise<DiamondFacet[]> {
  
  console.log('[DiamondStandard] Getting detailed facet information...');
  
  return await Promise.all(
    facets.map(async (facet, index) => {
      try {
        console.log(`[DiamondStandard] Analyzing facet ${index + 1} at ${facet.facetAddress}...`);
        
        let facetName = '';
        let isVerified = false;
        
        // Method 1: Try to get facet name from BaseScan (for Base network)
        try {
          const network = await provider.getNetwork();
          
          if (network.chainId === 8453) { // Base network
            console.log(`  [DiamondStandard] Fetching facet info from BaseScan...`);
            
            // Direct BaseScan API call for contract details
            const basescanApiUrl = 'https://api.basescan.org/api';
            const response = await fetch(
              `${basescanApiUrl}?module=contract&action=getsourcecode&address=${facet.facetAddress}&apikey=YourApiKeyToken`
            );
            
            if (response.ok) {
              const data = await response.json();
              if (data.status === '1' && data.result && data.result[0]) {
                const contractInfo = data.result[0];
                if (contractInfo.ContractName) {
                  facetName = contractInfo.ContractName;
                  isVerified = true;
                  console.log(`  [DiamondStandard] Found verified facet name from BaseScan: ${facetName}`);
                } else if (contractInfo.SourceCode) {
                  // Contract is verified but no specific name, try to extract from source
                  const sourceMatch = contractInfo.SourceCode.match(/contract\s+(\w+)/);
                  if (sourceMatch) {
                    facetName = sourceMatch[1];
                    isVerified = true;
                    console.log(`  [DiamondStandard] Extracted facet name from BaseScan source: ${facetName}`);
                  }
                }
              } else {
                console.log(`  [DiamondStandard] Facet not verified on BaseScan`);
              }
            }
          } else {
            // For non-Base networks, try our existing multi-source fetcher
            const { fetchContractABIMultiSource } = await import('./multiSourceAbiFetcher');
            const { SUPPORTED_CHAINS } = await import('./chains');
            const currentChain = SUPPORTED_CHAINS.find(c => c.id === network.chainId);
            
            if (currentChain) {
              console.log(`  [DiamondStandard] Fetching facet info from ${currentChain.name} block explorer...`);
              const facetAbiResult = await fetchContractABIMultiSource(facet.facetAddress, currentChain);
              
              if (facetAbiResult.success && facetAbiResult.contractName) {
                facetName = facetAbiResult.contractName;
                isVerified = true;
                console.log(`  [DiamondStandard] Found verified facet name from explorer: ${facetName}`);
              }
            }
          }
        } catch (explorerError) {
          console.log(`  [DiamondStandard] Block explorer lookup failed:`, explorerError);
        }
        
        // Method 2: Try to get contract name/symbol from the contract itself (fallback)
        if (!facetName) {
          try {
            const facetContract = new ethers.Contract(facet.facetAddress, [
              'function name() external view returns (string)',
              'function symbol() external view returns (string)'
            ], provider);
            
            try {
              const name = await facetContract.name();
              if (name) {
                facetName = name;
                console.log(`  [DiamondStandard] Found facet name from contract: ${name}`);
              }
            } catch {
              try {
                const symbol = await facetContract.symbol();
                if (symbol) {
                  facetName = symbol;
                  console.log(`  [DiamondStandard] Found facet symbol from contract: ${symbol}`);
                }
              } catch {
                // No name/symbol found
              }
            }
          } catch (contractError) {
            console.log(`  [DiamondStandard] Contract name/symbol lookup failed:`, contractError);
          }
        }
        
        // Method 3: Create intelligent name based on function patterns (last resort)
        if (!facetName) {
          // Analyze function selectors to infer facet type
          const selectorCount = facet.functionSelectors.length;
          const shortAddress = facet.facetAddress.slice(2, 8);
          
          // Common Diamond patterns based on function count and known selectors
          if (facet.functionSelectors.some(sel => ['0x1f931c1c', '0xcdffacc6', '0x52ef6b2c', '0x7a0ed627'].includes(sel))) {
            facetName = 'DiamondLoupeFacet';
          } else if (facet.functionSelectors.some(sel => sel === '0x1f931c1c')) {
            facetName = 'DiamondCutFacet';
          } else if (selectorCount >= 20) {
            facetName = `MainFacet_${shortAddress}`;
          } else if (selectorCount >= 10) {
            facetName = `UtilityFacet_${shortAddress}`;
          } else {
            facetName = `Facet_${shortAddress}`;
          }
          
          console.log(`  [DiamondStandard] Inferred facet name from patterns: ${facetName}`);
        }

        return {
          ...facet,
          facetName: facetName || `Facet_${index + 1}`,
          verified: isVerified
        };
      } catch (error) {
        console.log(`[DiamondStandard] Error getting details for facet ${facet.facetAddress}:`, error);
        return {
          ...facet,
          facetName: `Facet_${index + 1}`,
          verified: false
        };
      }
    })
  );
}

/**
 * Builds a comprehensive ABI from all Diamond facets
 */
export async function buildDiamondABI(
  diamondAddress: string,
  facets: DiamondFacet[],
  provider: ethers.providers.Provider,
  etherscanApiKey?: string
): Promise<string> {
  
  console.log('[DiamondStandard] Building comprehensive Diamond ABI...');
  
  const { fetchContractABIMultiSource } = await import('./multiSourceAbiFetcher');
  const { SUPPORTED_CHAINS } = await import('./chains');
  
  // Find the chain for this diamond (assume first chain for now, could be enhanced)
  const chain = SUPPORTED_CHAINS[0]; // This should be determined properly
  
  const allAbiFunctions: any[] = [];
  
  // Try to fetch ABI for each unique facet address
  const uniqueFacetAddresses = [...new Set(facets.map(f => f.facetAddress))];
  
  for (const facetAddress of uniqueFacetAddresses) {
    try {
      console.log(`Fetching ABI for facet: ${facetAddress}`);
      const facetAbiResult = await fetchContractABIMultiSource(facetAddress, chain, etherscanApiKey);
      
      if (facetAbiResult.success && facetAbiResult.abi) {
        const facetAbi = JSON.parse(facetAbiResult.abi);
        
        // Filter only functions that belong to this facet (based on function selectors)
        const facet = facets.find(f => f.facetAddress === facetAddress);
        if (facet && facet.functionSelectors) {
          const facetFunctions = facetAbi.filter((item: any) => {
            if (item.type === 'function') {
              // Calculate function selector for this function
              const signature = `${item.name}(${item.inputs.map((input: any) => input.type).join(',')})`;
              const selector = ethers.utils.id(signature).slice(0, 10);
              return facet.functionSelectors.includes(selector);
            }
            return false;
          });
          
          allAbiFunctions.push(...facetFunctions);
        } else {
          // If no function selectors available, include all functions
          allAbiFunctions.push(...facetAbi.filter((item: any) => item.type === 'function'));
        }
      }
    } catch (error) {
      console.log(`Could not fetch ABI for facet ${facetAddress}:`, error);
    }
  }
  
  // Add Diamond Loupe functions to the ABI
  const loupeFunctions = [
    {
      "type": "function",
      "name": "facets",
      "inputs": [],
      "outputs": [{"type": "tuple[]", "name": "facets_", "components": [{"type": "address", "name": "facetAddress"}, {"type": "bytes4[]", "name": "functionSelectors"}]}],
      "stateMutability": "view"
    },
    {
      "type": "function", 
      "name": "facetFunctionSelectors",
      "inputs": [{"type": "address", "name": "_facet"}],
      "outputs": [{"type": "bytes4[]", "name": "functionSelectors_"}],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "facetAddresses", 
      "inputs": [],
      "outputs": [{"type": "address[]", "name": "facetAddresses_"}],
      "stateMutability": "view"
    },
    {
      "type": "function",
      "name": "facetAddress",
      "inputs": [{"type": "bytes4", "name": "_functionSelector"}],
      "outputs": [{"type": "address", "name": "facetAddress_"}],
      "stateMutability": "view"
    }
  ];
  
  allAbiFunctions.push(...loupeFunctions);
  
  // Remove duplicate functions (same name and inputs)
  const uniqueFunctions = allAbiFunctions.filter((func, index, self) => {
    if (func.type !== 'function') return true;
    return index === self.findIndex(f => 
      f.type === 'function' && 
      f.name === func.name && 
      JSON.stringify(f.inputs) === JSON.stringify(func.inputs)
    );
  });
  
  console.log(`[DiamondStandard] Built Diamond ABI with ${uniqueFunctions.length} total functions`);
  
  return JSON.stringify(uniqueFunctions);
}

/**
 * Fetches comprehensive diamond information from Sourcify using API v2
 */
export async function fetchDiamondFromSourcify(
  contractAddress: string,
  chainId: number
): Promise<SourcifyDiamondInfo | null> {
  try {
    console.log(`[DiamondStandard] Fetching complete diamond info from Sourcify API: ${contractAddress} on chain ${chainId}`);
    
    // Use Sourcify API v2 to get complete contract data including proxy resolution
    const apiUrl = `https://sourcify.dev/server/v2/contract/${chainId}/${contractAddress}?fields=proxyResolution,abi,compilation`;
    
    const response = await axios.get(apiUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Web3-Toolkit/1.0',
        'Accept': 'application/json',
      },
    });

    if (!response.data) {
      console.log('[DiamondStandard] No data received from Sourcify API');
      return null;
    }

    const data = response.data;
    
    // Check if this is a Diamond proxy
    const isProxy = data.proxyResolution?.isProxy;
    const proxyType = data.proxyResolution?.proxyType;
    const isDiamond = isProxy && proxyType === 'DiamondProxy';
    
    if (!isDiamond) {
      console.log('[DiamondStandard] Contract is not identified as a Diamond proxy on Sourcify');
      return null;
    }

    console.log('[DiamondStandard] Diamond proxy detected on Sourcify!');

    // Extract implementation facets from proxy resolution
    const implementations = data.proxyResolution.implementations || [];
    console.log(`[DiamondStandard] Found ${implementations.length} implementation facets`);

    // Convert implementations to our facet format
    const sourcifyFacets: SourcifyDiamondFacet[] = implementations.map((impl: any, index: number) => {
      const facetName = impl.name || `Facet_${index + 1}`;
      const facetAddress = impl.address;
      
      return {
        name: facetName,
        address: facetAddress,
        functions: [] // Will be populated when we fetch individual facet ABIs
      };
    });

    // Extract contract name from compilation info
    let contractName = 'Diamond';
    if (data.compilation?.target) {
      const targetParts = data.compilation.target.split(':');
      contractName = targetParts[targetParts.length - 1] || 'Diamond';
    }

    const diamondInfo: SourcifyDiamondInfo = {
      contractName,
      contractAddress,
      chainId,
      facets: sourcifyFacets,
      totalFunctions: 0, // Will be calculated after fetching facet functions
      isVerified: true
    };

    console.log(`[DiamondStandard] Successfully parsed diamond with ${sourcifyFacets.length} facets from Sourcify`);
    console.log(`[DiamondStandard] Facets: ${sourcifyFacets.map(f => f.name).join(', ')}`);

    return diamondInfo;

  } catch (error) {
    console.error('[DiamondStandard] Error fetching diamond info from Sourcify API:', error);
    return null;
  }
}

/**
 * Enhanced diamond detection that tries Sourcify first
 */
export async function detectDiamondContractEnhanced(
  contractAddress: string,
  chain: Chain,
  provider?: ethers.providers.Provider
): Promise<DiamondInfo> {
  console.log(`[DiamondStandard] Enhanced diamond detection for ${contractAddress} on ${chain.name}...`);
  
  // Try Sourcify first for comprehensive diamond info
  const sourcifyInfo = await fetchDiamondFromSourcify(contractAddress, chain.id);
  
  if (sourcifyInfo) {
    console.log('[DiamondStandard] Got comprehensive diamond info from Sourcify!');
    
    // Convert Sourcify format to DiamondInfo format
    return {
      isDiamond: true,
      facets: sourcifyInfo.facets.map(facet => ({
        facetAddress: facet.address,
        functionSelectors: facet.functions.map(f => f.selector),
        facetName: facet.name,
        verified: true
      })),
      totalFunctions: sourcifyInfo.totalFunctions,
      loupeSupport: {
        facets: true,
        facetFunctionSelectors: true,
        facetAddresses: true,
        facetAddress: true,
        supportsInterface: true
      }
    };
  }
  
  // Fallback to regular diamond detection if Sourcify doesn't have it
  if (provider) {
    console.log('[DiamondStandard] Sourcify info not available, falling back to on-chain detection...');
    return await detectDiamondContract(contractAddress, provider);
  }
  
  // Return minimal diamond info if no provider available
  return {
    isDiamond: false,
    facets: [],
    totalFunctions: 0,
    loupeSupport: {
      facets: false,
      facetFunctionSelectors: false,
      facetAddresses: false,
      facetAddress: false,
      supportsInterface: false
    }
  };
}

/**
 * Groups ABI functions by their corresponding facets
 */
export function groupFunctionsByFacet(
  abi: string,
  diamondInfo: DiamondInfo
): Record<string, any[]> {
  
  console.log('[DiamondStandard] Grouping functions by facet...');
  
  try {
    const parsedAbi = JSON.parse(abi);
    const functions = parsedAbi.filter((item: any) => item.type === 'function');
    
    const facetGroups: Record<string, any[]> = {};
    
    // Initialize groups for each facet
    diamondInfo.facets.forEach(facet => {
      const facetKey = facet.facetName || facet.facetAddress;
      facetGroups[facetKey] = [];
    });
    
    // Add special group for unmatched functions
    facetGroups['Other Functions'] = [];
    
    // Group functions by facet
    functions.forEach((func: any) => {
      // Calculate function selector
      const signature = `${func.name}(${func.inputs.map((input: any) => input.type).join(',')})`;
      const selector = ethers.utils.id(signature).slice(0, 10);
      
      // Find which facet this function belongs to
      let matchedFacet = null;
      for (const facet of diamondInfo.facets) {
        if (facet.functionSelectors.includes(selector)) {
          matchedFacet = facet;
          break;
        }
      }
      
      if (matchedFacet) {
        const facetKey = matchedFacet.facetName || matchedFacet.facetAddress;
        facetGroups[facetKey].push({
          ...func,
          selector,
          facetAddress: matchedFacet.facetAddress
        });
      } else {
        facetGroups['Other Functions'].push({
          ...func,
          selector,
          facetAddress: 'unknown'
        });
      }
    });
    
    // Remove empty groups
    Object.keys(facetGroups).forEach(key => {
      if (facetGroups[key].length === 0) {
        delete facetGroups[key];
      }
    });
    
    console.log('[DiamondStandard] Functions grouped by facet:', Object.keys(facetGroups));
    return facetGroups;
    
  } catch (error) {
    console.error('[DiamondStandard] Error grouping functions by facet:', error);
    return {};
  }
}