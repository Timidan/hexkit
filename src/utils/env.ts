const env = import.meta.env as unknown as Record<string, string | undefined>;

const readEnv = (keys: string[], fallback = "") => {
  for (const key of keys) {
    const value = env[key];
    if (value) {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return fallback;
};

export const getSimulatorBridgeUrl = () => {
  const value = readEnv(
    ["VITE_SIMULATOR_BRIDGE_URL"],
    "/api/edb"
  );

  if (!value) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (["disabled", "disable", "off", "false", "none"].includes(normalized)) {
    return "";
  }

  return value;
};

export const getStarknetSimBridgeUrl = () => {
  const value = readEnv(
    ["VITE_STARKNET_SIM_BRIDGE_URL"],
    "/api/starknet-sim"
  );

  if (!value) {
    return "";
  }

  const normalized = value.trim().toLowerCase();
  if (["disabled", "disable", "off", "false", "none"].includes(normalized)) {
    return "";
  }

  return value;
};

/** Returns default headers for bridge requests. API key is injected
 *  server-side by the proxy.
 *
 *  Pass `{ method: "GET" }` to omit `Content-Type: application/json` —
 *  GET requests have no body so the header is harmless but technically
 *  wrong (audit P3). Defaults to a JSON content type to preserve
 *  existing POST/PUT call sites that don't pass options. */
export const getBridgeHeaders = (
  extra?: Record<string, string>,
  options?: { method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" },
): Record<string, string> => {
  const method = options?.method;
  const base: Record<string, string> =
    method === "GET" ? {} : { 'Content-Type': 'application/json' };
  return { ...base, ...extra };
};
