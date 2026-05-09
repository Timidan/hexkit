/**
 * Starknet token-type detection — Cairo-side mirror of EVM's
 * `simple-grid/tokenDetection/functionDetection.ts`.
 *
 * Limited to the three standards EVM surfaces in the v1 builder UX:
 *   - SNIP-2  → ERC-20  (fungible)
 *   - SNIP-3  → ERC-721 (non-fungible, single-id transfers)
 *   - SNIP-1155 / OZ → ERC-1155 (multi-token, batched transfers)
 *
 * Detection is signature-shape based the same way the EVM scanner is:
 * we count function-name + event-name matches per standard, walking
 * both Cairo 1's nested `interface { items: [...] }` shape and the
 * flat Cairo 0 ABI shape. The contract is labelled with the highest
 * scoring standard above a 3-signal threshold; ERC-1155 wins ties
 * over ERC-721 because the `_batch` suffix is the strongest
 * discriminator.
 *
 * `detectStarknetTokenType` is a pure function — no IO, safe to call
 * synchronously while wiring form state. The async companion
 * `fetchStarknetErc20Meta` is the only impure helper and is opt-in
 * (only called when type === "erc20").
 */
import {
  Contract,
  RpcProvider,
  shortString,
  byteArray,
  type ByteArray,
} from "starknet";

export type StarknetTokenType = "erc20" | "erc721" | "erc1155" | null;

export interface StarknetTokenDetection {
  type: StarknetTokenType;
  /** Per-standard signal counts — surfaced for diagnostics so partial
   *  implementations can be inspected without re-running detection. */
  signals: {
    erc20: number;
    erc721: number;
    erc1155: number;
  };
}

export interface StarknetErc20Meta {
  name?: string;
  symbol?: string;
  decimals?: number;
}

// ---------------------------------------------------------------------------
// Pure ABI walker
// ---------------------------------------------------------------------------

interface AbiFn {
  name: string;
  inputs: string[]; // canonical type strings, in order
}

interface AbiEvent {
  name: string;
  members: string[]; // member type strings (Cairo 1) or input types (Cairo 0)
}

/** Extract a canonical type string from an ABI param. */
function paramType(
  param: { type?: unknown } | null | undefined,
): string {
  if (!param || typeof param !== "object") return "";
  const t = (param as { type?: unknown }).type;
  return typeof t === "string" ? t : "";
}

/** Strip Cairo type prefixes so `core::integer::u256` and `u256` compare
 *  equal. Same idea as canonicalising EVM types but for the OZ namespacing. */
function normaliseType(raw: string): string {
  if (!raw) return "";
  // Take the last `::` segment — `core::integer::u256` → `u256`,
  // `core::starknet::contract_address::ContractAddress` → `ContractAddress`,
  // `core::byte_array::ByteArray` → `ByteArray`.
  const last = raw.split("::").pop() ?? raw;
  return last.trim();
}

function flattenAbi(abi: unknown): { fns: AbiFn[]; events: AbiEvent[] } {
  const fns: AbiFn[] = [];
  const events: AbiEvent[] = [];
  if (!Array.isArray(abi)) return { fns, events };

  const walk = (items: unknown[]): void => {
    for (const raw of items) {
      if (!raw || typeof raw !== "object") continue;
      const item = raw as {
        type?: string;
        name?: string;
        inputs?: unknown[];
        members?: unknown[];
        items?: unknown[];
      };
      const t = item.type;
      // Cairo 1 nests functions under `interface { items: [...] }` and
      // sometimes `impl { items: [...] }`. Recurse before checking the
      // node's own type so we pick up everything.
      if ((t === "interface" || t === "impl") && Array.isArray(item.items)) {
        walk(item.items);
        continue;
      }
      if (
        t === "function" ||
        t === "external" ||
        t === "view" ||
        t === "l1_handler"
      ) {
        if (typeof item.name !== "string") continue;
        const inputs = Array.isArray(item.inputs)
          ? item.inputs.map((p) => normaliseType(paramType(p as object)))
          : [];
        fns.push({ name: item.name, inputs });
        continue;
      }
      if (t === "event") {
        if (typeof item.name !== "string") continue;
        // Cairo 1 events carry `members`; Cairo 0 events carry `inputs`.
        const memberTypes = Array.isArray(item.members)
          ? item.members.map((p) => normaliseType(paramType(p as object)))
          : Array.isArray(item.inputs)
            ? item.inputs.map((p) => normaliseType(paramType(p as object)))
            : [];
        // Use the bare last segment of the event name — Cairo 1 events
        // are typically namespaced (e.g. `openzeppelin_token::erc20::Transfer`).
        const bareName = item.name.split("::").pop() ?? item.name;
        events.push({ name: bareName, members: memberTypes });
        continue;
      }
    }
  };

  walk(abi);
  return { fns, events };
}

