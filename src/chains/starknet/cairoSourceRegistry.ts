// Hand-curated `class_hash → github raw URL` fallback for verified Cairo
// source. Used when the bridge's Voyager passthrough returns
// `verified:false` (no `VOYAGER_API_KEY` configured, or Voyager doesn't
// have the class). Each entry points at an open-source repo where the
// exact source for that on-chain class lives. raw.githubusercontent.com
// serves `Access-Control-Allow-Origin: *` so we can fetch directly from
// the FE without proxying through the bridge.
//
// Adding entries: pick the class_hash you see in a real trace, find the
// matching tag/branch in the project's repo, list the files the user
// should be able to read. The `mainFile` is what the SourcePane
// highlights by default.

import type {
  CairoSourceFile,
  CairoSourceNetwork,
  CairoSourceResponse,
} from "./cairoSourceClient";

interface RegistryEntry {
  label: string;
  /** github `org/repo`. */
  repo: string;
  /** Branch / tag / commit sha to fetch from. */
  ref: string;
  files: { path: string }[];
  /** Best-guess "main" file the SourcePane should anchor on. */
  mainFile?: string;
}

const ARGENT_ACCOUNT_030_FILES = [
  { path: "contracts/account/src/argent_account.cairo" },
  { path: "contracts/account/src/interface.cairo" },
  { path: "contracts/account/src/escape.cairo" },
  { path: "contracts/account/src/lib.cairo" },
  { path: "contracts/lib/src/asserts.cairo" },
  { path: "contracts/lib/src/calls.cairo" },
  { path: "contracts/lib/src/outside_execution.cairo" },
  { path: "contracts/lib/src/erc165.cairo" },
];

const ARGENT_ACCOUNT_031_FILES = [
  { path: "src/account/argent_account.cairo" },
  { path: "src/account/interface.cairo" },
  { path: "src/account/escape.cairo" },
  { path: "src/common/account.cairo" },
  { path: "src/common/asserts.cairo" },
  { path: "src/common/calls.cairo" },
  { path: "src/common/erc165.cairo" },
  { path: "src/common/outside_execution.cairo" },
  { path: "src/common/transaction_version.cairo" },
  { path: "src/common/upgrade.cairo" },
  { path: "src/lib.cairo" },
  { path: "Scarb.toml" },
];

const ARGENT_ACCOUNT_040_FILES = [
  { path: "src/presets/argent_account.cairo" },
  { path: "src/account/interface.cairo" },
  { path: "src/outside_execution/interface.cairo" },
  { path: "src/outside_execution/outside_execution.cairo" },
  { path: "src/outside_execution/outside_execution_hash.cairo" },
  { path: "src/session/interface.cairo" },
  { path: "src/session/session.cairo" },
  { path: "src/signer/eip191.cairo" },
  { path: "src/signer/signer_signature.cairo" },
  { path: "src/signer/webauthn.cairo" },
  { path: "src/upgrade/upgrade.cairo" },
  { path: "src/utils/calls.cairo" },
  { path: "src/utils/transaction_version.cairo" },
  { path: "src/lib.cairo" },
  { path: "Scarb.toml" },
];

const ARGENT_ACCOUNT_050_FILES = [
  { path: "src/multiowner_account/argent_account.cairo" },
  { path: "src/multiowner_account/account_interface.cairo" },
  { path: "src/multiowner_account/events.cairo" },
  { path: "src/multiowner_account/guardian_manager.cairo" },
  { path: "src/multiowner_account/owner_manager.cairo" },
  { path: "src/multiowner_account/recovery.cairo" },
  { path: "src/multiowner_account/upgrade_migration.cairo" },
  { path: "src/outside_execution/outside_execution.cairo" },
  { path: "src/outside_execution/outside_execution_hash.cairo" },
  { path: "src/session/session.cairo" },
  { path: "src/signer/eip191.cairo" },
  { path: "src/signer/signer_signature.cairo" },
  { path: "src/signer/webauthn.cairo" },
  { path: "src/upgrade.cairo" },
  { path: "src/utils/calls.cairo" },
  { path: "src/utils/transaction_version.cairo" },
  { path: "src/lib.cairo" },
  { path: "Scarb.toml" },
];

const AVNU_FORWARDER_FILES = [
  { path: "contracts/src/forwarder.cairo" },
  { path: "contracts/src/lib.cairo" },
  { path: "contracts/Scarb.toml" },
];

/** Lowercased class hash → registry entry. Keep keys lowercase to match
 *  the normalization in `cairoSourceClient`. */
