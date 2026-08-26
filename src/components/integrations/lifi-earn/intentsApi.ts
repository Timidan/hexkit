import type { Hex } from "viem";

// Integrator endpoints on order.li.fi are unauthenticated; the proxy exists
// for CORS parity + a server-side allowlist. Response shapes are a
// conservative superset — strict where we depend on a field, open elsewhere.
const INTENTS_PROXY = "/api/lifi-intents";

export type IntentSwapType = "exact-input" | "exact-output";

export interface IntentEndpoint {
  /** EIP-7930 interoperable address (see lib/intents/eip7930). */
  user: Hex;
  /** EIP-7930 interoperable address for the token. */
  asset: Hex;
  /** Smallest-unit amount. Null on outputs for exact-input quotes. */
  amount: string | null;
}

export interface IntentQuoteRequest {
  user: Hex;
  intent: {
    intentType: "oif-swap";
    inputs: IntentEndpoint[];
    outputs: Array<{ receiver: Hex; asset: Hex; amount: string | null }>;
    swapType: IntentSwapType;
  };
  supportedTypes: Array<"oif-escrow-v0" | "oif-compact-v0">;
}

export interface IntentQuotePreviewOutput {
  amount: string;
  [key: string]: unknown;
}

export interface IntentQuote {
  preview?: {
    outputs?: IntentQuotePreviewOutput[];
    [key: string]: unknown;
  };
  /** Pass straight into outputs[].context for auction/limit handling. */
  context?: Hex;
  /** Unix timestamp (seconds) in practice; ISO strings have also been seen. */
  validUntil?: string | number;
  solver?: string;
  [key: string]: unknown;
}

export interface IntentQuoteResponse {
  quotes: IntentQuote[];
  [key: string]: unknown;
}

// `amount` is a decimal string, so a plain falsy check lets "0" through and
// builds an order that offers the whole input for nothing. Returns null for
// missing, unparseable, or non-positive amounts.
export function readQuoteOutputAmount(
  quote: IntentQuote | null | undefined,
): bigint | null {
  const raw = quote?.preview?.outputs?.[0]?.amount;
  if (raw === null || raw === undefined) return null;
  try {
    const parsed = BigInt(raw);
    return parsed > 0n ? parsed : null;
  } catch {
    return null;
  }
}

// LI.FI surfaces tx hashes and solver under `meta.*`; older shapes (and our
// previous typing) put them at the top level. Readers fall back to either.
export interface IntentOrderStatus {
  orderId?: Hex;
  catalystOrderId?: string;
  status?: string;
  meta?: {
    orderStatus?: string;
    orderOpenedTxHash?: Hex;
    orderSignedTxHash?: Hex;
    orderDeliveredTxHash?: Hex;
    orderSettledTxHash?: Hex;
    solverAddress?: string;
    [key: string]: unknown;
  };
  originTxHash?: Hex;
  destinationTxHash?: Hex;
  solver?: string;
  [key: string]: unknown;
}

export function readOriginTxHash(s: IntentOrderStatus | null | undefined): Hex | undefined {
  return s?.originTxHash ?? s?.meta?.orderOpenedTxHash;
}

export function readDestinationTxHash(
  s: IntentOrderStatus | null | undefined,
): Hex | undefined {
  return (
    s?.destinationTxHash ??
    s?.meta?.orderDeliveredTxHash ??
    s?.meta?.orderSettledTxHash
  );
}

export function readSolverAddress(
  s: IntentOrderStatus | null | undefined,
): string | undefined {
  return s?.solver ?? s?.meta?.solverAddress;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${INTENTS_PROXY}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Intents ${path} failed: ${res.status} ${txt}`);
  }
  return res.json() as Promise<T>;
}

async function getJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params
    ? `?${new URLSearchParams(params).toString()}`
    : "";
  const url = `${INTENTS_PROXY}/${path}${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Intents ${path} failed: ${res.status} ${txt}`);
  }
  return res.json() as Promise<T>;
}

export function requestIntentQuote(
  body: IntentQuoteRequest,
): Promise<IntentQuoteResponse> {
  return postJson<IntentQuoteResponse>("quote/request", body);
}

export interface IntentOrderSubmitBody {
  order: unknown;
  signature?: Hex;
  metadata?: { source?: string; [key: string]: unknown };
}

// /orders/submit is for gasless / sponsored flows (Permit2 + openFor, or
// Compact resource locks); normal escrow goes on-chain via open() and the
// order server picks it up from the Open event.
export function submitIntentOrder(
  body: IntentOrderSubmitBody,
): Promise<{ orderId?: Hex; [key: string]: unknown }> {
  return postJson("orders/submit", body);
}

export function fetchIntentOrderStatus(params: {
  onChainOrderId?: Hex;
  catalystOrderId?: string;
}): Promise<IntentOrderStatus> {
  const query: Record<string, string> = {};
  if (params.onChainOrderId) query.onChainOrderId = params.onChainOrderId;
  if (params.catalystOrderId) query.catalystOrderId = params.catalystOrderId;
  return getJson<IntentOrderStatus>("orders/status", query);
}

export interface IntentChain {
  id: number;
  chainId: string;
  name: string;
  chainType: "EVM" | "SVM" | "TVM" | string;
}

export function fetchIntentChains(): Promise<IntentChain[]> {
  return getJson<IntentChain[]>("chains/supported");
}

export interface IntentRoute {
  fromChain: { chainId: string; chainType: string; name: string };
  toChain: { chainId: string; chainType: string; name: string };
  fromToken: { address: string; symbol: string | null; decimals: number };
  toToken: { address: string; symbol: string | null; decimals: number };
  isActive: boolean;
  [key: string]: unknown;
}

export interface IntentRoutesResponse {
  routes: IntentRoute[];
}

export function fetchIntentRoutes(): Promise<IntentRoutesResponse> {
  return getJson<IntentRoutesResponse>("routes");
}

// Canonical lifecycle from docs.li.fi/lifi-intents. Anything outside this
// set is treated as `Unknown` and surfaced verbatim.
export type CanonicalOrderState =
  | "Submitted"
  | "Open"
  | "Signed"
  | "Delivered"
  | "Settled"
  | "Expired"
  | "Refunded"
  | "Failed"
  | "Unknown";

const KNOWN_STATES: Record<string, CanonicalOrderState> = {
  submitted: "Submitted",
  open: "Open",
  signed: "Signed",
  delivered: "Delivered",
  settled: "Settled",
  expired: "Expired",
  refunded: "Refunded",
  failed: "Failed",
};

export function readOrderState(s: IntentOrderStatus | null | undefined): {
  state: CanonicalOrderState;
  rawLabel: string;
} {
  const raw = (s?.meta?.orderStatus ?? s?.status ?? "").trim();
  if (!raw) return { state: "Unknown", rawLabel: "Pending" };
  const exact = KNOWN_STATES[raw.toLowerCase()];
  return { state: exact ?? "Unknown", rawLabel: raw };
}

export function isTerminalState(state: CanonicalOrderState): boolean {
  return (
    state === "Settled" ||
    state === "Refunded" ||
    state === "Failed" ||
    state === "Expired"
  );
}

export function isDeliveredOrSettled(state: CanonicalOrderState): boolean {
  return state === "Delivered" || state === "Settled";
}
