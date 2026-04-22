// =============================================================================
// Security: Credential Redaction
// IMPORTANT: Never log or return RPC URLs in plain text
// =============================================================================

/**
 * Redact RPC URL for safe logging - shows provider type but hides API keys
 * @param {string} url
 * @returns {string}
 */
export function redactRpcUrl(url) {
  if (!url) return "[empty]";
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("alchemy.com")) {
      const network = parsed.hostname.split(".")[0];
      return `alchemy://${network}/***`;
    }
    if (parsed.hostname.includes("infura.io")) {
      const network = parsed.hostname.split(".")[0];
      return `infura://${network}/***`;
    }
    if (parsed.hostname.includes("quiknode.pro")) {
      return "quicknode://***";
    }
    if (parsed.hostname.includes("ankr.com")) {
      return "ankr://***";
    }
    // Generic - show hostname domain only
    return `rpc://${parsed.hostname.replace(/\..+$/, "")}...`;
  } catch {
    return "[invalid-url]";
  }
}
