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

/** Returns default headers for bridge requests. API key is injected server-side by the proxy. */
export const getBridgeHeaders = (extra?: Record<string, string>): Record<string, string> => {
  return { 'Content-Type': 'application/json', ...extra };
};
