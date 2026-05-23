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

import {
  readContract as wagmiReadContract,
  waitForTransactionReceipt as wagmiWaitForReceipt,
  type Config,
} from "@wagmi/core";
import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

const ERC20_APPROVE_ABI = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

/**
 * Issue `approve(spender, amount)`, resetting a nonzero allowance to zero
 * first when needed. USDT and a handful of other ERC-20s revert on
 * `approve(spender, X)` when an existing nonzero `approve(spender, Y)` is
 * already set — must `approve(spender, 0)` first. Always paying the extra tx
 * when allowance is nonzero is safer than maintaining a token allowlist.
 *
 * No-op when current allowance >= amount.
 */
export async function safeApproveErc20(args: {
  wagmiConfig: Config;
  walletClient: {
    sendTransaction: (tx: { to: Address; data: Hex }) => Promise<Hex>;
  };
  token: Address;
  spender: Address;
  amount: bigint;
  owner: Address;
  chainId: number;
  timeoutMs?: number;
}): Promise<void> {
  const {
    wagmiConfig,
    walletClient,
    token,
    spender,
    amount,
    owner,
    chainId,
    timeoutMs = 120_000,
  } = args;

  const current = (await wagmiReadContract(wagmiConfig, {
    address: token,
    abi: ERC20_APPROVE_ABI,
    functionName: "allowance",
    args: [owner, spender],
    chainId,
  })) as bigint;

  if (current >= amount) return;

  if (current > 0n) {
    const resetData = encodeFunctionData({
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [spender, 0n],
    });
    const resetHash = await walletClient.sendTransaction({
      to: token,
      data: resetData,
    });
    await wagmiWaitForReceipt(wagmiConfig, {
      hash: resetHash,
      chainId,
      timeout: timeoutMs,
    });
  }

  const approveData = encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: "approve",
    args: [spender, amount],
  });
  const hash = await walletClient.sendTransaction({
    to: token,
    data: approveData,
  });
  await wagmiWaitForReceipt(wagmiConfig, {
    hash,
    chainId,
    timeout: timeoutMs,
  });
}
