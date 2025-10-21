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
