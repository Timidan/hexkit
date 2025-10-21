import axios from 'axios';
import { ethers } from 'ethers';
import type { TransactionRequest, SimulationResult, AssetChange } from '../types/transaction';
import type { Chain } from '../types';

// Enhanced simulation that tries to actually call the contract
export const simulateTransaction = async (
  transaction: TransactionRequest,
  _chain: Chain,
  fromAddress: string,
  provider?: ethers.providers.Provider
): Promise<SimulationResult> => {
  try {
    // Basic validation
    if (!transaction.to || !transaction.data) {
      return {
        mode: 'rpc',
        success: false,
        error: 'Transaction requires "to" address and "data"',
        warnings: [],
        revertReason: null,
        gasUsed: null,
        gasLimitSuggested: null,
        rawTrace: null,
      };
    }

    // Try realistic simulation if provider is available
    if (provider) {
      const realisticSimulation = await performRealisticSimulation(transaction, fromAddress, provider);
      return realisticSimulation;
    }

    // Fallback to mock simulation
    const mockSimulation = await performMockSimulation(transaction, fromAddress);
    return mockSimulation;

  } catch (error: any) {
    console.error('Simulation error:', error);
    return {
      mode: 'rpc',
      success: false,
      error: error.message || 'Simulation failed',
      warnings: [],
      revertReason: null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: null,
    };
  }
};

// More realistic simulation using eth_call
const performRealisticSimulation = async (
  transaction: TransactionRequest,
  fromAddress: string,
  provider: ethers.providers.Provider
): Promise<SimulationResult> => {
  try {
    // First, try to estimate gas - this will catch many revert scenarios
    let gasEstimate: ethers.BigNumber;
    
    try {
      gasEstimate = await provider.estimateGas({
        from: fromAddress,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || '0x0',
      });
    } catch (error: any) {
      const gasEstimateError = error.message || error.toString();
      
      // If gas estimation fails, the transaction will likely fail
      const revertReason = extractRevertReason(gasEstimateError);
      return {
        mode: 'rpc',
        success: false,
        error: revertReason || 'Gas estimation failed - transaction will likely revert',
        warnings: [],
        revertReason: revertReason ?? null,
        gasUsed: '0',
        gasLimitSuggested: transaction.gasLimit ?? null,
        rawTrace: null,
      };
    }

    // If gas estimation succeeded, try a static call
    try {
      const callResult = await provider.call({
        from: fromAddress,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value || '0x0',
      });

      // If both gas estimation and call succeeded, transaction should work
      const gasLimit = gasEstimate.mul(120).div(100); // Add 20% buffer
      
      return {
        mode: 'rpc',
        success: true,
        error: null,
        warnings: [],
        revertReason: null,
        gasUsed: gasEstimate.toString(),
        gasLimitSuggested: gasLimit.toString(),
        rawTrace: {
          assetChanges: await estimateAssetChanges(transaction, fromAddress),
          returnData: callResult && callResult !== '0x' ? callResult : null,
        },
      };
      
    } catch (callError: any) {
      const callRevertReason = extractRevertReason(callError.message || callError.toString());
      return {
        mode: 'rpc',
        success: false,
        error: callRevertReason || 'Transaction call failed',
        warnings: [],
        revertReason: callRevertReason ?? null,
        gasUsed: '0',
        gasLimitSuggested: transaction.gasLimit ?? null,
        rawTrace: null,
      };
    }

  } catch (error: any) {
    console.error('Realistic simulation failed:', error);
    return {
      mode: 'rpc',
      success: false,
      error: 'Simulation failed: ' + (error.message || 'Unknown error'),
      warnings: [],
      revertReason: null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: null,
    };
  }
};

