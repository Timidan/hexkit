import type { Address, PublicClient } from 'viem';
import { getAddress } from 'viem';

export type DelegationDetection =
  | { hasDelegation: false }
  | { hasDelegation: true; delegate: Address };

// Per EIP-7702, a delegated EOA has bytecode of the form
// 0xef0100 || <20-byte-delegate-address> — 23 bytes (46 hex chars) total.
// The 0xef prefix is reserved-invalid in the EVM, so legitimate contract code
// cannot collide with this shape.
export async function detectDelegation(
  address: Address,
  client: Pick<PublicClient, 'getCode'>,
): Promise<DelegationDetection> {
  const code = await client.getCode({ address });
  if (!code || code.length !== 48) return { hasDelegation: false };
  if (!code.toLowerCase().startsWith('0xef0100')) return { hasDelegation: false };
  const delegate = getAddress(`0x${code.slice(8, 48)}`);
  return { hasDelegation: true, delegate };
}
