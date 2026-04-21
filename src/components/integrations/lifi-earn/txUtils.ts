export { shortenAddress as shortAddress } from "../../shared/AddressDisplay";

/**
 * Turn a thrown error into a one-liner a user can act on.
 *
 * Viem/wagmi errors carry a structured `shortMessage` plus a fat `.message`
 * that appends "Request Arguments: …", "Details: …", "Version: viem@…" —
 * surfacing that verbatim dumps debug noise into the UI. We prefer
 * `shortMessage`, map common patterns to fixed strings, and fall back to the
 * first line of `.message` with the viem tails stripped.
 */
export function formatTxError(err: unknown): string {
  if (!err) return "Something went wrong";
  const e = err as {
    shortMessage?: string;
    message?: string;
    code?: number | string;
  };
  const combined = [e.shortMessage, e.message].filter(Boolean).join(" ").toLowerCase();

  if (
    e.code === 4001 ||
    combined.includes("user rejected") ||
    combined.includes("user denied") ||
    combined.includes("rejected the request")
  ) {
    return "Rejected in wallet";
  }
  if (combined.includes("insufficient funds")) {
    return "Insufficient funds for gas";
  }
  if (combined.includes("insufficient allowance") || combined.includes("exceeds allowance")) {
    return "Token allowance too low";
  }
  if (combined.includes("exceeds balance") || combined.includes("transfer amount exceeds")) {
    return "Insufficient token balance";
  }
  if (combined.includes("nonce too low")) {
    return "Nonce too low — retry";
  }
  if (combined.includes("replacement transaction underpriced")) {
    return "Replacement transaction underpriced";
  }
  if (combined.includes("chain mismatch") || combined.includes("wrong network")) {
    return "Wrong network — switch chain and retry";
  }
  if (combined.includes("timeout") || combined.includes("timed out")) {
    return "Request timed out — try again";
  }
  if (combined.includes("execution reverted") || combined.includes("reverted onchain")) {
    const match = /reverted:?\s*([^\n]+?)(?:\s*Request Arguments|\s*Details|\s*Version|$)/i.exec(
      e.shortMessage ?? e.message ?? ""
    );
    const reason = match?.[1]?.trim();
    return reason ? `Reverted: ${reason}` : "Transaction reverted";
  }

  const raw = e.shortMessage ?? e.message ?? String(err);
  // Strip the debug tails viem appends to `.message`.
  const trimmed = raw
    .split(/\n|Request Arguments:|Details:|Version:/)[0]
    ?.trim();
  if (trimmed && trimmed.length > 0 && trimmed.length <= 120) return trimmed;
  return "Transaction failed";
}

export { isNativeToken } from "../../../utils/addressConstants";
