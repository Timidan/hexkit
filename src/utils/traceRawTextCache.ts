const rawTextCache = new WeakMap<object, string>();

export const cacheRawTraceText = (rawTrace: unknown, rawText: string) => {
  if (!rawTrace || typeof rawTrace !== "object") return;
  rawTextCache.set(rawTrace as object, rawText);
};

export const getCachedRawTraceText = (rawTrace: unknown) => {
  if (!rawTrace || typeof rawTrace !== "object") return undefined;
  return rawTextCache.get(rawTrace as object);
};

export const clearCachedRawTraceText = (rawTrace: unknown) => {
  if (!rawTrace || typeof rawTrace !== "object") return;
  rawTextCache.delete(rawTrace as object);
};
