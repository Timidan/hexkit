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

async function fetchJson<T>(
  url: string,
  options: {
    timeoutMs?: number;
    errorLabel: string;
    method?: string;
    headers?: HeadersInit;
    body?: BodyInit;
    withBodyText?: boolean;
  },
): Promise<T> {
  const init: RequestInit = {};
  if (options.method) init.method = options.method;
  if (options.headers) init.headers = options.headers;
  if (options.body !== undefined) init.body = options.body;
  if (options.timeoutMs != null) init.signal = AbortSignal.timeout(options.timeoutMs);

  const res = await fetch(url, init);
  if (!res.ok) {
    if (options.withBodyText) {
      const text = await res.text().catch(() => "");
      throw new Error(`${options.errorLabel}: ${res.status} ${text}`);
    }
    throw new Error(`${options.errorLabel}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
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

  return fetchJson<EarnVaultsResponse>(url.toString(), {
    timeoutMs: 15000,
    errorLabel: "Earn API error",
  });
}

// Authoritative list of chains Earn indexes. Used to gate the chain filter so
// the dropdown only offers chains that actually have vaults. Small payload,
// cached aggressively via React Query.
export async function fetchEarnChains(): Promise<EarnChainInfo[]> {
  return fetchJson<EarnChainInfo[]>(
    `${window.location.origin}${EARN_PROXY}/v1/chains`,
    { timeoutMs: 15000, errorLabel: "Earn chains error" },
  );
}

// Authoritative list of protocols Earn supports. Used to populate the protocol
// filter dropdown without waiting for background vault pages to arrive.
export async function fetchEarnProtocols(): Promise<EarnProtocolInfo[]> {
  return fetchJson<EarnProtocolInfo[]>(
    `${window.location.origin}${EARN_PROXY}/v1/protocols`,
    { timeoutMs: 15000, errorLabel: "Earn protocols error" },
  );
}

export async function fetchEarnPositions(
  address: string
): Promise<EarnPortfolioResponse> {
  return fetchJson<EarnPortfolioResponse>(
    `${window.location.origin}${EARN_PROXY}/v1/portfolio/${address}/positions`,
    { timeoutMs: 15000, errorLabel: "Earn Portfolio error" },
  );
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

export async function postLlmRecommend(
  body: unknown,
  opts: { targetAddress?: string | null } = {}
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.targetAddress && /^0x[0-9a-fA-F]{40}$/.test(opts.targetAddress)) {
    headers["x-target-address"] = opts.targetAddress.toLowerCase();
  }
  return fetchJson<unknown>(LLM_PROXY, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    // Gemini 3 Pro thinking responses run 20-50s on realistic payloads; 90s
    // covers the worst case. The serverless proxy itself caps at 60s.
    timeoutMs: 90_000,
    errorLabel: "LLM proxy error",
    withBodyText: true,
  });
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

  return fetchJson<LifiStatusResponse>(url.toString(), {
    timeoutMs: 15000,
    errorLabel: "Status API error",
    withBodyText: true,
  });
}
