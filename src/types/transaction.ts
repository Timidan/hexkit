export interface WalletInfo {
  name: string;
  icon: string;
  isInstalled: boolean;
  isConnected: boolean;
  accounts: string[];
  address: string; // Add address property
  chainId: string;
  provider?: any;
  signer?: any; // Add signer property
}

export interface TransactionRequest {
  to: string;
  data: string;
  value?: string;
  gasLimit?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  type?: number;
  functionName?: string; // Optional function name for display purposes
}

export interface SimulationResult {
  mode: 'onchain' | 'local' | 'rpc';
  success: boolean;
  error?: string | null;
  warnings?: string[];
  revertReason?: string | null;
  gasUsed?: string | null;
  gasLimitSuggested?: string | null;
  rawTrace?: unknown;
  // Transaction metadata
  from?: string | null;
  to?: string | null;
  data?: string | null;
  value?: string | null;
  blockNumber?: string | number | null;
  nonce?: number | null;
  functionName?: string | null;
  timestamp?: number | null; // Block timestamp in seconds
  // Gas pricing (EIP-1559 and legacy)
  gasPrice?: string | null; // Legacy gas price or effective gas price
  maxFeePerGas?: string | null; // EIP-1559 max fee
  maxPriorityFeePerGas?: string | null; // EIP-1559 priority fee
  baseFeePerGas?: string | null; // EIP-1559 base fee from block
  effectiveGasPrice?: string | null; // Actual gas price used
  // Transaction type
  type?: number | null; // 0 = Legacy, 1 = EIP-2930, 2 = EIP-1559
}

export interface AssetChange {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  changeType: 'RECEIVE' | 'SEND' | 'APPROVE';
  rawAmount: string;
  usdValue?: string;
}

export interface EventLog {
  address: string;
  topics: string[];
  data: string;
  decoded?: {
    name: string;
    signature: string;
    params: Array<{
      name: string;
      type: string;
      value: any;
    }>;
  };
}

export interface CallTrace {
  from: string;
  to: string;
  input: string;
  output: string;
  gasUsed: string;
  type: string;
  calls?: CallTrace[];
}

export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  gasUsed: string;
  effectiveGasPrice: string;
  status: number;
  explorerUrl: string;
}
