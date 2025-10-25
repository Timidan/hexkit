import axios from 'axios';
import { ethers } from 'ethers';
import type { TransactionRequest, SimulationResult, AssetChange } from '../types/transaction';
import type { Chain } from '../types';
import { getSimulatorBridgeUrl } from './env';

const SIMULATOR_BRIDGE_URL = getSimulatorBridgeUrl();
const SIMULATOR_BRIDGE_ENDPOINT = SIMULATOR_BRIDGE_URL
  ? SIMULATOR_BRIDGE_URL.replace(/\/+$/, '')
  : '';
let hasLoggedSimulatorBridgeFailure = false;

interface BridgeSimulationResponsePayload {
  mode?: string;
  success?: boolean;
  error?: string | null;
  warnings?: string[] | null;
  revertReason?: string | null;
  gasUsed?: string | null;
  gasLimitSuggested?: string | null;
  rawTrace?: unknown;
}

type SerializableTransactionField =
  | string
  | number
  | ethers.BigNumber
  | undefined
  | null;

const ensureHexPrefix = (value: string) => {
  if (!value) {
    return '0x';
  }
  return value.startsWith('0x') || value.startsWith('0X')
    ? value
    : `0x${value}`;
};

const toQuantityString = (value: SerializableTransactionField): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toHexString();
  }

  if (typeof value === 'number') {
    return ethers.BigNumber.from(value).toHexString();
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return trimmed;
  }

  if (/^-?\d+$/.test(trimmed)) {
    // Allow decimal integer strings and let the backend normalize
    return trimmed;
  }

  return undefined;
};

const buildBridgeTransactionPayload = (
  transaction: TransactionRequest,
  fromAddress: string
) => {
  const payload: Record<string, string> = {
    data: ensureHexPrefix(transaction.data),
  };

  if (fromAddress) {
    payload.from = fromAddress;
  }

  if (transaction.to) {
    payload.to = transaction.to;
  }

  const valueCandidate = toQuantityString(
    transaction.value as SerializableTransactionField
  );
  if (valueCandidate) {
    payload.value = valueCandidate;
  }

  const gasCandidate =
    toQuantityString((transaction as any)?.gas) ||
    toQuantityString(transaction.gasLimit as SerializableTransactionField);
  if (gasCandidate) {
    payload.gas = gasCandidate;
  }

  const gasPriceCandidate =
    toQuantityString(transaction.gasPrice as SerializableTransactionField) ||
    toQuantityString(transaction.maxFeePerGas as SerializableTransactionField) ||
    toQuantityString(
      transaction.maxPriorityFeePerGas as SerializableTransactionField
    );
  if (gasPriceCandidate) {
    payload.gasPrice = gasPriceCandidate;
  }

  return payload;
};

const normalizeBridgeResult = (
  payload: BridgeSimulationResponsePayload
): SimulationResult => {
  const rawTrace =
    (payload as any).rawTrace ??
    (payload as any).raw_trace ??
    (payload as any).trace ??
    null;
  const gasUsed =
    payload.gasUsed ??
    (payload as any).gas_used ??
    null;
  const gasLimitSuggested =
    payload.gasLimitSuggested ??
    (payload as any).gas_limit_suggested ??
    null;
  const revertReason =
    payload.revertReason ??
    (payload as any).revert_reason ??
    null;
  const warnings =
    payload.warnings ??
    (payload as any).warnings ??
    [];
  const modeValue =
    payload.mode ??
    (payload as any).mode ??
    '';
  const successValue =
    typeof payload.success === 'boolean'
      ? payload.success
      : Boolean((payload as any).success);
  const errorValue =
    payload.error ??
    (payload as any).error ??
    null;

  const canonicalMode =
    modeValue === 'local' || modeValue === 'onchain'
      ? modeValue
      : 'rpc';

  return {
    mode: canonicalMode,
    success: successValue,
    error: errorValue,
    warnings,
    revertReason,
    gasUsed,
    gasLimitSuggested,
    rawTrace,
  };
};

const trySimulatorBridge = async (
  transaction: TransactionRequest,
  chain: Chain,
  fromAddress: string
): Promise<SimulationResult | null> => {
  if (!SIMULATOR_BRIDGE_ENDPOINT) {
    return null;
  }

  if (!chain?.rpcUrl) {
    console.warn(
      '[simulation] Simulator bridge configured but missing RPC URL for chain:',
      chain
    );
    return null;
  }

  const url = `${SIMULATOR_BRIDGE_ENDPOINT}/simulate`;
  const requestPayload = {
    mode: 'local' as const,
    rpcUrl: chain.rpcUrl,
    chainId: chain.id,
    transaction: buildBridgeTransactionPayload(transaction, fromAddress),
    analysisOptions: {
      quickMode: true,
      collectCallTree: true,
      collectEvents: true,
      collectStorageDiff: true,
    },
  };

  try {
    const response = await axios.post(url, requestPayload, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response?.data || typeof response.data !== 'object') {
      console.warn(
        '[simulation] Simulator bridge returned unexpected payload:',
        response?.data
      );
      return null;
    }

    return normalizeBridgeResult(
      response.data as BridgeSimulationResponsePayload
    );
  } catch (error: any) {
    const message =
      error?.code === 'ECONNREFUSED'
        ? 'Connection refused'
        : error?.message || 'Unknown error';
    if (!hasLoggedSimulatorBridgeFailure) {
      console.error(
        `[simulation] Simulator bridge request failed at ${url}: ${message}`
      );
      hasLoggedSimulatorBridgeFailure = true;
    }
    throw new Error(
      `[simulation] Simulator bridge request failed: ${message}`
    );
  }
};

