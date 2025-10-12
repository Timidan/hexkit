import { whatsabi } from '@shazow/whatsabi';
import { ethers } from 'ethers';
import type { Chain } from '../types';

// Extended result interface for WhatsABI integration
export interface WhatsABIResult {
  success: boolean;
  abi?: string;
  error?: string;
  source: 'whatsabi';
  explorerName: 'WhatsABI';
  contractName?: string;
  confidence: 'verified' | 'inferred' | 'extracted';
  selectors?: string[];
  proxyType?: string;
  implementations?: string[];
}

/**
 * Fetch ABI using WhatsABI - works with any contract, verified or not
 */
export async function fetchFromWhatsABI(
  contractAddress: string,
  chain: Chain,
  provider?: ethers.providers.Provider
): Promise<WhatsABIResult> {
  try {
    console.log(` WhatsABI: Analyzing contract ${contractAddress} on ${chain.name}...`);
    
    // Create provider if not provided
    let whatsabiProvider = provider;
    if (!whatsabiProvider) {
      const network = { name: chain.name, chainId: chain.id };
      whatsabiProvider = new ethers.providers.JsonRpcProvider(chain.rpcUrl, network);
    }

    // Use WhatsABI autoload for comprehensive analysis
    const result = await whatsabi.autoload(contractAddress, {
      provider: whatsabiProvider,
      followProxies: true, // Important for diamond detection
      onProgress: (phase: string) => {
        console.log(`   WhatsABI phase: ${phase}`);
      },
      onError: (phase: string, context: any) => {
        console.warn(`  WhatsABI error in ${phase}:`, context);
      }
    });

    if (!result) {
      return {
        success: false,
        error: 'WhatsABI analysis failed',
        source: 'whatsabi',
        explorerName: 'WhatsABI',
        confidence: 'extracted'
      };
    }

    console.log(` WhatsABI analysis complete for ${contractAddress}`);
    console.log(`   Found ${result.abi?.length || 0} ABI items`);
    
    // CRITICAL: Verify contract actually exists before proceeding
    const bytecode = await whatsabiProvider.getCode(contractAddress);
    if (!bytecode || bytecode === '0x') {
      console.log(` No contract found at ${contractAddress} on ${chain.name}`);
      return {
        success: false,
        error: `No contract deployed at address on ${chain.name}`,
        source: 'whatsabi',
        explorerName: 'WhatsABI',
        confidence: 'extracted'
      };
    }
    
    // Check if this is a proxy (including diamond)
    let proxyType: string | undefined;
    let implementations: string[] = [];
    
    if (result.proxies && result.proxies.length > 0) {
      console.log(`   Proxy detected: ${result.proxies.length} implementations`);
      
      // Extract proxy information
      const firstProxy = result.proxies[0];
      if (firstProxy) {
        proxyType = (firstProxy as any).type;
        implementations = result.proxies.map(p => (p as any).address).filter(Boolean);
        console.log(`   Proxy type: ${proxyType}`);
        console.log(`   Implementations: ${implementations.join(', ')}`);
      }
    }

    // Extract function selectors for additional metadata
    let selectors: string[] = [];
    try {
      if (bytecode && bytecode !== '0x') {
        selectors = whatsabi.selectorsFromBytecode(bytecode);
        console.log(`   Extracted ${selectors.length} function selectors`);
      }
    } catch (error) {
      console.warn(`  Failed to extract selectors:`, error);
    }

    // Determine confidence level
    let confidence: 'verified' | 'inferred' | 'extracted' = 'extracted';
    if (result.abi && result.abi.length > 0) {
      // Check if we have detailed function information (signatures vs just selectors)
      const hasDetailedFunctions = result.abi.some((item: any) => 
        item.type === 'function' && item.name && !item.name.startsWith('0x')
      );
      confidence = hasDetailedFunctions ? 'inferred' : 'extracted';
    }

    // Generate contract name
    let contractName = proxyType === 'DiamondProxy' ? 'Diamond Contract' : 'Contract';
    if (proxyType) {
      contractName = `${proxyType} Contract`;
    }

    return {
      success: true,
      abi: result.abi ? JSON.stringify(result.abi) : undefined,
      source: 'whatsabi',
      explorerName: 'WhatsABI',
      contractName,
      confidence,
      selectors,
      proxyType,
      implementations,
    };

  } catch (error: any) {
    console.error(' WhatsABI analysis failed:', error);

    // Fallback: try basic bytecode analysis
    try {
      console.log(' Attempting fallback bytecode analysis...');
      
      const fallbackProvider = provider || new ethers.providers.JsonRpcProvider(chain.rpcUrl, {
        name: chain.name,
        chainId: chain.id
      });
      
      const bytecode = await fallbackProvider.getCode(contractAddress);
      if (bytecode && bytecode !== '0x') {
        const selectors = whatsabi.selectorsFromBytecode(bytecode);
        const basicAbi = whatsabi.abiFromBytecode(bytecode);
        
        console.log(` Fallback extracted ${selectors.length} selectors, ${basicAbi.length} ABI items`);
        
        return {
          success: true,
          abi: JSON.stringify(basicAbi),
          source: 'whatsabi',
          explorerName: 'WhatsABI',
          contractName: 'Contract (Bytecode Analysis)',
          confidence: 'extracted',
          selectors,
        };
      }
    } catch (fallbackError) {
      console.error(' Fallback analysis also failed:', fallbackError);
    }

    return {
      success: false,
      error: `WhatsABI analysis failed: ${error.message}`,
      source: 'whatsabi',
      explorerName: 'WhatsABI',
      confidence: 'extracted'
    };
  }
}

