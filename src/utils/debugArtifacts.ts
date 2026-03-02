export const extractInlineArtifacts = (
  rawTrace: unknown
): Record<string, unknown> | null => {
  if (!rawTrace) return null;

  let parsed: unknown = rawTrace;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (parsed && typeof parsed === 'object' && 'rawTrace' in parsed) {
    const nested = (parsed as { rawTrace?: unknown }).rawTrace;
    if (nested) {
      if (typeof nested === 'string') {
        try {
          parsed = JSON.parse(nested);
        } catch {
          // Ignore nested parse failure and keep current parsed value
        }
      } else {
        parsed = nested;
      }
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const artifacts =
    (parsed as { artifacts?: unknown; artifacts_inline?: unknown }).artifacts ??
    (parsed as { artifacts_inline?: unknown }).artifacts_inline;

  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) {
    return null;
  }

  return artifacts as Record<string, unknown>;
};