// Enhanced simulation that tries to actually call the contract
export const simulateTransaction = async (
  transaction: TransactionRequest,
  chain: Chain,
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

    const bridgeResult = await trySimulatorBridge(
      transaction,
      chain,
      fromAddress
    );
    if (bridgeResult) {
      return bridgeResult;
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
    const revertDetails = extractRevertDetails(error);
    const fallbackMessage =
      revertDetails.message ||
      parseReasonFromString(error?.message) ||
      'Simulation failed';
    return {
      mode: 'rpc',
      success: false,
      error: fallbackMessage,
      warnings: [],
      revertReason: revertDetails.message ?? fallbackMessage ?? null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
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
      const revertDetails = extractRevertDetails(error);
      const fallbackMessage =
        revertDetails.message ||
        parseReasonFromString(error?.message) ||
        'Gas estimation failed - transaction will likely revert';

      return {
        mode: 'rpc',
        success: false,
        error: fallbackMessage,
        warnings: [],
        revertReason: revertDetails.message ?? fallbackMessage ?? null,
        gasUsed: '0',
        gasLimitSuggested: transaction.gasLimit ?? null,
        rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
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
      const revertDetails = extractRevertDetails(callError);
      const fallbackMessage =
        revertDetails.message ||
        parseReasonFromString(callError?.message) ||
        'Transaction call failed';
      return {
        mode: 'rpc',
        success: false,
        error: fallbackMessage,
        warnings: [],
        revertReason: revertDetails.message ?? fallbackMessage ?? null,
        gasUsed: '0',
        gasLimitSuggested: transaction.gasLimit ?? null,
        rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
      };
    }

  } catch (error: any) {
    console.error('Realistic simulation failed:', error);
    const revertDetails = extractRevertDetails(error);
    const fallbackMessage =
      revertDetails.message ||
      parseReasonFromString(error?.message) ||
      'Simulation failed';
    return {
      mode: 'rpc',
      success: false,
      error: fallbackMessage,
      warnings: [],
      revertReason: revertDetails.message ?? fallbackMessage ?? null,
      gasUsed: null,
      gasLimitSuggested: null,
      rawTrace: buildFailureRawTrace(revertDetails, fallbackMessage),
    };
  }
};

interface RevertDetails {
  message: string | null;
  encodedData: string | null;
  errorSignature: string | null;
  errorName: string | null;
  errorArgs: unknown[] | null;
}

const PANIC_CODE_MESSAGES: Record<number, string> = {
  0x01: 'Assertion failed',
  0x11: 'Arithmetic overflow or underflow',
  0x12: 'Division or modulo by zero',
  0x21: 'Invalid enum value',
  0x22: 'Incorrect storage byte array',
  0x31: 'Pop on empty array',
  0x32: 'Array out-of-bounds access',
  0x41: 'Memory allocation overflow',
  0x51: 'Invalid internal function',
};

function parseReasonFromString(input?: string | null): string | null {
  if (!input) {
    return null;
  }

  const cleaned = `${input}`.replace(/\0/g, '').trim();
  if (!cleaned) {
    return null;
  }

  const patterns = [
    /execution reverted(?::|\s)+(.*)$/i,
    /reverted with reason string\s*"(.*)"/i,
    /revert(?:ed)?(?::|\s)+(.*)$/i,
    /VM Exception while processing transaction:\s*(?:revert|panic)\s*(.*)$/i,
    /reason[:=]\s*"?([^"]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].replace(/(^[:\s"]+)|([:"\s]+$)/g, '').trim();
      if (candidate) {
        return candidate;
      }
    }
  }

  if (/execution reverted/i.test(cleaned)) {
    return 'Execution reverted';
  }

  if (/transfer amount exceeds balance/i.test(cleaned)) {
    return 'Transfer amount exceeds balance';
  }

  if (/insufficient allowance/i.test(cleaned)) {
    return 'Insufficient allowance';
  }

  if (/insufficient funds/i.test(cleaned)) {
    return 'Insufficient funds';
  }

  return null;
}

function normalizeErrorArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (ethers.BigNumber.isBigNumber(arg)) {
      return arg.toString();
    }
    if (typeof arg === 'bigint') {
      return arg.toString();
    }
    return arg;
  });
}