/**
 * Enhanced diamond facet analysis using WhatsABI
 */
export async function analyzeContractWithWhatsABI(
  contractAddress: string,
  chain: Chain,
  provider?: ethers.providers.Provider
): Promise<{
  isDiamond: boolean;
  proxyType?: string;
  implementations?: string[];
  selectors: string[];
  abi?: any[];
}> {
  try {
    console.log(` WhatsABI: Deep analysis of ${contractAddress}...`);
    
    const whatsabiProvider = provider || new ethers.providers.JsonRpcProvider(chain.rpcUrl, {
      name: chain.name,
      chainId: chain.id
    });

    // Get bytecode and analyze
    const bytecode = await whatsabiProvider.getCode(contractAddress);
    if (!bytecode || bytecode === '0x') {
      return {
        isDiamond: false,
        selectors: [],
      };
    }

    // Extract selectors
    const selectors = whatsabi.selectorsFromBytecode(bytecode);
    console.log(`   Found ${selectors.length} function selectors`);

    // Try full WhatsABI analysis
    const result = await whatsabi.autoload(contractAddress, {
      provider: whatsabiProvider,
      followProxies: true,
    });

    let isDiamond = false;
    let proxyType: string | undefined;
    let implementations: string[] = [];

    // Check for diamond/proxy patterns
    if (result.proxies && result.proxies.length > 0) {
      const firstProxy = result.proxies[0];
      proxyType = (firstProxy as any)?.type;
      implementations = result.proxies.map(p => (p as any).address).filter(Boolean);
      
      isDiamond = proxyType === 'DiamondProxy';
      console.log(`   Proxy analysis: ${proxyType} (Diamond: ${isDiamond})`);
    }

    return {
      isDiamond,
      proxyType,
      implementations,
      selectors,
      abi: result.abi,
    };

  } catch (error) {
    console.error(' WhatsABI deep analysis failed:', error);
    
    // Fallback to basic selector extraction
    try {
      const fallbackProvider = provider || new ethers.providers.JsonRpcProvider(chain.rpcUrl);
      const bytecode = await fallbackProvider.getCode(contractAddress);
      const selectors = bytecode !== '0x' ? whatsabi.selectorsFromBytecode(bytecode) : [];
      
      return {
        isDiamond: false,
        selectors,
      };
    } catch (fallbackError) {
      return {
        isDiamond: false,
        selectors: [],
      };
    }
  }
}

/**
 * Create function stubs from selectors with signature lookup
 */
export interface SelectorFunctionStub {
  signature: string;
  selector: string;
  abi: any;
  confidence: 'inferred' | 'extracted';
}

const WRITE_KEYWORDS = [
  'set',
  'add',
  'remove',
  'update',
  'create',
  'mint',
  'burn',
  'transfer',
  'approve',
  'deposit',
  'withdraw',
  'claim',
  'execute',
  'upgrade',
  'init',
  'initialize',
  'configure',
  'register',
  'enable',
  'disable',
  'pause',
  'unpause',
  'refund',
  'sweep',
  'distribute',
];

const READ_KEYWORDS = [
  'get',
  'is',
  'has',
  'can',
  'supports',
  'balance',
  'owner',
  'symbol',
  'name',
  'decimals',
  'allowance',
  'total',
  'token',
  'uri',
  'max',
  'min',
  'fee',
  'price',
  'rate',
  'pending',
  'current',
  'version',
  'supply',
  'available',
  'index',
  'list',
  'info',
  'details',
];

