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

export const getAlchemyApiKey = () => readEnv(["VITE_API_KEY"]);

export const getEtherscanApiKey = () => readEnv(["VITE_ETHERSCAN_API_KEY"]);

export const getBlockscoutBytecodeDbUrl = () =>
  readEnv(
    ["VITE_BLOCKSCOUT_BYTECODE_DB_URL"],
    "https://eth-bytecode-db.services.blockscout.com"
  );

export const getSimulatorBridgeUrl = () => {
  const value = readEnv(
    ["VITE_SIMULATOR_BRIDGE_URL"],
    "http://127.0.0.1:5789"
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

type RpcResolutionOptions = {
  envKeys: string[];
  fallback: string;
  alchemyTemplate?: (apiKey: string) => string;
  defaultValue?: string;
};

export const resolveRpcUrl = ({
  envKeys,
  fallback,
  alchemyTemplate,
  defaultValue,
}: RpcResolutionOptions): string => {
  const explicit = readEnv(envKeys);
  if (explicit) {
    return explicit;
  }

  if (defaultValue) {
    return defaultValue;
  }

  const alchemyKey = getAlchemyApiKey();
  if (alchemyTemplate && alchemyKey) {
    return alchemyTemplate(alchemyKey);
  }

  return fallback;
};
