import { hashTypedData, type Address, type Hex } from 'viem';
import type { SafeDomain, SafeTx, SafeVersion } from './types';

export const SAFE_TX_TYPEHASH =
  '0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8' as Hex;

const SAFE_TX_STRUCT = [
  { name: 'to', type: 'address' },
  { name: 'value', type: 'uint256' },
  { name: 'data', type: 'bytes' },
  { name: 'operation', type: 'uint8' },
  { name: 'safeTxGas', type: 'uint256' },
  { name: 'baseGas', type: 'uint256' },
  { name: 'gasPrice', type: 'uint256' },
  { name: 'gasToken', type: 'address' },
  { name: 'refundReceiver', type: 'address' },
  { name: 'nonce', type: 'uint256' },
] as const;

export function buildSafeDomain(args: {
  chainId: number;
  safeAddress: Address;
  version: SafeVersion;
}): SafeDomain {
  return {
    chainId: args.chainId,
    verifyingContract: args.safeAddress,
    version: args.version,
  };
}

type TxServiceShape = {
  to: string;
  value: string | number;
  data?: string | null;
  operation: 0 | 1;
  safeTxGas: string | number;
  baseGas: string | number;
  gasPrice: string | number;
  gasToken: string;
  refundReceiver: string;
  nonce: string | number;
};

function toBig(v: string | number): bigint {
  if (typeof v === 'number') return BigInt(v);
  if (/^\d+$/.test(v)) return BigInt(v);
  if (/^0x[0-9a-f]+$/i.test(v)) return BigInt(v);
  throw new Error(`safeTxHash: cannot parse "${v}" as uint256`);
}

export function normalizeSafeTx(raw: TxServiceShape): SafeTx {
  return {
    to: raw.to as Address,
    value: toBig(raw.value),
    data: (raw.data ?? '0x') as Hex,
    operation: raw.operation,
    safeTxGas: toBig(raw.safeTxGas),
    baseGas: toBig(raw.baseGas),
    gasPrice: toBig(raw.gasPrice),
    gasToken: raw.gasToken as Address,
    refundReceiver: raw.refundReceiver as Address,
    nonce: toBig(raw.nonce),
  };
}

/**
 * Versions for which the current (1.3+) typed-data struct and domain shape
 * (chainId + verifyingContract, no `name`, no `version` field) produce the
 * canonical safeTxHash. Legacy versions used a different typehash and omit
 * chainId — we refuse to compute for those rather than returning a bogus hash.
 */
const SUPPORTED_HASH_VERSIONS: ReadonlySet<SafeVersion> = new Set([
  '1.4.1',
  '1.4.1-l2',
  '1.3.0-l1',
  '1.3.0-l2',
]);

export function isHashVersionSupported(version: SafeVersion): boolean {
  return SUPPORTED_HASH_VERSIONS.has(version);
}

export function computeSafeTxHash(
  raw: TxServiceShape | SafeTx,
  domain: SafeDomain,
): Hex {
  if (!isHashVersionSupported(domain.version)) {
    throw new Error(
      `safeTxHash: refusing to compute hash for Safe version ${domain.version}; only 1.3.x and 1.4.x are supported.`,
    );
  }
  const tx: SafeTx =
    typeof (raw as SafeTx).value === 'bigint'
      ? (raw as SafeTx)
      : normalizeSafeTx(raw as TxServiceShape);
  return hashTypedData({
    domain: {
      chainId: domain.chainId,
      verifyingContract: domain.verifyingContract,
    },
    types: { SafeTx: [...SAFE_TX_STRUCT] },
    primaryType: 'SafeTx',
    message: tx,
  });
}
