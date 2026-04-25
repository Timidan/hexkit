// Selector / event / contract / token decoder helpers for the Starknet sim
// view. The bridge already returns `decodedSelector` per CallInfo (resolved
// from each class's ABI), so this file only holds the std-lib fallback table
// and the static metadata for token/event keys.

import type { FunctionInvocation, SimulationEvent } from "@/chains/starknet/simulatorTypes";

// Hardcoded fallback for frames where the bridge couldn't resolve the
// selector (no class loaded, revert path, etc). Mirrors print_selectors.rs.
export const KNOWN_SELECTORS: Record<string, string> = {
  "0x162da33a4585851fe8d3af3c2a9c60b557814e221e0d4f30ff0b2189d9c7775": "__validate__",
  "0x15d40a3d6ca2ac30f4031e42be28da9b056fef9bb7357ac5e85627ee876e5ad": "__execute__",
  "0x36fcbf06cd96843058359e1a75928beacfac10727dab22a3972f0af8aa92895": "__validate_deploy__",
  "0x289da278a8dc833409cabfdad1581e8e7d40e42dcaed693fa4008dcdb4963b3": "__validate_declare__",
  "0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e": "transfer",
  "0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c": "approve",
  "0x35a73cd311a05d46deda634c5ee045db92f811b4e74bca4437fcb5302b7af33": "balance_of",
  "0x2e4263afad30923c891518314c3c95dbe830a16874e8abc5777a9a20b54c76e": "balanceOf",
  "0x1e888a1026b19c8c0b57c72d63ed1737106aa10034105b980ba117bd0c29fe1": "allowance",
};

export const KNOWN_EVENTS: Record<string, string> = {
  // ERC20 / ERC721 / ERC1155 standards.
  "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9": "Transfer",
  "0x182d859c0807ba9db63baf8b9d9fdbfeb885d820be6e206b9dab626d995c433": "TransferSingle",
  "0x2db340e6c609371026731f47050d3976552c89b4fbb012941663841c59d1af3": "TransferBatch",
  "0x1a2f334228cee715f1f0f54053bb6b5eac54fa336e0bc1aacf7516decb0471d": "Approval",
  "0x1390fd803c110ac71730ece1decfc34eb1d0088e295d4f1b125dda1e0c5b9ff": "ApprovalForAll",
  // Account / paymaster standards (Argent, OpenZeppelin, AVNU).
  "0x1dcde06aabdbca2f80aa51392b345d7549d7757aa855f7e37f5d335ac8243b1": "TransactionExecuted",
  "0x2495e87dbfae534a775dc432ffb2b4c64cd5b8e42a9dd1984ee7f424e46feb9": "SponsoredTransaction",
  "0x2f6c4d2f47ed1b65bf8c2cc24e4d0e4a3265a9e3a5a4e3b3c2d2c0a4f6f3e2c": "OutsideExecution",
  "0x10f96fd25dca50f9d5a5e1f96d3eb1e44cdcd4de7c2b9e6ee9b2cb8e8c8c8c": "OwnerAdded",
  "0x12f9e5919916bd76b3a86fa11788e7f2c2dba07866c8d61dcd9ad9f43a0fafe": "OwnerRemoved",
};

export const KNOWN_CONTRACTS: Record<string, string> = {
  // Tokens.
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": "ETH",
  "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": "STRK",
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": "USDC",
  "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8": "USDT",
  "0x53b40a647cedfca6ca84f542a0fe36736031905a9c340b1d3eef99d4e3a0e8a": "DAI",
  "0x6182278e1817fb13b35b1376a915cef36d72c4c4a7b32a4ae232701b89c2e2c": "wBTC",
  // Infrastructure.
  "0x482f1384e97403379825973629743a4a8b30e9028e139d0f707f7ca488ee16": "AVNU AA Forwarder",
  "0x1176a1bd84444c89232ec27754698e5d2e7e1a7f1539f12027f28b23ec9f3d8": "StarkWare Sequencer",
  "0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf":
    "Universal Deployer",
  // DEX routers.
  "0x4270219d365d6b017a6a3c8a2dba89dab1d50e6f8a2e0a3c2f3a3d3f8e8e8e8": "AVNU Router",
  "0x041fd22b238fa21cfcf5dd45a8548974d8263b3a531a60388411c5e230f97023": "10kSwap Router",
  "0x07a6f98c03379b9513ca84cca1373ff452a7462a3b61598f0af5bb27ad7f76d1": "JediSwap Router",
  "0x010884171baf1914edc28d7afb619b40a4051cfae78a094a55d230f19e944a28":
    "JediSwap V2 Factory",
  "0x004f3afaf72e34a087fd60beea49a2a96a4c8edda08fa1e16ce4ba9d6090e5b3": "Ekubo Core",
  "0x05dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b": "MySwap CL",
};

/** Class-hash → label registry. Lets us recognise wallet brands and
 *  popular implementation classes when the bridge gives us a class
 *  hash but the deployment address isn't in KNOWN_CONTRACTS. */
