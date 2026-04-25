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
  "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9": "Transfer",
  "0x182d859c0807ba9db63baf8b9d9fdbfeb885d820be6e206b9dab626d995c433": "TransferSingle",
  "0x2db340e6c609371026731f47050d3976552c89b4fbb012941663841c59d1af3": "TransferBatch",
  "0x1a2f334228cee715f1f0f54053bb6b5eac54fa336e0bc1aacf7516decb0471d": "Approval",
  "0x1390fd803c110ac71730ece1decfc34eb1d0088e295d4f1b125dda1e0c5b9ff": "ApprovalForAll",
};

export const KNOWN_CONTRACTS: Record<string, string> = {
  "0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": "ETH",
  "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": "STRK",
  "0x53c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": "USDC",
  "0x68f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8": "USDT",
};

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

export function contractLabel(addr: string): string | null {
  return KNOWN_CONTRACTS[addr] || null;
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
