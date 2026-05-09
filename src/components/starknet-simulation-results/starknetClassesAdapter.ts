// Starknet → EDB ContractsTab "contracts[]" shape adapter.
//
// EDB's <ContractsTab> reads `(result as any).contracts` — an `any[]` of
// row records (`address`, `name?`, `verified`, `sourceProvider`,
// `fileCount?`). On Starknet a row is a unique class hash (multiple
// contracts can share a class) so we deduplicate by `classHash` and
// repurpose:
//   - `address`     → the class hash (we still navigate to the class
//                     explorer page)
//   - `name`        → the class label (KNOWN_CLASS_HASHES table)
//   - `verified`    → true iff the bridge `/class` endpoint returned a
//                     non-empty ABI for this class. Cached lookups via
//                     the same `classInfoCache` SourcePane uses.
//   - `sourceProvider` → 'voyager' for verified classes, null otherwise.
//                     <SourceBadge> needs the 'voyager' enum (see
//                     ContractBadges.tsx) to render the chip label.
//   - `fileCount`   → repurposed as the call count (number of frames
//                     that hit this class in the trace).
//
// The adapter also returns a `classToContracts` map: each class hash
// points at the list of contract addresses observed sharing it during
// the trace. The class explorer page reads this to show "called by
// contracts" beneath the ABI tabs.

import type {
  FunctionInvocation,
  SimulationResult,
} from "@/chains/starknet/simulatorTypes";
import { classLabel, walkInvocations } from "./decoders";

export type StarknetClassRowSourceProvider = "voyager" | null;

export interface StarknetClassRow {
  /** Reused as the row's primary identifier. We pass the class hash here
   *  because EDB's column header reads "Contract" but on Starknet the
   *  row is a unique class. */
  address: string;
  /** Class label (e.g. "Argent Account v0.5.0", "STRK"). Falls back to a
   *  shortened class hash inside the ContractsTab renderer. */
  name?: string;
  /** True iff the bridge `/class` endpoint surfaced a non-empty ABI. */
  verified: boolean;
  /** Always 'voyager' when verified; null otherwise. <SourceBadge> needs
   *  the enum to render the badge variant. */
  sourceProvider: StarknetClassRowSourceProvider;
  /** Repurposed as call count — number of frames that touched this class
   *  during the trace. */
  fileCount: number;
  /** External canonical explorer URL for the class hash. */
  explorerUrl?: string;
  /** Human-readable explorer name for link labels. */
  explorerName?: string;
}

export interface StarknetClassesAdapterResult {
  /** Row array shaped like `(SimulationResult).contracts` so we can
   *  inject it via the result-shape adapter. */
  contracts: StarknetClassRow[];
  /** classHash → list of unique contract addresses observed during
   *  the trace that share this class. */
  classToContracts: Map<string, string[]>;
}

/** ABI cache hint — populated by SourcePane after a `/class` fetch
 *  succeeds. The adapter peeks at this map to decide whether the
 *  verified pill should show on first paint without itself triggering
 *  a network round-trip. */
const VERIFIED_CLASS_HINT = new Set<string>();

/** Mark a class as verified once SourcePane successfully loads its
 *  ABI. Called as a side-effect from the SourcePane fetch path. The
 *  adapter is otherwise pure. */
export function markClassVerified(classHash: string): void {
  if (!classHash) return;
  VERIFIED_CLASS_HINT.add(classHash.toLowerCase());
}

export function adaptStarknetClasses(
  result: SimulationResult,
): StarknetClassesAdapterResult {
  const callCount = new Map<string, number>();
  const contractsByClass = new Map<string, Set<string>>();

  for (const f of walkInvocations(result)) {
    const cls = f.classHash;
    if (!cls) continue;
    const key = cls.toLowerCase();
    callCount.set(key, (callCount.get(key) ?? 0) + 1);
    const addrs = contractsByClass.get(key) ?? new Set<string>();
    if (f.contractAddress) addrs.add(f.contractAddress.toLowerCase());
    contractsByClass.set(key, addrs);
  }

  const rows: StarknetClassRow[] = Array.from(callCount.entries()).map(
    ([classHash, count]) => {
      const verified = VERIFIED_CLASS_HINT.has(classHash);
      const label = classLabel(classHash);
      return {
        address: classHash,
        name: label ?? undefined,
        verified,
        sourceProvider: verified ? "voyager" : null,
        fileCount: count,
      };
    },
  );

  rows.sort((a, b) => {
    // Verified first, then by call count desc, then label / hash for
    // stability across renders.
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    if (a.fileCount !== b.fileCount) return b.fileCount - a.fileCount;
    return (a.name || a.address).localeCompare(b.name || b.address);
  });

  const classToContracts = new Map<string, string[]>();
  for (const [k, set] of contractsByClass.entries()) {
    classToContracts.set(k, Array.from(set));
  }

  return { contracts: rows, classToContracts };
}

/** Picks a representative `(rawTrace, contracts)` shape EDB's
 *  ContractsTab can consume directly. The component itself reads
 *  `(result as any).contracts` and `(result as any).rawTrace`, so we
 *  layer the rows on top of the original Starknet result without
 *  mutating it. */
export function buildEdbContractsResult(
  result: SimulationResult,
  rows: StarknetClassRow[],
): unknown {
  return {
    ...result,
    chainId: 0, // Starknet has no EVM chainId — explorerBase[0] falls back to mainnet, but we override the click handler so this is unused.
    contracts: rows,
    rawTrace: null,
  };
}

/** Pull every frame's classHash → list of contract addresses for the
 *  given simulation result. Standalone helper so the explorer page can
 *  re-derive the same map without re-running the full adapter. */
export function collectContractsForClass(
  result: SimulationResult,
  classHash: string,
): string[] {
  const target = classHash.toLowerCase();
  const out = new Set<string>();
  for (const f of walkInvocations(result)) {
    if (!f.classHash) continue;
    if (f.classHash.toLowerCase() !== target) continue;
    if (f.contractAddress) out.add(f.contractAddress);
  }
  return Array.from(out);
}

/** Public test hook — clears the verified-class hint set so unit tests
 *  start from a known state. Production code never calls this. */
export function __resetVerifiedClassHintForTests(): void {
  VERIFIED_CLASS_HINT.clear();
}

/** Returns the bare list of frames touching a given class. Used by the
 *  class explorer page to render the "Called by" section. */
export function framesForClass(
  result: SimulationResult,
  classHash: string,
): FunctionInvocation[] {
  const target = classHash.toLowerCase();
  const out: FunctionInvocation[] = [];
  for (const f of walkInvocations(result)) {
    if (f.classHash && f.classHash.toLowerCase() === target) out.push(f);
  }
  return out;
}