export const KNOWN_CLASS_HASHES: Record<string, string> = {
  // Argent / Ready.
  "0x036078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f":
    "Ready Account v0.4.0",
  "0x29927c8af6bccf3f6fda035981e765a7bdbf18a2dc0d630494f8758aa908e2b":
    "Argent Account v0.3.1",
  "0x01a736d6ed154502257f02b1ccdf4d9d1089f80811cd6acad48e6b6a9d1f2003":
    "Argent Account v0.3.0",
  // Braavos.
  "0x00816dd0297efc55dc1e7559020a3a825e81ef734b558f03c83325d4da7e6253":
    "Braavos Account",
  "0x03131fa018d520a037686ce3efddeab8f28895662f019ca3ca18a626650f7d1e":
    "Braavos Base Account",
  // OpenZeppelin.
  "0x05400e90f7e0ae78bd02c77cd75527280470e2fe19c54970dd79dc37a9d3645c":
    "OpenZeppelin Account v0.8.0",
  "0x05b4b537eaa2399e3aa99c4a2e0208302d695f7e864262b1d6dee7c8ddc0c3a3":
    "OpenZeppelin Account v0.6.x",
  // AVNU.
  "0x0459a1f8377656a8a3812771646e4d5d985de59c4e0044a4af561222d9463e47":
    "AVNU AA Forwarder Class",
  // STRK / ETH token implementations.
  "0x02e77ee61d4df3d988ee1f42ea5442e913862cc82c2584d212ecda76666498fc":
    "ERC20Lockable (STRK)",
};

/** Lazy-built BigInt-keyed mirror of KNOWN_CLASS_HASHES so we match
 *  regardless of leading-zero representation (Starknet felts encode
 *  the same value as `0x01a73…` and `0x1a73…`). */
let CLASS_HASH_BY_BIGINT: Map<bigint, string> | null = null;
function classHashIndex(): Map<bigint, string> {
  if (CLASS_HASH_BY_BIGINT) return CLASS_HASH_BY_BIGINT;
  const m = new Map<bigint, string>();
  for (const [hex, label] of Object.entries(KNOWN_CLASS_HASHES)) {
    try {
      m.set(BigInt(hex), label);
    } catch {
      /* Skip a malformed entry — table is hand-edited. */
    }
  }
  CLASS_HASH_BY_BIGINT = m;
  return m;
}

/** Returns the class-hash label, or null when we don't have a mapping. */
export function classLabel(classHash: string | null | undefined): string | null {
  if (!classHash) return null;
  try {
    return classHashIndex().get(BigInt(classHash)) ?? null;
  } catch {
    return null;
  }
}

export const TOKEN_META: Record<string, { symbol: string; decimals: number }> = {
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": { symbol: "ETH", decimals: 18 },
  "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": { symbol: "STRK", decimals: 18 },
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": { symbol: "USDC", decimals: 6 },
  "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8": { symbol: "USDT", decimals: 6 },
};

/** Bridge-emitted decodedSelector wins, hardcoded table is the fallback. */
export function selectorName(ci: FunctionInvocation | null | undefined): string | null {
  if (!ci) return null;
  return ci.decodedSelector || KNOWN_SELECTORS[ci.entryPointSelector] || null;
}

export function eventName(ev: SimulationEvent): string | null {
  return ev.keys[0] ? KNOWN_EVENTS[ev.keys[0]] || null : null;
}

let CONTRACT_BY_BIGINT: Map<bigint, string> | null = null;
function contractIndex(): Map<bigint, string> {
  if (CONTRACT_BY_BIGINT) return CONTRACT_BY_BIGINT;
  const m = new Map<bigint, string>();
  for (const [hex, label] of Object.entries(KNOWN_CONTRACTS)) {
    try {
      m.set(BigInt(hex), label);
    } catch {
      /* Skip malformed — table is hand-edited. */
    }
  }
  CONTRACT_BY_BIGINT = m;
  return m;
}

export function contractLabel(addr: string): string | null {
  if (!addr) return null;
  try {
    return contractIndex().get(BigInt(addr)) ?? null;
  } catch {
    return null;
  }
}

/** Account-shape entrypoints. Any frame calling into one of these is
 *  almost certainly an account contract regardless of class hash, so we
 *  can label the call target generically when the address isn't in
 *  KNOWN_CONTRACTS. */
const ACCOUNT_ENTRY_POINT_NAMES = new Set([
  "__validate__",
  "__execute__",
  "__validate_deploy__",
  "__validate_declare__",
  "execute_from_outside_v2",
  "execute_from_outside",
]);

/** Higher-confidence label for a single frame. Resolution order:
 *  1. Known address (KNOWN_CONTRACTS) — highest confidence.
 *  2. Known class hash (KNOWN_CLASS_HASHES) — wallet brands etc.
 *  3. Account heuristic (selector matches __validate__ / __execute__ /
 *     execute_from_outside_v2). Generic but useful.
 *  Returns null when we have nothing better — caller renders raw hex. */
