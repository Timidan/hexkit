import type {
  EarnVaultsResponse,
  EarnPortfolioResponse,
  ComposerQuoteResponse,
  EarnVault,
  EarnToken,
  EarnChainInfo,
  EarnProtocolInfo,
  LifiStatusResponse,
} from "./types";

const EARN_PROXY = "/api/lifi-earn";
const COMPOSER_PROXY = "/api/lifi-composer";
function proxyHeaders(): HeadersInit {
  return {};
}

// API key is now mandatory — injected by the `/api/lifi-earn` proxy (vite dev /
// Vercel serverless fn in prod).
export async function fetchEarnVaults(params?: {
  cursor?: string;
  chainId?: number;
  sortBy?: string;
  sortDirection?: string;
  asset?: string;
  protocol?: string;
  minTvlUsd?: number;
  limit?: number;
}): Promise<EarnVaultsResponse> {
  const url = new URL(`${EARN_PROXY}/v1/vaults`, window.location.origin);
  if (params?.cursor) url.searchParams.set("cursor", params.cursor);
  if (params?.chainId) url.searchParams.set("chainId", String(params.chainId));
  if (params?.sortBy) url.searchParams.set("sortBy", params.sortBy);
  if (params?.sortDirection) url.searchParams.set("sortDirection", params.sortDirection);
  if (params?.asset) url.searchParams.set("asset", params.asset);
  if (params?.protocol) url.searchParams.set("protocol", params.protocol);
  if (params?.minTvlUsd != null && params.minTvlUsd > 0) url.searchParams.set("minTvlUsd", String(params.minTvlUsd));
  if (params?.limit) url.searchParams.set("limit", String(params.limit));

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Earn API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// Authoritative list of chains Earn indexes. Used to gate the chain filter so
// the dropdown only offers chains that actually have vaults. Small payload,
// cached aggressively via React Query.
export async function fetchEarnChains(): Promise<EarnChainInfo[]> {
  const res = await fetch(
    `${window.location.origin}${EARN_PROXY}/v1/chains`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) {
    throw new Error(`Earn chains error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// Authoritative list of protocols Earn supports. Used to populate the protocol
// filter dropdown without waiting for background vault pages to arrive.
export async function fetchEarnProtocols(): Promise<EarnProtocolInfo[]> {
  const res = await fetch(
    `${window.location.origin}${EARN_PROXY}/v1/protocols`,
    { signal: AbortSignal.timeout(15000) },
  );
  if (!res.ok) {
    throw new Error(`Earn protocols error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchEarnPositions(
  address: string
): Promise<EarnPortfolioResponse> {
  const res = await fetch(
    `${window.location.origin}${EARN_PROXY}/v1/portfolio/${address}/positions`,
    { signal: AbortSignal.timeout(15000) }
  );

  if (!res.ok) {
    throw new Error(`Earn Portfolio error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// Composer's /v1/quote is case-sensitive on token addresses: a checksummed
// (EIP-55) address returns 404 while lowercase resolves. Lowercase defensively.
function toComposerAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

export async function fetchComposerQuote(params: {
  fromChain: number;
  toChain: number;
  fromToken: string;
  // vault share address
  toToken: string;
  fromAddress: string;
  toAddress: string;
  // smallest-unit decimal string
  fromAmount: string;
  /** Vault's underlying token symbols — used for clearer error messages. */
  underlyingSymbols?: string[];
}): Promise<ComposerQuoteResponse> {
  const url = new URL(`${window.location.origin}${COMPOSER_PROXY}/v1/quote`);
  url.searchParams.set("fromChain", String(params.fromChain));
  url.searchParams.set("toChain", String(params.toChain));
  url.searchParams.set("fromToken", toComposerAddress(params.fromToken));
  url.searchParams.set("toToken", toComposerAddress(params.toToken));
  url.searchParams.set("fromAddress", toComposerAddress(params.fromAddress));
  url.searchParams.set("toAddress", toComposerAddress(params.toAddress));
  url.searchParams.set("fromAmount", params.fromAmount);
  // LiFi requires an integrator param to complete tx generation; without it the
  // composer returns 1001 "None of the available routes could successfully
  // generate a tx". `hexkit` is our registered integrator in the LiFi portal.
  url.searchParams.set("integrator", "hexkit");

  const res = await fetch(url.toString(), {
    headers: proxyHeaders(),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Parse LI.FI error codes into user-friendly messages
    try {
      const parsed = JSON.parse(body);
      if (parsed.code === 1002) {
        const syms = params.underlyingSymbols;
        const hint = syms?.length
          ? ` Try depositing with ${syms.join("/")} directly — Composer can't always swap into this vault's underlying token in one step.`
          : "";
        throw new Error(
          `No route available for this deposit. The amount may be too small or there's no liquidity path.${hint}`
        );
      }
      if (parsed.code === 1001) {
        throw new Error(
          "Route found but transaction couldn't be generated. Try a larger amount."
        );
      }
      if (parsed.message) {
        throw new Error(parsed.message);
      }
    } catch (e) {
      if (e instanceof Error && !e.message.startsWith("Composer")) throw e;
    }
    throw new Error(`Composer error: ${res.status} ${body}`);
  }

  return res.json();
}

export function extractUniqueUnderlyings(
  vaults: EarnVault[]
): Map<number, EarnToken[]> {
  const byChain = new Map<number, Map<string, EarnToken>>();
  for (const vault of vaults) {
    if (!vault.isTransactional) continue;
    const inner = byChain.get(vault.chainId) ?? new Map();
    for (const tok of vault.underlyingTokens ?? []) {
      const key = tok.address.toLowerCase();
      if (!inner.has(key)) inner.set(key, tok);
    }
    byChain.set(vault.chainId, inner);
  }
  const result = new Map<number, EarnToken[]>();
  for (const [chainId, tokMap] of byChain) {
    result.set(chainId, Array.from(tokMap.values()));
  }
  return result;
}

const LLM_PROXY = "/api/llm-recommend";

export async function postLlmRecommend(body: unknown): Promise<unknown> {
  const res = await fetch(LLM_PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...proxyHeaders() },
    body: JSON.stringify(body),
    // Gemini 3 Pro thinking responses run 20-50s on realistic payloads; 90s
    // covers the worst case. The serverless proxy itself caps at 60s.
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM proxy error: ${res.status} ${text}`);
  }
  return res.json();
}

export async function fetchCrossChainStatus(params: {
  txHash: string;
  fromChain: number;
  toChain: number;
}): Promise<LifiStatusResponse> {
  const url = new URL(`${window.location.origin}${COMPOSER_PROXY}/v1/status`);
  url.searchParams.set("txHash", params.txHash);
  url.searchParams.set("fromChain", String(params.fromChain));
  url.searchParams.set("toChain", String(params.toChain));

  const res = await fetch(url.toString(), {
    headers: proxyHeaders(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Status API error: ${res.status} ${body}`);
  }
  return res.json();
}