const HEX_DATA_REGEX = /0x[0-9a-fA-F]{8,}/;

function findRevertDataInError(error: any): string | null {
  if (!error) {
    return null;
  }

  const visited = new Set<any>();
  const stack: any[] = [error];
  let iterations = 0;

  while (stack.length && iterations < 200) {
    iterations += 1;
    const current = stack.pop();
    if (current === null || current === undefined) {
      continue;
    }

    if (typeof current === 'string') {
      const match = current.match(HEX_DATA_REGEX);
      if (match && match[0]) {
        return ensureHexPrefix(match[0]);
      }
      continue;
    }

    if (typeof current !== 'object') {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (key === 'config' || key === 'request') {
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = trimmed.match(HEX_DATA_REGEX);
        if (match && match[0]) {
          return ensureHexPrefix(match[0]);
        }

        if (
          (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
          trimmed.length <= 10_000
        ) {
          try {
            const parsed = JSON.parse(trimmed);
            stack.push(parsed);
          } catch {
            // ignore JSON parse errors
          }
        }
      } else if (typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return null;
}

function decodeRevertData(hexData: string): {
  message: string | null;
  signature: string | null;
} {
  if (!hexData) {
    return { message: null, signature: null };
  }

  const normalized = ensureHexPrefix(hexData);
  if (normalized.length < 10) {
    return { message: null, signature: null };
  }

  if (normalized.startsWith('0x08c379a0')) {
    const encodedReason = `0x${normalized.slice(10)}`;
    try {
      const [reason] = ethers.utils.defaultAbiCoder.decode(
        ['string'],
        encodedReason
      );
      return {
        message: typeof reason === 'string' ? reason : null,
        signature: 'Error(string)',
      };
    } catch (decodeError) {
      console.debug('Failed to decode revert reason string:', decodeError);
    }
  }

  if (normalized.startsWith('0x4e487b71')) {
    const codeHex = normalized.slice(10).padStart(64, '0').slice(0, 64);
    const code = parseInt(codeHex, 16);
    const description = PANIC_CODE_MESSAGES[code];
    const message = description
      ? `Panic (0x${code.toString(16)}): ${description}`
      : `Panic code 0x${code.toString(16)}`;
    return { message, signature: 'Panic(uint256)' };
  }

  return { message: null, signature: null };
}

function extractRevertDetails(error: any): RevertDetails {
  const encodedData = findRevertDataInError(error);
  const decoded = encodedData ? decodeRevertData(encodedData) : null;

  const errorName =
    typeof error?.errorName === 'string' ? error.errorName : null;
  const errorSignature =
    typeof error?.errorSignature === 'string'
      ? error.errorSignature
      : decoded?.signature ?? null;

  const rawArgs =
    Array.isArray(error?.errorArgs)
      ? error.errorArgs
      : Array.isArray(error?.args)
      ? error.args
      : null;
  const errorArgs = rawArgs ? normalizeErrorArgs(rawArgs) : null;

  const messageCandidates = [
    decoded?.message,
    parseReasonFromString(
      typeof error === 'string' ? (error as string) : undefined
    ),
    parseReasonFromString(error?.reason),
    parseReasonFromString(error?.shortMessage),
    parseReasonFromString(error?.message),
    parseReasonFromString(error?.error?.message),
    parseReasonFromString(error?.error?.reason),
    parseReasonFromString(error?.data?.message),
    parseReasonFromString(error?.data?.reason),
    parseReasonFromString(
      typeof error?.body === 'string' ? error.body : undefined
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let message = messageCandidates.length > 0 ? messageCandidates[0] : null;

  if (!message && errorName) {
    const formattedArgs = errorArgs
      ? errorArgs.map((arg) => `${arg}`).join(', ')
      : '';
    message = formattedArgs
      ? `${errorName}(${formattedArgs})`
      : `${errorName}()`;
  }

  if (!message && errorSignature) {
    message = `Reverted with ${errorSignature}`;
  }

  if (!message && encodedData) {
    message = `Reverted with data ${encodedData}`;
  }

  return {
    message,
    encodedData,
    errorSignature,
    errorName,
    errorArgs,
  };
}

function buildFailureRawTrace(
  details: RevertDetails,
  fallbackMessage?: string
): Record<string, unknown> | null {
  const trace: Record<string, unknown> = {};

  if (fallbackMessage) {
    trace.errorMessage = fallbackMessage;
  }

  if (details.message && details.message !== fallbackMessage) {
    trace.decodedReason = details.message;
  }

  if (details.encodedData) {
    trace.revertData = details.encodedData;
  }

  if (details.errorSignature) {
    trace.errorSignature = details.errorSignature;
  }

  if (details.errorName) {
    trace.errorName = details.errorName;
  }

  if (details.errorArgs && details.errorArgs.length > 0) {
    trace.errorArgs = details.errorArgs;
  }

  return Object.keys(trace).length > 0 ? trace : null;
}

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
