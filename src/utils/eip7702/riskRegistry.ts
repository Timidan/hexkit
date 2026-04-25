import registry from '../../data/delegate-risk-registry.json';

export type DelegateCategory = 'wallet' | 'drainer' | 'session' | 'unknown';

export const CATEGORY_SET = new Set<DelegateCategory>([
  'wallet',
  'drainer',
  'session',
  'unknown',
]);

export type RegistryEntry = {
  address: string;
  name: string;
  category: DelegateCategory;
  verified: boolean;
  notes: string;
};

const entries: RegistryEntry[] = (registry.entries as RegistryEntry[]).map((e) => ({
  ...e,
  address: e.address.toLowerCase(),
}));

const byAddress = new Map<string, RegistryEntry>(
  entries.map((e) => [e.address, e]),
);

export function lookupDelegate(address: string): RegistryEntry | null {
  if (!address) return null;
  return byAddress.get(address.toLowerCase()) ?? null;
}

export function listEntries(): RegistryEntry[] {
  return entries;
}