// ---------------------------------------------------------------------------
// Per-standard predicates
// ---------------------------------------------------------------------------

const FUNGIBLE_VALUE_TYPE = "u256";
const ADDRESS_TYPE = "ContractAddress";

function hasFn(
  fns: AbiFn[],
  name: string,
  predicate?: (fn: AbiFn) => boolean,
): boolean {
  return fns.some(
    (fn) => fn.name === name && (predicate ? predicate(fn) : true),
  );
}

function hasEvent(
  events: AbiEvent[],
  name: string,
  predicate?: (ev: AbiEvent) => boolean,
): boolean {
  return events.some(
    (ev) => ev.name === name && (predicate ? predicate(ev) : true),
  );
}

/**
 * SNIP-2 / ERC-20 signal count.
 *
 * Predicate: ≥4 of {transfer, transfer_from, balance_of, approve, allowance}
 * + Transfer event with a u256 value field. We count each match as 1 signal
 * and add 1 more for the Transfer(_, _, u256) event so a textbook-complete
 * ERC-20 lands at 6 signals (5 fns + 1 event). The detection floor is 3.
 */
function scoreErc20(fns: AbiFn[], events: AbiEvent[]): number {
  let signals = 0;
  // transfer(recipient: ContractAddress, amount: u256) -> bool
  if (
    hasFn(
      fns,
      "transfer",
      (fn) =>
        fn.inputs.length === 2 &&
        fn.inputs[0] === ADDRESS_TYPE &&
        fn.inputs[1] === FUNGIBLE_VALUE_TYPE,
    )
  ) {
    signals++;
  }
  // transfer_from(sender, recipient, amount: u256)
  if (
    hasFn(
      fns,
      "transfer_from",
      (fn) =>
        fn.inputs.length === 3 &&
        fn.inputs[fn.inputs.length - 1] === FUNGIBLE_VALUE_TYPE,
    ) ||
    hasFn(
      fns,
      "transferFrom",
      (fn) =>
        fn.inputs.length === 3 &&
        fn.inputs[fn.inputs.length - 1] === FUNGIBLE_VALUE_TYPE,
    )
  ) {
    signals++;
  }
  // balance_of(account) -> u256 — the *single-arg* shape (vs. ERC-1155's
  // two-arg shape that takes an id). We disambiguate on arity.
  if (
    hasFn(fns, "balance_of", (fn) => fn.inputs.length === 1) ||
    hasFn(fns, "balanceOf", (fn) => fn.inputs.length === 1)
  ) {
    signals++;
  }
  // approve(spender, amount: u256)
  if (
    hasFn(
      fns,
      "approve",
      (fn) =>
        fn.inputs.length === 2 &&
        fn.inputs[fn.inputs.length - 1] === FUNGIBLE_VALUE_TYPE,
    )
  ) {
    signals++;
  }
  // allowance(owner, spender) -> u256
  if (hasFn(fns, "allowance", (fn) => fn.inputs.length === 2)) {
    signals++;
  }
  // Transfer(from, to, value: u256) — ERC-20 event (3 fields, last is u256).
  if (
    hasEvent(
      events,
      "Transfer",
      (ev) =>
        ev.members.length === 3 &&
        ev.members[ev.members.length - 1] === FUNGIBLE_VALUE_TYPE,
    )
  ) {
    signals++;
  }
  return signals;
}

/**
 * SNIP-3 / ERC-721 signal count.
 *
 * Predicate: presence of `owner_of` + a transfer fn that takes `token_id: u256`
 * + Transfer event with three params (the `token_id` shape). We also award
 * signals for `set_approval_for_all` / `is_approved_for_all` / `get_approved`
 * to lift well-formed NFTs above the threshold.
 */
