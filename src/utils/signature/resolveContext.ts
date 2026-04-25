import type { Chain, PublicClient } from 'viem';
import type {
  RenderContext,
  RiskSignal,
  TypedDataPayload,
  TypedDataTypes,
} from './types';

export type ContractResolverLike = {
  resolve: (
    address: string,
    chain: Chain,
    options?: { signal?: AbortSignal },
  ) => Promise<{
    name?: string | null;
    tokenInfo?: { symbol?: string; decimals?: number; name?: string };
  }>;
};

type BuildRenderContextOptions = {
  chainId: number;
  chain: Chain;
  contractResolver: ContractResolverLike;
  nowSec?: number;
  signal?: AbortSignal;
};

function collectAddresses(
  message: unknown,
  type: string,
  types: TypedDataTypes,
  out: Set<string>,
): void {
  const arrayMatch = type.match(/^(.*?)(\[\d*\])$/);
  if (arrayMatch) {
    if (!Array.isArray(message)) return;
    for (const item of message) {
      collectAddresses(item, arrayMatch[1], types, out);
    }
    return;
  }
  if (types[type]) {
    if (!message || typeof message !== 'object') return;
    const rec = message as Record<string, unknown>;
    for (const f of types[type]) {
      collectAddresses(rec[f.name], f.type, types, out);
    }
    return;
  }
  if (type === 'address' && typeof message === 'string') {
    if (/^0x[0-9a-fA-F]{40}$/.test(message)) {
      out.add(message.toLowerCase());
    }
  }
}

function addressesInPayload(payload: TypedDataPayload): string[] {
  const set = new Set<string>();
  const rootFields = payload.types?.[payload.primaryType] ?? [];
  for (const f of rootFields) {
    collectAddresses(
      (payload.message as Record<string, unknown>)[f.name],
      f.type,
      payload.types,
      set,
    );
  }
  if (payload.domain?.verifyingContract) {
    const vc = payload.domain.verifyingContract;
    if (/^0x[0-9a-fA-F]{40}$/.test(vc)) set.add(vc.toLowerCase());
  }
  return [...set];
}

export async function buildRenderContext(
  payload: TypedDataPayload,
  opts: BuildRenderContextOptions,
): Promise<RenderContext> {
  const addresses = addressesInPayload(payload);
  const tokenInfo = new Map<string, { symbol?: string; decimals?: number }>();
  const contractInfo = new Map<string, { name?: string }>();

  const results = await Promise.all(
    addresses.map(async (addr) => {
      try {
        const r = await opts.contractResolver.resolve(addr, opts.chain, {
          signal: opts.signal,
        });
        return { addr, r };
      } catch {
        return { addr, r: null };
      }
    }),
  );

  for (const { addr, r } of results) {
    if (!r) continue;
    if (r.tokenInfo && (r.tokenInfo.symbol || r.tokenInfo.decimals !== undefined)) {
      tokenInfo.set(addr, {
        symbol: r.tokenInfo.symbol,
        decimals: r.tokenInfo.decimals,
      });
    }
    if (r.name) {
      contractInfo.set(addr, { name: r.name });
    }
  }

  return {
    chainId: opts.chainId,
    nowSec: opts.nowSec,
    tokenInfo,
    contractInfo,
  };
}

const ERC2612_NONCES_ABI = [
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const PERMIT2_ALLOWANCE_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [
      { name: 'amount', type: 'uint160' },
      { name: 'expiration', type: 'uint48' },
      { name: 'nonce', type: 'uint48' },
    ],
  },
] as const;

// ERC-2612 and Permit2 both enforce the signed nonce equal the current on-chain
// value — anything else (behind or ahead) is unusable. Surface both as warn so
// the user sees why their wallet would reject.
function nonceSignal(
  messageNonce: bigint,
  onChain: bigint,
  field: string,
): RiskSignal | null {
  if (messageNonce === onChain) return null;
  if (messageNonce < onChain) {
    return {
      level: 'warn',
      code: 'NONCE_ALREADY_USED',
      message: `Signed nonce ${messageNonce} is behind the on-chain nonce ${onChain}; this signature is stale.`,
      field,
    };
  }
  return {
    level: 'warn',
    code: 'NONCE_AHEAD',
    message: `Signed nonce ${messageNonce} does not match on-chain nonce ${onChain}; the permit will revert.`,
    field,
  };
}

export async function checkLiveNonce(
  payload: TypedDataPayload,
  publicClient: PublicClient,
  /** Owner/signer address. Required for Permit2 (message has no `owner`). */
  ownerOverride?: string,
): Promise<RiskSignal | null> {
  const primary = payload.primaryType;
  const message = payload.message as Record<string, unknown>;

  if (primary === 'Permit' && payload.domain?.verifyingContract) {
    const owner = ownerOverride ?? (message.owner as string | undefined);
    const nonce = message.nonce;
    if (typeof owner !== 'string' || nonce === undefined) return null;
    try {
      const onChain = (await publicClient.readContract({
        address: payload.domain.verifyingContract as `0x${string}`,
        abi: ERC2612_NONCES_ABI,
        functionName: 'nonces',
        args: [owner as `0x${string}`],
      })) as bigint;
      return nonceSignal(BigInt(nonce as string | number), onChain, 'nonce');
    } catch {
      return null;
    }
  }

  if (
    (primary === 'PermitSingle' || primary === 'PermitBatch') &&
    payload.domain?.verifyingContract
  ) {
    const owner =
      ownerOverride ??
      (message.owner as string | undefined) ??
      (message.signer as string | undefined);
    if (!owner) return null;
    const details =
      primary === 'PermitSingle'
        ? [message.details]
        : Array.isArray(message.details)
          ? message.details
          : [];
    const spender = message.spender as string | undefined;
    if (!spender) return null;
    for (const d of details) {
      const rec = d as Record<string, unknown> | undefined;
      if (!rec) continue;
      const token = rec.token as string | undefined;
      const nonce = rec.nonce;
      if (!token || nonce === undefined) continue;
      try {
        const res = (await publicClient.readContract({
          address: payload.domain.verifyingContract as `0x${string}`,
          abi: PERMIT2_ALLOWANCE_ABI,
          functionName: 'allowance',
          args: [
            owner as `0x${string}`,
            token as `0x${string}`,
            spender as `0x${string}`,
          ],
        })) as readonly [bigint, number, number];
        const onChainNonce = BigInt(res[2]);
        const sig = nonceSignal(
          BigInt(nonce as string | number),
          onChainNonce,
          'details.nonce',
        );
        if (sig) return sig;
      } catch {
        continue;
      }
    }
  }
  return null;
}
