const BRIDGE_BOOTSTRAP_SUBPATHS = new Set([
  "simulate",
  "debug/prepare",
  "debug/start",
]);

const MEZO_CHAIN_IDS = new Set([31611, 31612]);

export interface EdbBridgeEnv {
  EDB_BRIDGE_URL?: string;
  EDB_DEFAULT_BRIDGE_URL?: string;
  EDB_MEZO_BRIDGE_URL?: string;
}

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function withoutTrailingMezoPath(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[parts.length - 1]?.toLowerCase() === "mezo") {
      parts.pop();
      url.pathname = parts.length > 0 ? `/${parts.join("/")}` : "/";
    }
    url.search = "";
    url.hash = "";
    return stripTrailingSlash(url.toString());
  } catch {
    return stripTrailingSlash(value.replace(/\/mezo\/?$/i, ""));
  }
}

function withTrailingMezoPath(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[parts.length - 1]?.toLowerCase() !== "mezo") {
      parts.push("mezo");
      url.pathname = `/${parts.join("/")}`;
    }
    url.search = "";
    url.hash = "";
    return stripTrailingSlash(url.toString());
  } catch {
    const stripped = stripTrailingSlash(value);
    return /\/mezo$/i.test(stripped) ? stripped : `${stripped}/mezo`;
  }
}

function isJsonContentType(contentType: string | string[] | undefined): boolean {
  if (Array.isArray(contentType)) {
    return contentType.some((value) => value.toLowerCase().includes("application/json"));
  }
  return typeof contentType === "string" && contentType.toLowerCase().includes("application/json");
}

function coerceChainId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : null;
  }
  return null;
}

export function isMezoChainId(chainId: number | null | undefined): boolean {
  return typeof chainId === "number" && MEZO_CHAIN_IDS.has(chainId);
}

export function extractChainIdFromPayload(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const obj = payload as Record<string, unknown>;
  const direct = coerceChainId(obj.chainId ?? obj.networkId);
  if (direct !== null) return direct;

  const chain = obj.chain;
  if (chain && typeof chain === "object" && !Array.isArray(chain)) {
    const fromChain = coerceChainId((chain as Record<string, unknown>).id);
    if (fromChain !== null) return fromChain;
  }

  const network = obj.network;
  if (network && typeof network === "object" && !Array.isArray(network)) {
    const fromNetwork = coerceChainId(
      (network as Record<string, unknown>).chainId ??
        (network as Record<string, unknown>).id,
    );
    if (fromNetwork !== null) return fromNetwork;
  }

  return null;
}

export function extractChainIdFromRawJsonBody(
  body: Buffer | undefined,
  contentType: string | string[] | undefined,
): number | null {
  if (!body || !isJsonContentType(contentType)) return null;
  try {
    return extractChainIdFromPayload(JSON.parse(body.toString("utf8")));
  } catch {
    return null;
  }
}

export function resolveEdbBridgeUrl(
  chainId: number | null | undefined,
  env: EdbBridgeEnv,
  fallbackBridgeUrl: string,
): string {
  const configuredBridge =
    normalizeEnvValue(env.EDB_BRIDGE_URL) || fallbackBridgeUrl;
  const defaultBridge =
    normalizeEnvValue(env.EDB_DEFAULT_BRIDGE_URL) ||
    withoutTrailingMezoPath(configuredBridge);
  const mezoBridge =
    normalizeEnvValue(env.EDB_MEZO_BRIDGE_URL) ||
    withTrailingMezoPath(configuredBridge);

  return isMezoChainId(chainId) ? mezoBridge : defaultBridge;
}

export function appendEdbBridgeSubPath(
  bridgeUrl: string,
  subPath: string,
  search = "",
): string {
  const cleanBridgeUrl = stripTrailingSlash(bridgeUrl);
  const cleanSubPath = subPath.replace(/^\/+/, "");
  const path = cleanSubPath ? `/${cleanSubPath}` : "";
  return `${cleanBridgeUrl}${path}${search}`;
}

export function maybeInjectDefaultEtherscanKey(
  body: Buffer | undefined,
  contentType: string | string[] | undefined,
  subPath: string,
  etherscanApiKey: string | undefined,
): Buffer | undefined {
  const normalizedKey = normalizeEnvValue(etherscanApiKey);
  const normalizedSubPath = subPath.replace(/^\/+/, "").replace(/\/+$/, "");

  if (
    !body ||
    !normalizedKey ||
    !BRIDGE_BOOTSTRAP_SUBPATHS.has(normalizedSubPath) ||
    !isJsonContentType(contentType)
  ) {
    return body;
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(body.toString("utf8"));
  } catch {
    return body;
  }

  if (!parsedBody || typeof parsedBody !== "object" || Array.isArray(parsedBody)) {
    return body;
  }

  const payload = parsedBody as Record<string, unknown>;
  const existingAnalysisOptions =
    payload.analysisOptions &&
    typeof payload.analysisOptions === "object" &&
    !Array.isArray(payload.analysisOptions)
      ? { ...(payload.analysisOptions as Record<string, unknown>) }
      : {};

  const existingKey =
    typeof existingAnalysisOptions.etherscanApiKey === "string"
      ? existingAnalysisOptions.etherscanApiKey.trim()
      : "";

  if (existingKey) {
    return body;
  }

  const nextPayload = {
    ...payload,
    analysisOptions: {
      ...existingAnalysisOptions,
      etherscanApiKey: normalizedKey,
    },
  };

  return Buffer.from(JSON.stringify(nextPayload));
}
