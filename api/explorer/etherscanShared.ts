import { z } from "zod";

export type EtherscanContractAction = "getabi" | "getsourcecode";

export const EtherscanLookupRequestSchema = z.object({
  action: z.enum(["getabi", "getsourcecode"]),
  address: z
    .string()
    .trim()
    .regex(/^0x[a-fA-F0-9]{40}$/, "invalid address"),
  chainId: z
    .union([
      z.number().int().positive(),
      z.string().trim().regex(/^[1-9]\d*$/),
    ])
    .transform((v) => (typeof v === "string" ? Number(v) : v)),
  personalApiKey: z
    .string()
    .trim()
    .min(1)
    .optional(),
});

export type EtherscanLookupRequest = z.infer<typeof EtherscanLookupRequestSchema>;

type ExplorerChainConfig = {
  apiBaseUrl: string;
};

const REQUEST_TIMEOUT_MS = 15_000;
const JSON_HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
};

const ETHERSCAN_CHAINS: Record<number, ExplorerChainConfig> = {
  1: {
    apiBaseUrl: "https://api.etherscan.io/api",
  },
  10: {
    apiBaseUrl: "https://api-optimistic.etherscan.io/api",
  },
  56: {
    apiBaseUrl: "https://api.bscscan.com/api",
  },
  97: {
    apiBaseUrl: "https://api-testnet.bscscan.com/api",
  },
  137: {
    apiBaseUrl: "https://api.polygonscan.com/api",
  },
  250: {
    apiBaseUrl: "https://api.ftmscan.com/api",
  },
  8453: {
    apiBaseUrl: "https://api.basescan.org/api",
  },
  84532: {
    apiBaseUrl: "https://api-sepolia.basescan.org/api",
  },
  17000: {
    apiBaseUrl: "https://api-holesky.etherscan.io/api",
  },
  42161: {
    apiBaseUrl: "https://api.arbiscan.io/api",
  },
  421614: {
    apiBaseUrl: "https://api-sepolia.arbiscan.io/api",
  },
  43114: {
    apiBaseUrl: "https://api.snowtrace.io/api",
  },
  11155111: {
    apiBaseUrl: "https://api-sepolia.etherscan.io/api",
  },
  11155420: {
    apiBaseUrl: "https://api-sepolia-optimism.etherscan.io/api",
  },
  80002: {
    apiBaseUrl: "https://api-amoy.polygonscan.com/api",
  },
};

const normalizeEnvString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const jsonResponse = (status: number, payload: Record<string, unknown>): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });

export function parseEtherscanLookupRequest(
  body: unknown
): EtherscanLookupRequest | null {
  const parsed = EtherscanLookupRequestSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

export async function handleEtherscanLookup(
  body: unknown,
  env: NodeJS.ProcessEnv = process.env
): Promise<Response> {
  const request = parseEtherscanLookupRequest(body);
  if (!request) {
    return jsonResponse(400, { error: "invalid_request" });
  }

  const chain = ETHERSCAN_CHAINS[request.chainId];
  if (!chain) {
    return jsonResponse(400, { error: "unsupported_chain" });
  }

  const apiKey = request.personalApiKey || normalizeEnvString(env.ETHERSCAN_API_KEY);
  if (!apiKey) {
    return jsonResponse(503, { error: "explorer_key_not_configured" });
  }

  const upstreamUrl = new URL(chain.apiBaseUrl);
  upstreamUrl.searchParams.set("module", "contract");
  upstreamUrl.searchParams.set("action", request.action);
  upstreamUrl.searchParams.set("address", request.address);
  upstreamUrl.searchParams.set("apikey", apiKey);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    });

    const headers = new Headers({ "cache-control": "no-store" });
    const contentType = upstream.headers.get("content-type");
    if (contentType) {
      headers.set("content-type", contentType);
    }
    const vary = upstream.headers.get("vary");
    if (vary) {
      headers.set("vary", vary);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonResponse(504, { error: "explorer_timeout" });
    }
    return jsonResponse(502, { error: "explorer_unreachable" });
  } finally {
    clearTimeout(timeout);
  }
}
