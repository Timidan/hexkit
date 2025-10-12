import { ethers } from 'ethers';
import axios from 'axios';

// Mock the environment for Node.js testing
const mockImportMetaEnv = {
  API_KEY: process.env.API_KEY || 'demo',
  VITE_API_KEY: process.env.VITE_API_KEY || 'demo'
};

// Mock the chains for testing
const TEST_CHAINS = [
  {
    id: 137,
    name: "Polygon",
    rpcUrl: `https://polygon-mainnet.g.alchemy.com/v2/${mockImportMetaEnv.API_KEY}`,
    explorerUrl: "https://polygonscan.com",
    blockExplorer: "https://polygonscan.com",
    apiUrl: "https://api.polygonscan.com/api",
    explorers: [
      {
        name: "Polygonscan",
        url: "https://polygonscan.com",
        apiUrl: "https://api.polygonscan.com/api",
        apiKey: mockImportMetaEnv.API_KEY
      }
    ]
  },
  {
    id: 8453,
    name: "Base",
    rpcUrl: `https://base-mainnet.g.alchemy.com/v2/${mockImportMetaEnv.API_KEY}`,
    explorerUrl: "https://basescan.org",
    blockExplorer: "https://basescan.org",
    apiUrl: "https://api.basescan.org/api",
    explorers: [
      {
        name: "Basescan",
        url: "https://basescan.org",
        apiUrl: "https://api.basescan.org/api",
        apiKey: mockImportMetaEnv.API_KEY
      }
    ]
  }
];

interface DiamondFacetInfo {
  address: string;
  name: string;
  verified: boolean;
  abi?: any[];
  functions: Array<{
    name: string;
    selector: string;
    signature: string;
    type: 'read' | 'write';
  }>;
  error?: string;
}

interface DiamondFacetFetchResult {
  facets: DiamondFacetInfo[];
  totalFunctions: number;
  errors: string[];
}

interface FacetFetchProgress {
  current: number;
  total: number;
  currentFacet: string;
  status: 'fetching' | 'completed' | 'error';
}