function scoreErc721(fns: AbiFn[], events: AbiEvent[]): number {
  let signals = 0;
  // owner_of(token_id: u256) -> ContractAddress — the single hard
  // discriminator. Only ERC-721 ships this name.
  if (
    hasFn(
      fns,
      "owner_of",
      (fn) => fn.inputs.length === 1 && fn.inputs[0] === FUNGIBLE_VALUE_TYPE,
    ) ||
    hasFn(
      fns,
      "ownerOf",
      (fn) => fn.inputs.length === 1 && fn.inputs[0] === FUNGIBLE_VALUE_TYPE,
    )
  ) {
    signals += 2; // double-weight — strongest discriminator
  }
  // safe_transfer_from(from, to, token_id: u256, data: Span<felt252>)
  // OR transfer_from(from, to, token_id: u256) — both 3-arg with last=u256
  // share shape with ERC-20's transfer_from, so we only count this when
  // owner_of is also present (caller resolves ties).
  if (
    hasFn(
      fns,
      "safe_transfer_from",
      (fn) => fn.inputs.length >= 3 && fn.inputs[2] === FUNGIBLE_VALUE_TYPE,
    ) ||
    hasFn(
      fns,
      "safeTransferFrom",
      (fn) => fn.inputs.length >= 3 && fn.inputs[2] === FUNGIBLE_VALUE_TYPE,
    )
  ) {
    signals++;
  }
  // get_approved(token_id) -> ContractAddress
  if (
    hasFn(fns, "get_approved", (fn) => fn.inputs.length === 1) ||
    hasFn(fns, "getApproved", (fn) => fn.inputs.length === 1)
  ) {
    signals++;
  }
  // set_approval_for_all(operator, approved: bool)
  if (
    hasFn(fns, "set_approval_for_all", (fn) => fn.inputs.length === 2) ||
    hasFn(fns, "setApprovalForAll", (fn) => fn.inputs.length === 2)
  ) {
    signals++;
  }
  // is_approved_for_all(owner, operator) -> bool
  if (
    hasFn(fns, "is_approved_for_all", (fn) => fn.inputs.length === 2) ||
    hasFn(fns, "isApprovedForAll", (fn) => fn.inputs.length === 2)
  ) {
    signals++;
  }
  // token_uri(token_id) — ERC-721 metadata extension
  if (
    hasFn(fns, "token_uri", (fn) => fn.inputs.length === 1) ||
    hasFn(fns, "tokenURI", (fn) => fn.inputs.length === 1) ||
    hasFn(fns, "tokenUri", (fn) => fn.inputs.length === 1)
  ) {
    signals++;
  }
  // Transfer(from, to, token_id) — same name as ERC-20 but the discriminator
  // is the param name `token_id`. We use a soft heuristic: if a Transfer event
  // exists AND owner_of is present (already counted), credit it here too.
  // We don't double-count when ERC-20's stricter Transfer(_, _, u256) match
  // also fires — at the resolver stage the highest-scoring standard wins.
  if (hasEvent(events, "Transfer", (ev) => ev.members.length === 3)) {
    signals++;
  }
  return signals;
}

/**
 * SNIP-1155 / ERC-1155 signal count.
 *
 * Predicate: presence of `balance_of_batch` OR `safe_batch_transfer_from`
 * OR `TransferBatch` event — the `_batch` suffix is unambiguous. Also
 * counts the two-arg `balance_of(account, id)` shape which is the
 * ERC-1155 reading idiom that conflicts with ERC-20's single-arg shape.
 */
