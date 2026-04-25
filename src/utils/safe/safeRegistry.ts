import type { SafeVersion } from './types';

// Canonical Safe singletons across chains. Addresses lifted from
// safe-global/safe-deployments (checked 2026). A single version can have
// multiple canonical singletons (e.g. v1.3.0-l2 shipped at two addresses
// across chains), so we map each version to a list.
export const SAFE_SINGLETONS: Record<Exclude<SafeVersion, 'unknown'>, string[]> = {
  '1.4.1': ['0x41675C099F32341bf84BFc5382aF534df5C7461a'],
  '1.4.1-l2': ['0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'],
  '1.3.0-l1': ['0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552'],
  '1.3.0-l2': [
    '0xfb1bffC9d739B8D520DaF37dF666da4C687191EA',
    '0x3E5c63644E683549055b9Be8653de26E0B4CD36E',
  ],
  '1.0': ['0x8942595A2dC5181Df0465AF0D7be08c8f23C93af'],
};

export function allKnownSingletons(): string[] {
  return Object.values(SAFE_SINGLETONS).flat();
}

// MultiSendCallOnly addresses. These disallow DELEGATECALL from inside the
// batch — the ONLY form safe to treat as trusted under Safe delegatecall.
export const MULTISEND_CALL_ONLY_ADDRESSES: string[] = [
  // v1.4.1
  '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
  // v1.3.0
  '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D',
];

// Legacy (unsafe) MultiSend — the one that permits inner DELEGATECALL.
export const MULTISEND_UNSAFE_ADDRESSES: string[] = [
  '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526',
  '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
];

export const MULTISEND_ADDRESSES: string[] = [
  ...MULTISEND_CALL_ONLY_ADDRESSES,
  ...MULTISEND_UNSAFE_ADDRESSES,
];

function includesLowercase(list: string[], addr: string): boolean {
  const a = addr.toLowerCase();
  return list.some((x) => x.toLowerCase() === a);
}

export function isApprovedMultiSend(
  addr: string,
  opts: { allowUnsafe?: boolean } = {},
): boolean {
  if (includesLowercase(MULTISEND_CALL_ONLY_ADDRESSES, addr)) return true;
  if (opts.allowUnsafe && includesLowercase(MULTISEND_UNSAFE_ADDRESSES, addr)) {
    return true;
  }
  return false;
}

export function detectSingletonVersion(addr: string): SafeVersion {
  const a = addr.toLowerCase();
  for (const [ver, list] of Object.entries(SAFE_SINGLETONS) as Array<
    [Exclude<SafeVersion, 'unknown'>, string[]]
  >) {
    if (list.some((c) => c.toLowerCase() === a)) return ver;
  }
  return 'unknown';
}

export const DRAINER_REGISTRY: ReadonlySet<string> = new Set<string>();

export const TX_SERVICE_HOSTS: Record<number, string> = {
  1: 'safe-transaction-mainnet.safe.global',
  10: 'safe-transaction-optimism.safe.global',
  137: 'safe-transaction-polygon.safe.global',
  8453: 'safe-transaction-base.safe.global',
  42161: 'safe-transaction-arbitrum.safe.global',
};

export function txServiceHostForChain(chainId: number): string | null {
  return TX_SERVICE_HOSTS[chainId] ?? null;
}