async function fetchDiamondFacets(
  contractAddress: string,
  chain: any,
  onProgress?: (progress: FacetFetchProgress) => void
): Promise<DiamondFacetFetchResult> {
  console.log(` Fetching Diamond facets for ${contractAddress} on ${chain.name}...`);
  
  const result: DiamondFacetFetchResult = {
    facets: [],
    totalFunctions: 0,
    errors: []
  };

  try {
    // First, get facet addresses from the Diamond contract
    const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
    const diamondContract = new ethers.Contract(contractAddress, [
      'function facetAddresses() external view returns (address[] memory facetAddresses_)'
    ], provider);

    const facetAddresses = await diamondContract.facetAddresses();
    console.log(` Found ${facetAddresses.length} facets:`, facetAddresses);

    if (facetAddresses.length === 0) {
      result.errors.push('No facets found in Diamond contract');
      return result;
    }

    // Fetch each facet individually
    console.log(' Fetching facets individually...');
    
    const batchSize = 4;
    const batches: string[][] = [];
    for (let i = 0; i < facetAddresses.length; i += batchSize) {
      batches.push(facetAddresses.slice(i, i + batchSize));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      console.log(` Processing batch ${batchIndex + 1}/${batches.length} with ${batch.length} facets`);

      const batchPromises = batch.map(async (facetAddress, index) => {
        const globalIndex = batchIndex * batchSize + index;
        
        onProgress?.({
          current: globalIndex + 1,
          total: facetAddresses.length,
          currentFacet: facetAddress,
          status: 'fetching'
        });

        try {
          const facetInfo = await fetchSingleFacetInfo(facetAddress, chain);
          return facetInfo;
        } catch (error) {
          console.error(` Failed to fetch facet ${facetAddress}:`, error);
          return {
            address: facetAddress,
            name: `Unverified (${facetAddress.slice(0, 6)}...${facetAddress.slice(-4)})`,
            verified: false,
            functions: [],
            error: error instanceof Error ? error.message : String(error)
          };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const promiseResult of batchResults) {
        if (promiseResult.status === 'fulfilled') {
          result.facets.push(promiseResult.value);
        } else {
          result.errors.push(`Failed to fetch facet: ${promiseResult.reason}`);
        }
      }
    }

    // Calculate total functions
    result.totalFunctions = result.facets.reduce((total, facet) => total + facet.functions.length, 0);

    console.log(` Fetched ${result.facets.length} facets with ${result.totalFunctions} total functions`);
    return result;

  } catch (error) {
    console.error(' Error fetching Diamond facets:', error);
    result.errors.push(error instanceof Error ? error.message : String(error));
    return result;
  }
}

async function fetchSingleFacetInfo(facetAddress: string, chain: any): Promise<DiamondFacetInfo> {
  console.log(` Fetching info for facet ${facetAddress}...`);

  // Try Etherscan first
  try {
    const result = await fetchFacetFromEtherscan(facetAddress, chain);
    if (result) {
      return result;
    }
  } catch (error) {
    console.log(` Etherscan failed for ${facetAddress}:`, error);
  }

  // If Etherscan fails, return unverified facet
  return {
    address: facetAddress,
    name: `Unverified (${facetAddress.slice(0, 6)}...${facetAddress.slice(-4)})`,
    verified: false,
    functions: []
  };
}

async function fetchFacetFromEtherscan(facetAddress: string, chain: any): Promise<DiamondFacetInfo | null> {
  try {
    const apiKey = mockImportMetaEnv.API_KEY;
    const baseUrl = getEtherscanBaseUrl(chain);
    
    if (!baseUrl) {
      throw new Error(`No Etherscan API available for ${chain.name}`);
    }

    const url = `${baseUrl}/api?module=contract&action=getabi&address=${facetAddress}&apikey=${apiKey}`;
    console.log(` Fetching from Etherscan: ${url}`);

    const response = await axios.get(url, { timeout: 10000 });
    
    if (response.data.status === '1' && response.data.result) {
      const abi = JSON.parse(response.data.result);
      const functions = extractFunctionsFromABI(abi);
      
      return {
        address: facetAddress,
        name: extractContractName(abi) || `Contract (${facetAddress.slice(0, 6)}...${facetAddress.slice(-4)})`,
        verified: true,
        abi,
        functions
      };
    }

    return null;
  } catch (error) {
    console.log(` Etherscan fetch failed for ${facetAddress}:`, error);
    return null;
  }
}

function extractFunctionsFromABI(abi: any[]): Array<{
  name: string;
  selector: string;
  signature: string;
  type: 'read' | 'write';
}> {
  const functions: Array<{
    name: string;
    selector: string;
    signature: string;
    type: 'read' | 'write';
  }> = [];

  for (const item of abi) {
    if (item.type === 'function') {
      const signature = `${item.name}(${item.inputs.map((input: any) => input.type).join(',')})`;
      const selector = ethers.utils.id(signature).slice(0, 10);
      
      functions.push({
        name: item.name,
        selector,
        signature,
        type: item.stateMutability === 'view' || item.stateMutability === 'pure' ? 'read' : 'write'
      });
    }
  }

  return functions;
}

function extractContractName(abi: any[]): string | null {
  for (const item of abi) {
    if (item.type === 'constructor' && item.name) {
      return item.name;
    }
  }
  return null;
}

function getEtherscanBaseUrl(chain: any): string | null {
  const etherscanUrls: Record<string, string> = {
    'polygon': 'https://api.polygonscan.com',
    'base': 'https://api.basescan.org',
  };

  return etherscanUrls[chain.name.toLowerCase()] || null;
}

async function testDiamondFacets() {
  console.log(' Testing Diamond Facet Fetching...\n');

  const testContracts = [
    {
      address: '0xd5543237c656f25eea69f1e247b8fa59ba353306',
      chain: TEST_CHAINS[0], // Polygon
      name: 'GBM Diamond (Polygon)'
    },
    {
      address: '0xa99c4b08201f2913db8d28e71d020c4298f29dbf',
      chain: TEST_CHAINS[1], // Base
      name: 'ERC721 Diamond (Base)'
    }
  ];

  for (const test of testContracts) {
    console.log(`\n Testing ${test.name}...`);
    console.log(` Address: ${test.address}`);
    console.log(` Chain: ${test.chain.name}`);
    
    try {
      const startTime = Date.now();
      
      const result = await fetchDiamondFacets(
        test.address,
        test.chain,
        (progress) => {
          console.log(` Progress: ${progress.current}/${progress.total} - ${progress.currentFacet} (${progress.status})`);
        }
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      console.log(`\n Results for ${test.name}:`);
      console.log(`⏱️  Duration: ${duration}ms`);
      console.log(` Total Facets: ${result.facets.length}`);
      console.log(` Total Functions: ${result.totalFunctions}`);
      console.log(` Errors: ${result.errors.length}`);

      if (result.errors.length > 0) {
        console.log(`\n Errors:`);
        result.errors.forEach(error => console.log(`  - ${error}`));
      }

      console.log(`\n Facet Details:`);
      result.facets.forEach((facet, index) => {
        console.log(`\n  ${index + 1}. ${facet.name}`);
        console.log(`     Address: ${facet.address}`);
        console.log(`     Verified: ${facet.verified ? '' : ''}`);
        console.log(`     Functions: ${facet.functions.length}`);
        
        if (facet.functions.length > 0) {
          const readFunctions = facet.functions.filter(f => f.type === 'read').length;
          const writeFunctions = facet.functions.filter(f => f.type === 'write').length;
          console.log(`       - Read: ${readFunctions}`);
          console.log(`       - Write: ${writeFunctions}`);
        }

        if (facet.error) {
          console.log(`     Error: ${facet.error}`);
        }
      });

    } catch (error) {
      console.log(` Test failed for ${test.name}:`, error);
    }

    console.log('\n' + '='.repeat(80));
  }
}

// Run the test
testDiamondFacets().catch(console.error);