const REGISTRY: Record<string, RegistryEntry> = {
  // Argent / Ready account classes — verified in
  // argentlabs/argent-contracts-starknet/deployments/account.txt. These
  // appear frequently in account-abstraction traces.
  "0x073414441639dcd11d1846f287650a00c60c416b9d3ba45d31c651672125b2c2": {
    label: "Argent Account v0.5.0",
    repo: "argentlabs/argent-contracts-starknet",
    ref: "v0.5.0",
    mainFile: "src/multiowner_account/argent_account.cairo",
    files: ARGENT_ACCOUNT_050_FILES,
  },
  "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f": {
    label: "Ready Account v0.4.0",
    repo: "argentlabs/argent-contracts-starknet",
    ref: "account-0.4.0",
    mainFile: "src/presets/argent_account.cairo",
    files: ARGENT_ACCOUNT_040_FILES,
  },
  "0x029927c8af6bccf3f6fda035981e765a7bdbf18a2dc0d630494f8758aa908e2b": {
    label: "Argent Account v0.3.1",
    repo: "argentlabs/argent-contracts-starknet",
    ref: "account-0.3.1",
    mainFile: "src/account/argent_account.cairo",
    files: ARGENT_ACCOUNT_031_FILES,
  },
  // Argent Account v0.3.0 — appears in mainnet traces as the dispatching
  // account contract for Argent X wallets that haven't upgraded to 0.4.x.
  "0x1a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003": {
    label: "Argent Account v0.3.0",
    repo: "argentlabs/argent-contracts-starknet",
    ref: "account-0.3.0",
    mainFile: "contracts/account/src/argent_account.cairo",
    files: ARGENT_ACCOUNT_030_FILES,
  },
  // AVNU Paymaster Forwarder — the class appears in sponsored-account traces
  // as `execute_sponsored`. Voyager verifies the source, but local bridge
  // setups without a Voyager API key return `verified:false`; keep the public
  // AVNU source available so the debugger does not fall back to raw Sierra.
  "0x0459a1f8377656a8a3812771646e4d5d985de59c4e0044a4af561222d9463e47": {
    label: "AVNU AA Forwarder Class",
    repo: "avnu-labs/paymaster",
    ref: "v1.4.2",
    mainFile: "contracts/src/forwarder.cairo",
    files: AVNU_FORWARDER_FILES,
  },
  // Older and current public forwarder class hashes from avnu-labs/paymaster.
  "0x054e57545b42b9e06a372026d20238d192bfc5378110670cb0ddb8b295014af9": {
    label: "AVNU Paymaster Forwarder v1.0",
    repo: "avnu-labs/paymaster",
    ref: "v1.0.0",
    mainFile: "contracts/src/forwarder.cairo",
    files: AVNU_FORWARDER_FILES,
  },
  "0x06ef1e3f91ac361a2b84407a032e988799ddb42dda850ab22c20c0e21e4437f1": {
    label: "AVNU Paymaster Forwarder",
    repo: "avnu-labs/paymaster",
    ref: "v1.4.2",
    mainFile: "contracts/src/forwarder.cairo",
    files: AVNU_FORWARDER_FILES,
  },
};

const FETCH_TIMEOUT_MS = 10_000;

let REGISTRY_BY_FELT: Map<string, RegistryEntry> | null = null;

function registryByFelt(): Map<string, RegistryEntry> {
  if (REGISTRY_BY_FELT) return REGISTRY_BY_FELT;
  const map = new Map<string, RegistryEntry>();
  for (const [classHash, entry] of Object.entries(REGISTRY)) {
    try {
      map.set(BigInt(classHash).toString(16), entry);
    } catch {
      /* Keep exact-key lookup as the only path for malformed entries. */
    }
  }
  REGISTRY_BY_FELT = map;
  return map;
}

function lookupRegistryEntry(classHashLower: string): RegistryEntry | null {
  const exact = REGISTRY[classHashLower];
  if (exact) return exact;
  try {
    return registryByFelt().get(BigInt(classHashLower).toString(16)) ?? null;
  } catch {
    return null;
  }
}

/** Try to satisfy a verified-source lookup from the curated registry.
 *  Returns null when there's no entry for this class hash, or when all
 *  github fetches fail. */
export async function lookupCairoSourceFallback(
  classHashLower: string,
  network: CairoSourceNetwork,
): Promise<CairoSourceResponse | null> {
  const entry = lookupRegistryEntry(classHashLower);
  if (!entry) return null;

  const controller = new AbortController();
  const timer = globalThis.setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT_MS,
  );

  try {
    const fetched: (CairoSourceFile | null)[] = await Promise.all(
      entry.files.map(async (f) => {
        const url = `https://raw.githubusercontent.com/${entry.repo}/${entry.ref}/${f.path}`;
        try {
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) return null;
          return { path: f.path, content: await res.text() };
        } catch {
          return null;
        }
      }),
    );
    const allFiles = fetched.filter((f): f is CairoSourceFile => f !== null);
    if (allFiles.length === 0) return null;

    // Separate Scarb.toml from regular source files — CairoSourceExplorer
    // pins it to the top of the tree via the dedicated scarbToml field.
    const scarbEntry = allFiles.find((f) => f.path === "Scarb.toml");
    const files = scarbEntry ? allFiles.filter((f) => f !== scarbEntry) : allFiles;

    return {
      classHash: classHashLower,
      network,
      verified: true,
      files,
      mainFile: entry.mainFile ?? null,
      scarbToml: scarbEntry?.content ?? null,
    };
  } finally {
    globalThis.clearTimeout(timer);
  }
}
