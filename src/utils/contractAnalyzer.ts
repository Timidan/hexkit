import { ethers } from 'ethers';
import axios from 'axios';
import type { Chain } from '../types';

export interface ContractInfo {
  address: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  totalSupply?: string;
  contractType: 'ERC20' | 'ERC721' | 'ERC1155' | 'UNKNOWN' | 'PROXY' | 'MULTISIG';
  functions: ContractFunction[];
  verified: boolean;
  tokenIcon?: string;
}

export interface ContractFunction {
  name: string;
  type: 'function' | 'constructor' | 'event';
  stateMutability?: 'view' | 'pure' | 'nonpayable' | 'payable';
  inputs: Array<{
    name: string;
    type: string;
  }>;
  outputs?: Array<{
    name: string;
    type: string;
  }>;
}

// Standard function signatures for contract type detection
const ERC20_SIGNATURES = [
  'name()', 'symbol()', 'decimals()', 'totalSupply()',
  'balanceOf(address)', 'transfer(address,uint256)',
  'approve(address,uint256)', 'allowance(address,address)'
];

const ERC721_SIGNATURES = [
  'balanceOf(address)', 'ownerOf(uint256)', 'approve(address,uint256)',
  'getApproved(uint256)', 'setApprovalForAll(address,bool)',
  'isApprovedForAll(address,address)', 'transferFrom(address,address,uint256)',
  'safeTransferFrom(address,address,uint256)'
];

const ERC1155_SIGNATURES = [
  'balanceOf(address,uint256)', 'balanceOfBatch(address[],uint256[])',
  'setApprovalForAll(address,bool)', 'isApprovedForAll(address,address)',
  'safeTransferFrom(address,address,uint256,uint256,bytes)',
  'safeBatchTransferFrom(address,address,uint256[],uint256[],bytes)'
];

export const analyzeContract = async (
  abiString: string,
  contractAddress: string,
  _chain: Chain,
  provider?: ethers.providers.Provider
): Promise<ContractInfo> => {
  try {
    const abi = JSON.parse(abiString);
    
    // Parse functions from ABI
    const functions: ContractFunction[] = abi.map((item: any) => ({
      name: item.name || 'constructor',
      type: item.type,
      stateMutability: item.stateMutability,
      inputs: item.inputs || [],
      outputs: item.outputs || []
    }));

    // Detect contract type
    const contractType = detectContractType(abi);
    
    // Get basic contract info
    const contractInfo: ContractInfo = {
      address: contractAddress,
      contractType,
      functions,
      verified: true // If we have ABI, it's verified
    };

    // If we have a provider, fetch additional info
    if (provider) {
      try {
        const contract = new ethers.Contract(contractAddress, abi, provider);
        
        // Try to get ERC20 info
        if (contractType === 'ERC20') {
          const tokenInfo = await getERC20Info(contract);
          Object.assign(contractInfo, tokenInfo);
          
          // Try to fetch token icon
          try {
            const tokenIcon = await fetchTokenIcon(contractAddress, _chain);
            if (tokenIcon) {
              contractInfo.tokenIcon = tokenIcon;
            }
          } catch (iconError) {
            console.warn('Failed to fetch token icon:', iconError);
          }
        }
        
        // Try to get ERC721 info
        if (contractType === 'ERC721') {
          const nftInfo = await getERC721Info(contract);
          Object.assign(contractInfo, nftInfo);
        }
      } catch (error) {
        console.warn('Failed to fetch additional contract info:', error);
      }
    }

    return contractInfo;
    
  } catch (error) {
    console.error('Contract analysis failed:', error);
    return {
      address: contractAddress,
      contractType: 'UNKNOWN',
      functions: [],
      verified: false
    };
  }
};

