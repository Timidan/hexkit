import {
  hashTypedData,
  recoverTypedDataAddress,
  verifyTypedData,
  type Address,
  type Hex,
} from 'viem';
import type { TypedDataPayload } from './types';

function asViemTypes(types: TypedDataPayload['types']) {
  // viem ignores EIP712Domain inside its runtime types map; strip if present.
  const { EIP712Domain: _domain, ...rest } = types;
  void _domain;
  return rest as Parameters<typeof hashTypedData>[0]['types'];
}

export function computeHash(payload: TypedDataPayload): Hex {
  return hashTypedData({
    domain: payload.domain as Parameters<typeof hashTypedData>[0]['domain'],
    types: asViemTypes(payload.types),
    primaryType: payload.primaryType,
    message: payload.message,
  } as Parameters<typeof hashTypedData>[0]);
}

export async function recoverSigner(
  payload: TypedDataPayload,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({
    domain: payload.domain as Parameters<typeof hashTypedData>[0]['domain'],
    types: asViemTypes(payload.types),
    primaryType: payload.primaryType,
    message: payload.message,
    signature,
  } as Parameters<typeof recoverTypedDataAddress>[0]);
}

export async function verifyAgainst(
  payload: TypedDataPayload,
  signature: Hex,
  expected: Address,
): Promise<boolean> {
  return verifyTypedData({
    address: expected,
    domain: payload.domain as Parameters<typeof hashTypedData>[0]['domain'],
    types: asViemTypes(payload.types),
    primaryType: payload.primaryType,
    message: payload.message,
    signature,
  } as Parameters<typeof verifyTypedData>[0]);
}