function inferStateMutability(fragment: ethers.utils.FunctionFragment): 'view' | 'nonpayable' {
  const name = fragment.name?.toLowerCase() || '';
  const hasOutputs = Array.isArray(fragment.outputs) ? fragment.outputs.length > 0 : false;

  if (WRITE_KEYWORDS.some((keyword) => name.startsWith(keyword))) {
    return 'nonpayable';
  }

  if (READ_KEYWORDS.some((keyword) => name.startsWith(keyword))) {
    return 'view';
  }

  if (!hasOutputs) {
    return 'nonpayable';
  }

  return 'view';
}

export async function createFunctionStubsFromSelectors(
  selectors: string[],
  facetAddress: string,
  facetName: string
): Promise<SelectorFunctionStub[]> {
  const stubs: SelectorFunctionStub[] = [];

  console.log(` Creating function stubs for ${facetName} with ${selectors.length} selectors`);

  // Try to resolve signatures using WhatsABI's signature lookup
  try {
    const signatureLookup = new whatsabi.loaders.OpenChainSignatureLookup();

    for (const selector of selectors) {
      try {
        const signatures = await signatureLookup.loadFunctions(selector);

        if (signatures && signatures.length > 0) {
          const rawSignature = signatures[0] as string | { name?: string };
          const signature =
            typeof rawSignature === 'string'
              ? rawSignature
              : rawSignature?.name || '';

          if (!signature) {
            throw new Error('Unable to resolve signature string');
          }

          try {
            const fragment = ethers.utils.FunctionFragment.from(signature);
            const abiJson = fragment.format(ethers.utils.FormatTypes.json);
            const abiEntry = JSON.parse(abiJson);
            const inferredState = inferStateMutability(fragment);

            abiEntry.stateMutability = inferredState;
            abiEntry.constant = inferredState === 'view';
            abiEntry.payable = false;

            stubs.push({
              signature,
              selector,
              abi: {
                ...abiEntry,
                selector,
                facetAddress,
                facetName,
                inferred: true,
                confidence: 'inferred',
              },
              confidence: 'inferred',
            });

            console.log(`   Resolved ${selector} → ${signature}`);
            continue;
          } catch (parseError) {
            console.warn(`  Failed to parse signature ${signature}:`, parseError);
          }
        }

        // If no signatures or parsing failed, fall back to generic stub
        const fallbackName = `function_${selector.slice(2, 10)}`;
        const fragment = ethers.utils.FunctionFragment.from(`${fallbackName}()`);
        const fallbackAbi = JSON.parse(fragment.format(ethers.utils.FormatTypes.json));
        fallbackAbi.stateMutability = 'nonpayable';
        fallbackAbi.constant = false;
        fallbackAbi.payable = false;

        stubs.push({
          signature: fallbackName,
          selector,
          abi: {
            ...fallbackAbi,
            selector,
            facetAddress,
            facetName,
            inferred: true,
            confidence: 'extracted',
          },
          confidence: 'extracted',
        });
      } catch (error) {
        console.warn(`  Selector lookup failed for ${selector}:`, error);

        const fallbackName = `function_${selector.slice(2, 10)}`;
        const fragment = ethers.utils.FunctionFragment.from(`${fallbackName}()`);
        const fallbackAbi = JSON.parse(fragment.format(ethers.utils.FormatTypes.json));
        fallbackAbi.stateMutability = 'nonpayable';
        fallbackAbi.constant = false;
        fallbackAbi.payable = false;

        stubs.push({
          signature: fallbackName,
          selector,
          abi: {
            ...fallbackAbi,
            selector,
            facetAddress,
            facetName,
            inferred: true,
            confidence: 'extracted',
          },
          confidence: 'extracted',
        });
      }
    }
  } catch (error) {
    console.warn('Signature lookup failed, using basic stubs:', error);

    for (const selector of selectors) {
      const fallbackName = `function_${selector.slice(2, 10)}`;
      const fragment = ethers.utils.FunctionFragment.from(`${fallbackName}()`);
      const fallbackAbi = JSON.parse(fragment.format(ethers.utils.FormatTypes.json));
      fallbackAbi.stateMutability = 'nonpayable';
      fallbackAbi.constant = false;
      fallbackAbi.payable = false;

      stubs.push({
        signature: fallbackName,
        selector,
        abi: {
          ...fallbackAbi,
          selector,
          facetAddress,
          facetName,
          inferred: true,
          confidence: 'extracted',
        },
        confidence: 'extracted',
      });
    }
  }

  console.log(` Created ${stubs.length} function stubs for ${facetName}`);
  return stubs;
}