export function frameLabel(
  frame: FunctionInvocation | null | undefined,
): string | null {
  if (!frame) return null;
  const known = contractLabel(frame.contractAddress);
  if (known) return known;
  const cls = classLabel(frame.classHash);
  if (cls) return cls;
  const sel = selectorName(frame);
  if (sel && ACCOUNT_ENTRY_POINT_NAMES.has(sel)) return "Account";
  return null;
}

/** Walks every invocation tree once and builds an address → label map
 *  using frameLabel's heuristics. Useful for tabs that don't have a
 *  frame in hand (state diff rows, message rows) but want the same
 *  labels the call tree shows. */
export function buildAddressLabels(result: {
  validateInvocation: FunctionInvocation | null;
  executeInvocation: FunctionInvocation | null;
  feeTransferInvocation: FunctionInvocation | null;
}): Record<string, string> {
  const map: Record<string, string> = {};
  for (const f of walkInvocations(result)) {
    const lbl = frameLabel(f);
    if (lbl && !map[f.contractAddress]) map[f.contractAddress] = lbl;
  }
  return map;
}

export function shortHex(h: string | null | undefined, head = 10, tail = 6): string {
  if (!h) return "";
  if (h.length <= head + tail + 1) return h;
  return `${h.slice(0, head)}…${h.slice(-tail)}`;
}

/** Cairo u256 packing: data[0]=low felt, data[1]=high felt. */
export function decodeU256(low?: string, high?: string): bigint {
  try {
    const lo = BigInt(low ?? "0x0");
    const hi = BigInt(high ?? "0x0");
    return (hi << 128n) | lo;
  } catch {
    return 0n;
  }
}

export function formatTokenAmount(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const div = 10n ** BigInt(decimals);
  const whole = amount / div;
  const frac = amount % div;
  if (frac === 0n) return whole.toString();
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}

/** Hex felt → bigint, returning 0n on parse failure. The fee /
 *  gas fields the bridge emits are always 0x-prefixed hex. */
export function hexToBigInt(hex: string): bigint {
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

/** Format a FRI amount (10⁻¹⁸ STRK) into a human-readable STRK display.
 *  Returns "0 STRK" for empty/zero, otherwise decimal with up to 6 fraction
 *  digits + STRK suffix. */
export function formatFriAmount(hexFri: string): string {
  const fri = hexToBigInt(hexFri);
  if (fri === 0n) return "0 STRK";
  return `${formatTokenAmount(fri, 18)} STRK`;
}

/** Format a hex gas amount as a decimal integer with thousands separators
 *  (locale "en-US"). */
export function formatHexGasAmount(hexAmount: string): string {
  return hexToBigInt(hexAmount).toLocaleString("en-US");
}

/** All L2→L1 messages emitted across the tx, paired with the frame that
 *  emitted them so the UI can render `from contract → L1 address`
 *  with proper labels. */
export function collectL2ToL1Messages(
  result: {
    validateInvocation: FunctionInvocation | null;
    executeInvocation: FunctionInvocation | null;
    feeTransferInvocation: FunctionInvocation | null;
  },
): Array<{
  frame: FunctionInvocation;
  message: { fromAddress: string; toAddress: string; payload: string[] };
}> {
  const out: Array<{
    frame: FunctionInvocation;
    message: { fromAddress: string; toAddress: string; payload: string[] };
  }> = [];
  for (const f of walkInvocations(result)) {
    for (const m of f.messages || []) {
      out.push({ frame: f, message: m });
    }
  }
  return out;
}

/** Walk every invocation tree and yield each frame in walk order. */
export function* walkInvocations(
  result: {
    validateInvocation: FunctionInvocation | null;
    executeInvocation: FunctionInvocation | null;
    feeTransferInvocation: FunctionInvocation | null;
  },
): Iterable<FunctionInvocation> {
  for (const top of [result.validateInvocation, result.executeInvocation, result.feeTransferInvocation]) {
    if (!top) continue;
    yield* walkOne(top);
  }
}

function* walkOne(n: FunctionInvocation): Iterable<FunctionInvocation> {
  yield n;
  for (const c of n.calls || []) yield* walkOne(c);
}

export function countSubtree(n: FunctionInvocation): number {
  let c = 1;
  for (const k of n.calls || []) c += countSubtree(k);
  return c;
}

export function subtreeEventCount(n: FunctionInvocation): number {
  let c = (n.events || []).length;
  for (const k of n.calls || []) c += subtreeEventCount(k);
  return c;
}

/** Cairo 0 syscall args (syscall_ptr, pedersen_ptr, range_check_ptr, …)
 *  often lead with all-zero pointer felts. Strip leading zero-shape felts
 *  for the UI; user can toggle to see raw. */
export function stripSystemArgs(felts: string[]): string[] {
  return (felts || []).filter((f, i) => !(i < 4 && /^0x0+$/.test(f)));
}
