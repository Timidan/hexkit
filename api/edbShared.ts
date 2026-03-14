const BRIDGE_BOOTSTRAP_SUBPATHS = new Set([
  "simulate",
  "debug/prepare",
  "debug/start",
]);

function normalizeEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isJsonContentType(contentType: string | string[] | undefined): boolean {
  if (Array.isArray(contentType)) {
    return contentType.some((value) => value.toLowerCase().includes("application/json"));
  }
  return typeof contentType === "string" && contentType.toLowerCase().includes("application/json");
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
