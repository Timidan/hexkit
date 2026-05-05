// Sibling to the EVM `web3-toolkit-saved-contracts` key — partitioned by
// family so the entry shape can carry Starknet-only fields (classHash, network).

const STORAGE_KEY = "web3-toolkit-saved-contracts:starknet";
const MAX_ENTRIES = 50;

export interface StarknetSavedContract {
  name?: string;
  contractAddress: string;
  classHash: string;
  network: "mainnet" | "sepolia";
  savedAt: number;
  abi?: unknown;
}

function isStarknetSavedContract(input: unknown): input is StarknetSavedContract {
  if (!input || typeof input !== "object") return false;
  const e = input as Record<string, unknown>;
  return (
    typeof e.contractAddress === "string" &&
    typeof e.classHash === "string" &&
    (e.network === "mainnet" || e.network === "sepolia") &&
    typeof e.savedAt === "number"
  );
}

function normalize(entries: StarknetSavedContract[]): StarknetSavedContract[] {
  const sorted = [...entries].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  const seen = new Set<string>();
  const deduped: StarknetSavedContract[] = [];
  for (const entry of sorted) {
    if (!entry?.contractAddress) continue;
    // Key by network + address so the same address on mainnet vs sepolia
    // are kept as separate entries rather than collapsing.
    const key = `${entry.network}:${entry.contractAddress.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
    if (deduped.length >= MAX_ENTRIES) break;
  }
  return deduped;
}

function readRaw(): StarknetSavedContract[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(isStarknetSavedContract);
  } catch {
    return [];
  }
}

function writeRaw(entries: StarknetSavedContract[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export function loadSavedStarknetContracts(): StarknetSavedContract[] {
  const normalized = normalize(readRaw());
  writeRaw(normalized);
  return normalized;
}

export function saveStarknetContract(entry: StarknetSavedContract): void {
  const existing = readRaw();
  const key = `${entry.network}:${entry.contractAddress.toLowerCase()}`;
  const without = existing.filter(
    (e) => `${e.network}:${e.contractAddress.toLowerCase()}` !== key,
  );
  const updated = normalize([{ ...entry, savedAt: entry.savedAt || Date.now() }, ...without]);
  writeRaw(updated);
}

export function removeStarknetSavedContract(contractAddress: string): void {
  const existing = readRaw();
  const key = contractAddress.toLowerCase();
  const next = existing.filter(
    (e) => e.contractAddress.toLowerCase() !== key,
  );
  writeRaw(next);
}

export function clearStarknetSavedContracts(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

export function shortAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
