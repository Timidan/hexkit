import type { Address, Hex } from 'viem';

export type SafeVersion =
  | '1.4.1'
  | '1.4.1-l2'
  | '1.3.0-l1'
  | '1.3.0-l2'
  | '1.0'
  | 'unknown';

export interface SafeDomain {
  chainId: number;
  verifyingContract: Address;
  version: SafeVersion;
}

export interface SafeTx {
  to: Address;
  value: bigint;
  data: Hex;
  operation: 0 | 1;
  safeTxGas: bigint;
  baseGas: bigint;
  gasPrice: bigint;
  gasToken: Address;
  refundReceiver: Address;
  nonce: bigint;
}

export interface SafeConfirmation {
  owner: Address;
  signature: Hex;
  signatureType?: string;
}

export interface MultiSendSubCall {
  operation: 0 | 1;
  to: Address;
  value: bigint;
  data: Hex;
}

export type RiskLevel = 'info' | 'warn' | 'danger';

export interface RiskSignal {
  level: RiskLevel;
  code: string;
  message: string;
  field?: string;
}

export interface VerificationReport {
  safeTxHash: Hex;
  recovered: Array<{
    signer: Address;
    type: 'eoa' | 'eth_sign' | 'contract' | 'approved_hash';
    isOwner: boolean;
  }>;
  multiSendSubCalls: MultiSendSubCall[] | null;
  signals: RiskSignal[];
}
