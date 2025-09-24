const env = import.meta.env as unknown as Record<string, string | undefined>;

const readEnv = (keys: string[], fallback = "") => {
  for (const key of keys) {
    const value = env[key];
    if (value && value.length > 0) {
      return value;
    }
  }
  return fallback;
};

export const getAlchemyApiKey = () => readEnv(["API_KEY", "VITE_API_KEY"]);

export const getBlockscoutBytecodeDbUrl = () =>
  readEnv(
    ["VITE_BLOCKSCOUT_BYTECODE_DB_URL", "BLOCKSCOUT_BYTECODE_DB_URL"],
    "https://eth-bytecode-db.services.blockscout.com"
  );