// Extract revert reason from error messages
const extractRevertReason = (errorString: string): string | null => {
  // Pattern 1: execution reverted: {reason}
  const revertMatch = errorString.match(/execution reverted: (.+?)(?:\s*\[|$)/);
  if (revertMatch) {
    return revertMatch[1].trim();
  }

  // Pattern 2: revert {reason}
  const revertMatch2 = errorString.match(/revert (.+?)(?:\s*\[|$)/);
  if (revertMatch2) {
    return revertMatch2[1].trim();
  }

  // Pattern 3: reason="{reason}"
  const reasonMatch = errorString.match(/reason="([^"]+)"/);
  if (reasonMatch) {
    return reasonMatch[1].trim();
  }

  // Look for common error patterns
  if (errorString.toLowerCase().includes('transfer amount exceeds balance')) {
    return 'Transfer amount exceeds balance';
  }
  
  if (errorString.toLowerCase().includes('insufficient allowance')) {
    return 'Insufficient allowance';
  }
  
  if (errorString.toLowerCase().includes('insufficient funds')) {
    return 'Insufficient funds';
  }

  return null;
};

// Simple asset change estimation
const estimateAssetChanges = async (
  transaction: TransactionRequest,
  fromAddress: string
): Promise<AssetChange[]> => {
  const changes: AssetChange[] = [];

  // If transaction has ETH value
  if (transaction.value && transaction.value !== '0' && transaction.value !== '0x0') {
    const ethValue = parseFloat(ethers.utils.formatEther(transaction.value));
    changes.push({
      address: fromAddress,
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      amount: `-${ethValue}`,
      changeType: 'SEND',
      rawAmount: `-${transaction.value}`,
    });
  }

  // Basic detection for common ERC20 functions
  if (transaction.data?.startsWith('0xa9059cbb')) { // transfer(address,uint256)
    changes.push({
      address: fromAddress,
      symbol: 'TOKEN',
      name: 'Token',
      decimals: 18,
      amount: '-',
      changeType: 'SEND',
      rawAmount: '0',
    });
  }

  return changes;
};

// Mock simulation for development and testing
const performMockSimulation = async (
  transaction: TransactionRequest,
  fromAddress: string
): Promise<SimulationResult> => {
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Mock gas estimation based on data size
  const dataSize = (transaction.data?.length || 0) / 2; // hex characters to bytes
  const baseGas = 21000; // base transaction cost
  const dataGas = dataSize * 16; // roughly 16 gas per byte of data
  const estimatedGas = Math.floor(baseGas + dataGas);

  // Mock asset changes for common patterns
  const mockChanges: AssetChange[] = [];
  
  // If it looks like an ERC20 transfer (common function signature)
  if (transaction.data?.startsWith('0xa9059cbb')) {
    mockChanges.push({
      address: fromAddress,
      symbol: 'TOKEN',
      name: 'Mock Token',
      decimals: 18,
      amount: '-100.0',
      changeType: 'SEND',
      rawAmount: '-100000000000000000000',
    });
  }

  // If transaction has value, it's sending ETH
  if (transaction.value && transaction.value !== '0') {
    const ethValue = parseInt(transaction.value, 16) / 1e18;
    mockChanges.push({
      address: fromAddress,
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      amount: `-${ethValue}`,
      changeType: 'SEND',
      rawAmount: `-${transaction.value}`,
    });
  }

  return {
    mode: 'rpc',
    success: true,
    error: null,
    warnings: ['Mock simulation generated without provider access'],
    revertReason: null,
    gasUsed: estimatedGas.toString(),
    gasLimitSuggested: Math.floor(estimatedGas * 1.2).toString(),
    rawTrace: {
      assetChanges: mockChanges,
    },
  };
};

// Real Tenderly integration (for when API key is available)
export const simulateWithTenderly = async (
  transaction: TransactionRequest,
  chain: Chain,
  fromAddress: string,
  apiKey?: string
): Promise<SimulationResult> => {
  if (!apiKey) {
    throw new Error('Tenderly API key required for advanced simulation');
  }

  try {
    const tenderlyChainId = getTenderlyChainId(chain.id);
    
    const response = await axios.post(
      `https://api.tenderly.co/api/v1/public-contracts/simulate`,
      {
        network_id: tenderlyChainId,
        from: fromAddress,
        to: transaction.to,
        input: transaction.data,
        value: transaction.value || '0',
        gas: parseInt(transaction.gasLimit || '0x1fffff', 16),
        gas_price: transaction.gasPrice || '20000000000',
        save: false,
        save_if_fails: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Access-Key': apiKey,
        },
        timeout: 10000,
      }
    );

    const simulation = response.data.simulation;
    
    return {
      mode: 'rpc',
      success: simulation.status,
      error: null,
      warnings: [],
      revertReason: null,
      gasUsed: simulation.gas_used?.toString() ?? null,
      gasLimitSuggested: transaction.gasLimit ?? null,
      rawTrace: {
        assetChanges: parseAssetChanges(simulation.asset_changes || []),
        events: parseEvents(simulation.logs || []),
        trace: parseTrace(simulation.call_trace),
      },
    };

  } catch (error: any) {
    console.error('Tenderly simulation error:', error);
    return {
      mode: 'rpc',
      success: false,
      error: error.response?.data?.error?.message || error.message || 'Tenderly simulation failed',
      warnings: [],
      revertReason: null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: null,
    };
  }
};

// Helper functions for parsing Tenderly responses
const getTenderlyChainId = (chainId: number): string => {
  const mapping: { [key: number]: string } = {
    1: '1', // Ethereum
    137: '137', // Polygon
    56: '56', // BSC
    42161: '42161', // Arbitrum
  };
  return mapping[chainId] || '1';
};

const parseAssetChanges = (changes: any[]): AssetChange[] => {
  return changes.map(change => ({
    address: change.token_info?.contract_address || change.contract_address,
    symbol: change.token_info?.symbol || 'ETH',
    name: change.token_info?.name || 'Ethereum',
    decimals: change.token_info?.decimals || 18,
    amount: change.amount,
    changeType: change.amount.startsWith('-') ? 'SEND' : 'RECEIVE',
    rawAmount: change.raw_amount,
  }));
};

const parseEvents = (logs: any[]): any[] => {
  return logs.map(log => ({
    address: log.address,
    topics: log.topics,
    data: log.data,
    decoded: log.decoded,
  }));
};

const parseTrace = (trace: any): any[] => {
  if (!trace) return [];
  return [trace]; // Simplified for now
};
