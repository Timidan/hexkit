import {
  hashMessage,
  recoverAddress,
  type Address,
  type Hex,
} from 'viem';

export type SafeSignatureType =
  | 'eoa'
  | 'eth_sign'
  | 'contract'
  | 'approved_hash';

export interface SplitSignature {
  r: Hex;
  s: Hex;
  v: number;
  type: SafeSignatureType;
  /** Owner encoded in r-slot for contract / approved-hash variants. */
  declaredOwner?: Address;
}

function hexSlice(hex: Hex, start: number, end: number): Hex {
  return (`0x${hex.slice(2 + start * 2, 2 + end * 2)}`) as Hex;
}

/**
 * Safe concatenates 65-byte chunks: r (32) | s (32) | v (1).
 *  - v ∈ {27,28} → normal EOA signature
 *  - v > 30 → eth_sign path (v = v-4, applied to "\x19Ethereum…"-prefixed digest)
 *  - v == 1 → approvedHash (owner encoded in r)
 *  - v == 0 → contract signature (EIP-1271); r = owner, s = offset into dynamic part
 */
export function splitConcatenatedSignatures(sigs: Hex): SplitSignature[] {
  if (!sigs.startsWith('0x')) {
    throw new Error('splitConcatenatedSignatures: expected 0x-prefixed hex');
  }
  const body = sigs.slice(2);
  if (body.length % 130 !== 0 && body.length < 130) {
    throw new Error('splitConcatenatedSignatures: length not a multiple of 65 bytes');
  }
  // We only parse the static portion (first n*65 bytes). Dynamic portions for
  // contract sigs follow but we don't need them for typing.
  const out: SplitSignature[] = [];
  const staticCount = Math.floor(body.length / 130);
  for (let i = 0; i < staticCount; i++) {
    const chunk = `0x${body.slice(i * 130, (i + 1) * 130)}` as Hex;
    const r = hexSlice(chunk, 0, 32);
    const s = hexSlice(chunk, 32, 64);
    const v = parseInt(chunk.slice(130, 132), 16);
    let type: SafeSignatureType = 'eoa';
    let declaredOwner: Address | undefined;
    if (v === 0) {
      type = 'contract';
      declaredOwner = (`0x${r.slice(-40)}`) as Address;
    } else if (v === 1) {
      type = 'approved_hash';
      declaredOwner = (`0x${r.slice(-40)}`) as Address;
    } else if (v > 30) {
      type = 'eth_sign';
    }
    out.push({ r, s, v, type, declaredOwner });
  }
  return out;
}

export async function recoverSafeSigners(args: {
  safeTxHash: Hex;
  signatures: Hex;
}): Promise<Array<{ signer: Address; type: SafeSignatureType }>> {
  const chunks = splitConcatenatedSignatures(args.signatures);
  const recovered: Array<{ signer: Address; type: SafeSignatureType }> = [];
  for (const c of chunks) {
    if (c.type === 'contract' || c.type === 'approved_hash') {
      if (c.declaredOwner) {
        recovered.push({ signer: c.declaredOwner, type: c.type });
      }
      continue;
    }
    if (c.type === 'eth_sign') {
      const adjustedV = c.v - 4;
      const signature =
        (c.r + c.s.slice(2) + adjustedV.toString(16).padStart(2, '0')) as Hex;
      const signer = await recoverAddress({
        hash: hashMessage({ raw: args.safeTxHash }),
        signature,
      });
      recovered.push({ signer, type: 'eth_sign' });
      continue;
    }
    const signature = (c.r + c.s.slice(2) + c.v.toString(16).padStart(2, '0')) as Hex;
    const signer = await recoverAddress({
      hash: args.safeTxHash,
      signature,
    });
    recovered.push({ signer, type: 'eoa' });
  }
  return recovered;
}