const detectContractType = (abi: any[]): ContractInfo['contractType'] => {
  const functionSignatures = abi
    .filter(item => item.type === 'function')
    .map(func => {
      const inputs = func.inputs?.map((input: any) => input.type).join(',') || '';
      return `${func.name}(${inputs})`;
    });

  // Count matches for each standard
  const erc20Matches = ERC20_SIGNATURES.filter(sig => 
    functionSignatures.includes(sig)
  ).length;
  
  const erc721Matches = ERC721_SIGNATURES.filter(sig => 
    functionSignatures.includes(sig)
  ).length;
  
  const erc1155Matches = ERC1155_SIGNATURES.filter(sig => 
    functionSignatures.includes(sig)
  ).length;

  // Determine type based on highest match count
  if (erc20Matches >= 6) { // Most ERC20 functions present
    return 'ERC20';
  }
  
  if (erc721Matches >= 6) { // Most ERC721 functions present
    return 'ERC721';
  }
  
  if (erc1155Matches >= 4) { // Most ERC1155 functions present
    return 'ERC1155';
  }

  // Check for proxy patterns
  const proxyFunctions = ['implementation()', 'upgrade(address)', 'admin()'];
  const proxyMatches = proxyFunctions.filter(sig => 
    functionSignatures.includes(sig)
  ).length;
  
  if (proxyMatches >= 2) {
    return 'PROXY';
  }

  // Check for multisig patterns
  const multisigFunctions = ['submitTransaction', 'confirmTransaction', 'executeTransaction'];
  const multisigMatches = multisigFunctions.filter(func =>
    functionSignatures.some(sig => sig.includes(func))
  ).length;
  
  if (multisigMatches >= 2) {
    return 'MULTISIG';
  }

  return 'UNKNOWN';
};

const getERC20Info = async (contract: ethers.Contract): Promise<Partial<ContractInfo>> => {
  try {
    const [name, symbol, decimals, totalSupply] = await Promise.allSettled([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
      contract.totalSupply()
    ]);

    return {
      name: name.status === 'fulfilled' ? name.value : undefined,
      symbol: symbol.status === 'fulfilled' ? symbol.value : undefined,
      decimals: decimals.status === 'fulfilled' ? decimals.value : undefined,
      totalSupply: totalSupply.status === 'fulfilled' ? 
        ethers.utils.formatUnits(totalSupply.value, 
          decimals.status === 'fulfilled' ? decimals.value : 18
        ) : undefined
    };
  } catch (error) {
    console.warn('Failed to get ERC20 info:', error);
    return {};
  }
};

const getERC721Info = async (contract: ethers.Contract): Promise<Partial<ContractInfo>> => {
  try {
    const [name, symbol] = await Promise.allSettled([
      contract.name(),
      contract.symbol()
    ]);

    return {
      name: name.status === 'fulfilled' ? name.value : undefined,
      symbol: symbol.status === 'fulfilled' ? symbol.value : undefined
    };
  } catch (error) {
    console.warn('Failed to get ERC721 info:', error);
    return {};
  }
};

export const getContractTypeIcon = (type: ContractInfo['contractType']): string => {
  switch (type) {
    case 'ERC20': return 'erc20';
    case 'ERC721': return 'erc721';
    case 'ERC1155': return 'erc1155';
    case 'PROXY': return 'proxy';
    case 'MULTISIG': return 'multisig';
    default: return 'contract';
  }
};

export const getContractTypeDescription = (type: ContractInfo['contractType']): string => {
  switch (type) {
    case 'ERC20': return 'Fungible Token Contract';
    case 'ERC721': return 'Non-Fungible Token (NFT) Contract';
    case 'ERC1155': return 'Multi-Token Contract';
    case 'PROXY': return 'Proxy Contract';
    case 'MULTISIG': return 'Multi-Signature Wallet';
    default: return 'Smart Contract';
  }
};

// Fetch token icon using CORS-friendly approach
const fetchTokenIcon = async (contractAddress: string, chain: Chain): Promise<string | null> => {
  try {
    // Only support Ethereum mainnet for now
    if (chain.id !== 1) {
      return null;
    }

    // Use a proxy service or just construct the URL without HEAD request to avoid CORS
    // We'll try to load the image directly and let the browser handle errors
    const possibleUrls = [
      `https://assets.coingecko.com/coins/images/tokens/thumb/${contractAddress.toLowerCase()}.png`,
      `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${contractAddress}/logo.png`,
      `https://etherscan.io/token/images/${contractAddress.toLowerCase()}.png`,
    ];

    // Return the first URL to try - we'll handle failures in the component
    return possibleUrls[0];

  } catch (error) {
    console.warn('Failed to construct token icon URL:', error);
    return null;
  }
};