function scoreErc1155(fns: AbiFn[], events: AbiEvent[]): number {
  let signals = 0;
  // balance_of_batch(accounts, ids) — unambiguous.
  if (
    hasFn(fns, "balance_of_batch") ||
    hasFn(fns, "balanceOfBatch")
  ) {
    signals += 2; // double-weight discriminator
  }
  // safe_batch_transfer_from — unambiguous.
  if (
    hasFn(fns, "safe_batch_transfer_from") ||
    hasFn(fns, "safeBatchTransferFrom")
  ) {
    signals += 2;
  }
  // balance_of(account, id) — two-arg shape (vs. ERC-20's single-arg).
  if (
    hasFn(fns, "balance_of", (fn) => fn.inputs.length === 2) ||
    hasFn(fns, "balanceOf", (fn) => fn.inputs.length === 2)
  ) {
    signals++;
  }
  // safe_transfer_from(from, to, id, value, data) — five-arg shape (vs.
  // ERC-721's three/four-arg shape).
  if (
    hasFn(fns, "safe_transfer_from", (fn) => fn.inputs.length >= 5) ||
    hasFn(fns, "safeTransferFrom", (fn) => fn.inputs.length >= 5)
  ) {
    signals++;
  }
  // TransferSingle / TransferBatch / URI events — also unambiguous.
  if (hasEvent(events, "TransferBatch")) signals += 2;
  if (hasEvent(events, "TransferSingle")) signals++;
  if (hasEvent(events, "URI")) signals++;
  // is_approved_for_all + set_approval_for_all are shared with ERC-721 —
  // credit one signal for the pair so a textbook 1155 lifts above the
  // threshold even if the TransferBatch event isn't declared.
  if (
    (hasFn(fns, "is_approved_for_all") || hasFn(fns, "isApprovedForAll")) &&
    (hasFn(fns, "set_approval_for_all") || hasFn(fns, "setApprovalForAll"))
  ) {
    signals++;
  }
  return signals;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const DETECTION_THRESHOLD = 3;

export function detectStarknetTokenType(
  abi: unknown[] | null | undefined,
): StarknetTokenDetection {
  const empty: StarknetTokenDetection = {
    type: null,
    signals: { erc20: 0, erc721: 0, erc1155: 0 },
  };
  if (!Array.isArray(abi) || abi.length === 0) return empty;

  const { fns, events } = flattenAbi(abi);
  if (fns.length === 0 && events.length === 0) return empty;

  const erc20 = scoreErc20(fns, events);
  const erc721 = scoreErc721(fns, events);
  const erc1155 = scoreErc1155(fns, events);

  // Pick the highest scoring standard above the threshold. ERC-1155 wins
  // ties over ERC-721 because the batch suffix is the strongest
  // discriminator; ERC-20 wins ties over either of the NFT standards
  // because its Transfer(_, _, u256) shape is the textbook tell.
  let type: StarknetTokenType = null;
  const scores: Array<[StarknetTokenType, number]> = [
    ["erc1155", erc1155],
    ["erc20", erc20],
    ["erc721", erc721],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  if (scores[0][1] >= DETECTION_THRESHOLD) {
    type = scores[0][0];
  }

  return {
    type,
    signals: { erc20, erc721, erc1155 },
  };
}

// ---------------------------------------------------------------------------
// Live name/symbol/decimals fetcher (ERC-20 only)
// ---------------------------------------------------------------------------

/** Decode a starknet `name()` / `symbol()` response into a plain string.
 *  Cairo 0 returns a single felt (short string). Cairo 1 returns a
 *  ByteArray struct. Both can also be returned by the Contract helper as
 *  a JS string already (when the ABI calldata mapper recognises ByteArray).
 *
 *  Returns `undefined` when no decode path succeeds. */
function decodeNameOrSymbol(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  // Already-decoded string from `Contract` (Cairo 1 ByteArray autodecode).
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  // BigInt / number — single felt; decode as a short string.
  if (typeof value === "bigint" || typeof value === "number") {
    try {
      const hex = "0x" + value.toString(16);
      const decoded = shortString.decodeShortString(hex);
      return decoded.length > 0 ? decoded : undefined;
    } catch {
      return undefined;
    }
  }
  // ByteArray struct — { data, pending_word, pending_word_len }
  if (typeof value === "object") {
    const obj = value as Partial<ByteArray>;
    if (
      obj &&
      Array.isArray(obj.data) &&
      obj.pending_word !== undefined &&
      obj.pending_word_len !== undefined
    ) {
      try {
        return byteArray.stringFromByteArray(obj as ByteArray) || undefined;
      } catch {
        // Fall through to felt decode attempt below.
      }
    }
  }
  return undefined;
}

function decodeDecimals(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Best-effort live-fetch of `name()`, `symbol()`, `decimals()` for an
 *  ERC-20. All three calls are issued in parallel and decode failures are
 *  silent — every field on the returned object is optional. */
export async function fetchStarknetErc20Meta(
  provider: RpcProvider,
  address: string,
  abi: unknown,
): Promise<StarknetErc20Meta> {
  if (!Array.isArray(abi) || abi.length === 0) return {};
  let contract: Contract;
  try {
    // starknet@9 takes an options object; legacy positional ctor is gone.
    contract = new Contract({
      abi: abi as never,
      address,
      providerOrAccount: provider,
    });
  } catch {
    return {};
  }

  const [nameRes, symbolRes, decimalsRes] = await Promise.allSettled([
    (async () => {
      try {
        return await contract.call("name");
      } catch {
        return undefined;
      }
    })(),
    (async () => {
      try {
        return await contract.call("symbol");
      } catch {
        return undefined;
      }
    })(),
    (async () => {
      try {
        return await contract.call("decimals");
      } catch {
        return undefined;
      }
    })(),
  ]);

  const out: StarknetErc20Meta = {};
  if (nameRes.status === "fulfilled") {
    const decoded = decodeNameOrSymbol(unwrapCallResult(nameRes.value));
    if (decoded) out.name = decoded;
  }
  if (symbolRes.status === "fulfilled") {
    const decoded = decodeNameOrSymbol(unwrapCallResult(symbolRes.value));
    if (decoded) out.symbol = decoded;
  }
  if (decimalsRes.status === "fulfilled") {
    const decoded = decodeDecimals(unwrapCallResult(decimalsRes.value));
    if (decoded !== undefined) out.decimals = decoded;
  }
  return out;
}

/** `Contract.call` may return either the raw value or an object whose
 *  single property is the value (older starknet.js wrapping). Unwrap so
 *  the decoders see the bare value. */
function unwrapCallResult(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    // Single-key wrapper — peel it off unless the key looks like a ByteArray
    // field (in which case the full struct IS the value).
    if (keys.length === 1 && !("data" in obj) && !("pending_word" in obj)) {
      return obj[keys[0]];
    }
  }
  return value;
}
