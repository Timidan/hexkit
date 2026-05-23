import { ethers } from "ethers";
import type { Address } from "viem";
import type { Config } from "@wagmi/core";
import {
  getWalletClient as getWagmiWalletClient,
  waitForTransactionReceipt as wagmiWaitForReceipt,
} from "@wagmi/core";

import {
  fetchComposerQuote,
  fetchCrossChainStatus,
} from "./earnApi";
import { networkConfigManager } from "../../../config/networkConfig";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import { isNativeToken } from "../../../utils/addressConstants";
import { formatTxError } from "./txUtils";
import type { EarnToken, EarnVault } from "./types";

/**
 * Cross-chain Composer deposit — bridge fromToken on chain A to the vault's
 * underlying on chain B, then deposit that underlying into the vault. Two
 * distinct user-signed transactions chained behind LI.FI status polling.
 *
 * Built because Composer can route fromToken (chain A) -> underlying (chain B)
 * in one tx but can't currently route fromToken (chain A) -> vault share
 * (chain B) — so the UI's single-tx path fails for the cross-chain case.
 *
 * Sharp edges this code is paranoid about, derived from the same-chain
 * `handleTwoStepExecute` audit:
 *
 *   1. **Bridge settlement, not source receipt.** The source tx receipt only
 *      proves funds left chain A; it does not prove the underlying landed on
 *      chain B. We poll `fetchCrossChainStatus` until `DONE` before reading the
 *      destination balance. Status `FAILED`/`INVALID` is terminal failure of
 *      the bridge leg.
 *
 *   2. **Balance delta, not total.** The user may already hold the underlying
 *      on chain B. We snapshot the balance before the bridge and deposit
 *      `postBalance - preBalance` (clamped to >=0). This avoids both
 *      under-depositing (toAmountMin leaves dust) and over-depositing pre-
 *      existing balance.
 *
 *   3. **USDT-style allowance reset.** Some ERC-20s revert when calling
 *      `approve(spender, n)` while a nonzero allowance is live (USDT being the
 *      canonical example). Before approving the deposit, if the current
 *      allowance is nonzero we call `approve(spender, 0)` and wait for that
 *      receipt before approving the real amount.
 *
 *   4. **Recoverable mid-flow failure.** If the bridge settles but the deposit
 *      tx fails, the user *still has their bridged funds*. The state machine
 *      surfaces `bridge-settled` with `bridgeTxHash` + `destinationAmountRaw`
 *      so the UI can offer a "Retry deposit" affordance. Callers can resume
 *      via the `resumeFromBridgeSettled` parameter — that path skips the
 *      bridge entirely and re-quotes the deposit against the on-chain balance
 *      delta the caller persisted.
 */

export type CrossChainDepositPhase =
  | "idle"
  | "quoting-bridge"
  | "approving-bridge"
  | "signing-bridge"
  | "bridging"
  | "bridge-settled"
  | "quoting-deposit"
  | "approving-deposit"
  | "signing-deposit"
  | "depositing"
  | "done"
  | "failed";

/**
 * Discriminated union — every phase carries the fields the UI legitimately
 * needs at that point. Earlier fields persist into later phases (e.g.
 * bridgeTxHash stays once it's set) so the timeline component can render a
 * full history without each phase having to opt back in.
 */
export type CrossChainDepositState =
  | { phase: "idle" }
  | { phase: "quoting-bridge" }
  | {
      phase: "approving-bridge";
      bridgeApprovalSpender: string;
    }
  | {
      phase: "signing-bridge";
      bridgeApprovalSpender?: string;
    }
  | {
      phase: "bridging";
      bridgeTxHash: string;
      bridgeStatus?: string;
      bridgeSubstatus?: string;
    }
  | {
      phase: "bridge-settled";
      bridgeTxHash: string;
      destinationAmountRaw: string;
      // If the destination amount is zero or unreadable, callers can still
      // attempt the deposit step with the bridge-quoted toAmountMin as a
      // fallback. We expose both so the UI can warn.
      destinationToken: EarnToken;
    }
  | {
      phase: "quoting-deposit";
      bridgeTxHash: string;
      destinationAmountRaw: string;
    }
  | {
      phase: "approving-deposit";
      bridgeTxHash: string;
      destinationAmountRaw: string;
      depositApprovalSpender: string;
    }
  | {
      phase: "signing-deposit";
      bridgeTxHash: string;
      destinationAmountRaw: string;
    }
  | {
      phase: "depositing";
      bridgeTxHash: string;
      depositTxHash: string;
      destinationAmountRaw: string;
    }
  | {
      phase: "done";
      bridgeTxHash: string;
      depositTxHash: string;
    }
  | {
      // `failedAfterBridge` discriminates a recoverable failure: the bridge
      // settled, the user owns the underlying on the destination chain, and
      // the UI can offer a "Retry deposit" affordance. Without this flag a
      // failure is terminal (bridge never landed, or the user rejected).
      phase: "failed";
      message: string;
      failedAfterBridge: boolean;
      bridgeTxHash?: string;
      destinationAmountRaw?: string;
    };

export interface ExecuteCrossChainComposerDepositArgs {
  wagmiConfig: Config;
  sourceChainId: number;
  sourceToken: EarnToken;
  sourceAmountRaw: string;
  vault: EarnVault;
  /**
   * The ERC-20 the bridge will deliver to the user on the vault's chain. Must
   * be one of the vault's underlying tokens — the function will then deposit
   * it into the vault in step 2.
   */
  destinationUnderlying: EarnToken;
  userAddress: Address;
  onStateChange: (state: CrossChainDepositState) => void;
  /**
   * Wraps `useSwitchChain().switchChainAsync` from the caller. We accept it as
   * a closure (not a wagmi mutate fn) so this module stays React-free.
   */
  switchChain: (chainId: number) => Promise<void>;
  /**
   * If provided, skip the bridge leg entirely and retry the deposit step using
   * this already-settled bridge as context. Used by the UI's "Retry deposit"
   * affordance after a `failedAfterBridge` failure. The caller is responsible
   * for persisting `bridgeTxHash` and `destinationAmountRaw` from the
   * `bridge-settled` state.
   */
  resumeFromBridgeSettled?: {
    bridgeTxHash: string;
    destinationAmountRaw: string;
  };
}

const APPROVE_ABI = new ethers.utils.Interface([
  "function approve(address spender, uint256 amount) returns (bool)",
]);
const ERC20_READ_ABI = [
  "function allowance(address,address) view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

/** Max poll duration for LI.FI bridge settlement before giving up. */
const BRIDGE_POLL_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes (matches LI.FI's documented upper bound)
const BRIDGE_POLL_INTERVAL_MS = 4_000;
const RECEIPT_TIMEOUT_MS = 180_000;

function chainRpcProvider(chainId: number): ethers.providers.JsonRpcProvider | null {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;
  const resolution = networkConfigManager.resolveRpcUrl(chainId, chain.rpcUrl);
  if (!resolution.url) return null;
  return new ethers.providers.StaticJsonRpcProvider(resolution.url, chainId);
}

async function readAllowance(
  tokenAddress: string,
  owner: string,
  spender: string,
  chainId: number,
): Promise<ethers.BigNumber> {
  if (isNativeToken(tokenAddress)) return ethers.BigNumber.from(0);
  const provider = chainRpcProvider(chainId);
  if (!provider) return ethers.BigNumber.from(0);
  const erc20 = new ethers.Contract(tokenAddress, ERC20_READ_ABI, provider);
  return erc20.allowance(owner, spender);
}

async function readBalance(
  tokenAddress: string,
  owner: string,
  chainId: number,
): Promise<ethers.BigNumber> {
  const provider = chainRpcProvider(chainId);
  if (!provider) return ethers.BigNumber.from(0);
  if (isNativeToken(tokenAddress)) return provider.getBalance(owner);
  const erc20 = new ethers.Contract(tokenAddress, ERC20_READ_ABI, provider);
  return erc20.balanceOf(owner);
}

/**
 * Issue an `approve(spender, amount)` and wait for confirmation, resetting a
 * nonzero allowance to 0 first when the token requires it. We always reset
 * unconditionally when allowance is nonzero — the cost is one extra tx for
 * non-USDT tokens, which is a fair price to avoid bricking USDT-style flows.
 */
async function approveWithReset(args: {
  wagmiConfig: Config;
  walletClient: NonNullable<Awaited<ReturnType<typeof getWagmiWalletClient>>>;
  tokenAddress: string;
  spender: string;
  amount: ethers.BigNumber;
  chainId: number;
  currentAllowance: ethers.BigNumber;
}): Promise<void> {
  const { wagmiConfig, walletClient, tokenAddress, spender, amount, chainId, currentAllowance } = args;
  if (currentAllowance.gte(amount)) return;

  if (currentAllowance.gt(0)) {
    const resetData = APPROVE_ABI.encodeFunctionData("approve", [
      spender,
      ethers.constants.Zero,
    ]) as `0x${string}`;
    const resetHash = await walletClient.sendTransaction({
      to: tokenAddress as `0x${string}`,
      data: resetData,
      // viem requires the chain object — we pass id only and rely on the
      // wallet client already being scoped to chainId.
      chain: { id: chainId } as any,
    });
    const resetReceipt = await wagmiWaitForReceipt(wagmiConfig, {
      hash: resetHash,
      chainId,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    if (resetReceipt.status === "reverted") {
      throw new Error("Allowance reset transaction reverted onchain");
    }
  }

  const data = APPROVE_ABI.encodeFunctionData("approve", [
    spender,
    ethers.constants.MaxUint256,
  ]) as `0x${string}`;
  const hash = await walletClient.sendTransaction({
    to: tokenAddress as `0x${string}`,
    data,
    chain: { id: chainId } as any,
  });
  const receipt = await wagmiWaitForReceipt(wagmiConfig, {
    hash,
    chainId,
    timeout: RECEIPT_TIMEOUT_MS,
  });
  if (receipt.status === "reverted") {
    throw new Error("Approval transaction reverted onchain");
  }
}

/**
 * Outcome of bridge polling — `DONE` alone is not "tokens delivered to dest"
 * (LI.FI uses DONE for COMPLETED, PARTIAL, and REFUNDED). We collapse the
 * destination-arrived case into `COMPLETED`; everything else is failure.
 */
type BridgeOutcome = "COMPLETED" | "REFUNDED" | "PARTIAL" | "FAILED" | "INVALID";

async function waitForBridgeSettlement(args: {
  txHash: string;
  fromChain: number;
  toChain: number;
  onUpdate: (status: string, substatus?: string) => void;
}): Promise<BridgeOutcome> {
  const deadline = Date.now() + BRIDGE_POLL_TIMEOUT_MS;
  let consecutiveErrors = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() > deadline) {
      throw new Error("Bridge settlement timed out after 30 minutes");
    }
    try {
      const status = await fetchCrossChainStatus({
        txHash: args.txHash,
        fromChain: args.fromChain,
        toChain: args.toChain,
      });
      consecutiveErrors = 0;
      args.onUpdate(status.status, status.substatusMessage ?? status.substatus);
      if (status.status === "DONE") {
        // LI.FI substatus disambiguates: COMPLETED = tokens delivered,
        // REFUNDED = bridge gave the funds back on origin, PARTIAL = some
        // delivered but not the requested amount. Default to COMPLETED only
        // when substatus is missing AND status is DONE — most well-behaved
        // bridges set substatus.
        const sub = (status.substatus ?? "").toUpperCase();
        if (sub === "REFUNDED") return "REFUNDED";
        if (sub === "PARTIAL") return "PARTIAL";
        return "COMPLETED";
      }
      if (status.status === "FAILED") return "FAILED";
      if (status.status === "INVALID") return "INVALID";
      // NOT_FOUND / PENDING — keep polling
    } catch (err) {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 5) {
        throw err;
      }
    }
    await new Promise((r) => setTimeout(r, BRIDGE_POLL_INTERVAL_MS));
  }
}

export async function executeCrossChainComposerDeposit(
  args: ExecuteCrossChainComposerDepositArgs,
): Promise<void> {
  const {
    wagmiConfig,
    sourceChainId,
    sourceToken,
    sourceAmountRaw,
    vault,
    destinationUnderlying,
    userAddress,
    onStateChange,
    switchChain,
    resumeFromBridgeSettled,
  } = args;

  // ── Sanity ────────────────────────────────────────────────────────────
  if (sourceChainId === vault.chainId) {
    throw new Error(
      "Cross-chain Composer deposit invoked for same-chain pair — use the single-tx flow instead",
    );
  }
  const isDestUnderlyingForVault = (vault.underlyingTokens ?? []).some(
    (t) => t.address.toLowerCase() === destinationUnderlying.address.toLowerCase(),
  );
  if (!isDestUnderlyingForVault) {
    throw new Error(
      "destinationUnderlying must be one of the vault's underlying tokens",
    );
  }

  let bridgeTxHash: string | null = resumeFromBridgeSettled?.bridgeTxHash ?? null;
  let destinationAmountRaw: string | null =
    resumeFromBridgeSettled?.destinationAmountRaw ?? null;

  // Helper: build a "failed" state with the right recoverability flag.
  // `failedAfterBridge` means "the bridge tx already landed" — funds may be
  // on the destination chain. Only `bridgeTxHash` matters; we used to also
  // require `destinationAmountRaw`, but post-bridge balance-read failures
  // happen BEFORE we can assign that, and they're still recoverable (user
  // can retry the deposit step once the RPC catches up).
  const fail = (err: unknown): never => {
    const msg = formatTxError(err);
    onStateChange({
      phase: "failed",
      message: msg,
      failedAfterBridge: bridgeTxHash !== null,
      bridgeTxHash: bridgeTxHash ?? undefined,
      destinationAmountRaw: destinationAmountRaw ?? undefined,
    });
    throw err instanceof Error ? err : new Error(msg);
  };

  // ─────────────────────────────────────────────────────────────────────
  // STAGE 1: bridge (skip if resuming)
  // ─────────────────────────────────────────────────────────────────────
  if (!resumeFromBridgeSettled) {
    // Snapshot the destination underlying balance BEFORE bridging so we can
    // compute the delta after settlement. CRITICAL: a failed read must NOT
    // default to 0 — the user could already hold destination-chain tokens
    // from other sources, and `post - 0` would silently deposit those too.
    let preBridgeDestBalance: ethers.BigNumber;
    try {
      preBridgeDestBalance = await readBalance(
        destinationUnderlying.address,
        userAddress,
        vault.chainId,
      );
    } catch (err) {
      fail(new Error(
        "Couldn't read destination balance before bridging — refusing to proceed (would risk depositing unrelated funds). Try again in a moment.",
      ));
      return;
    }

    // ── Quote bridge: source -> destination underlying ──────────────────
    onStateChange({ phase: "quoting-bridge" });
    let bridgeQuote;
    try {
      bridgeQuote = await fetchComposerQuote({
        fromChain: sourceChainId,
        toChain: vault.chainId,
        fromToken: sourceToken.address,
        toToken: destinationUnderlying.address,
        fromAddress: userAddress,
        toAddress: userAddress,
        fromAmount: sourceAmountRaw,
      });
    } catch (err) {
      fail(err);
      return;
    }

    // ── Switch chain & get wallet client for the source chain ──────────
    try {
      await switchChain(sourceChainId);
    } catch (err) {
      fail(err);
      return;
    }

    let sourceWalletClient;
    try {
      sourceWalletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: sourceChainId,
      });
      if (!sourceWalletClient) {
        throw new Error("No wallet client available on source chain");
      }
    } catch (err) {
      fail(err);
      return;
    }

    // ── Approve sourceToken for bridge (with USDT-style reset) ─────────
    if (!isNativeToken(sourceToken.address)) {
      const spender = bridgeQuote.estimate.approvalAddress;
      const sourceAmountBN = ethers.BigNumber.from(sourceAmountRaw);
      let currentAllowance: ethers.BigNumber;
      try {
        currentAllowance = await readAllowance(
          sourceToken.address,
          userAddress,
          spender,
          sourceChainId,
        );
      } catch {
        currentAllowance = ethers.BigNumber.from(0);
      }
      if (currentAllowance.lt(sourceAmountBN)) {
        onStateChange({
          phase: "approving-bridge",
          bridgeApprovalSpender: spender,
        });
        try {
          await approveWithReset({
            wagmiConfig,
            walletClient: sourceWalletClient,
            tokenAddress: sourceToken.address,
            spender,
            amount: sourceAmountBN,
            chainId: sourceChainId,
            currentAllowance,
          });
        } catch (err) {
          fail(err);
          return;
        }
      }
    }

    // ── Send bridge tx ─────────────────────────────────────────────────
    onStateChange({ phase: "signing-bridge" });
    let txHash: `0x${string}`;
    try {
      txHash = await sourceWalletClient.sendTransaction({
        to: bridgeQuote.transactionRequest.to as `0x${string}`,
        data: bridgeQuote.transactionRequest.data as `0x${string}`,
        value: bridgeQuote.transactionRequest.value
          ? BigInt(bridgeQuote.transactionRequest.value)
          : undefined,
        gas: bridgeQuote.transactionRequest.gasLimit
          ? BigInt(bridgeQuote.transactionRequest.gasLimit)
          : undefined,
        chain: { id: sourceChainId } as any,
      });
    } catch (err) {
      fail(err);
      return;
    }

    bridgeTxHash = txHash;
    onStateChange({
      phase: "bridging",
      bridgeTxHash: txHash,
    });

    // ── Wait for source receipt (proves tx mined, not bridge settled) ──
    try {
      const receipt = await wagmiWaitForReceipt(wagmiConfig, {
        hash: txHash,
        chainId: sourceChainId,
        timeout: RECEIPT_TIMEOUT_MS,
      });
      if (receipt.status === "reverted") {
        throw new Error("Bridge transaction reverted onchain");
      }
    } catch (err) {
      fail(err);
      return;
    }

    // ── Poll LI.FI status until terminal ────────────────────────────────
    let outcome: BridgeOutcome;
    try {
      outcome = await waitForBridgeSettlement({
        txHash,
        fromChain: sourceChainId,
        toChain: vault.chainId,
        onUpdate: (status, substatus) => {
          onStateChange({
            phase: "bridging",
            bridgeTxHash: txHash,
            bridgeStatus: status,
            bridgeSubstatus: substatus,
          });
        },
      });
    } catch (err) {
      fail(err);
      return;
    }
    if (outcome === "REFUNDED") {
      fail(new Error("Bridge refunded — funds returned to the source chain. Deposit will not proceed."));
      return;
    }
    if (outcome === "PARTIAL") {
      fail(new Error("Bridge delivered only a partial amount. We won't auto-deposit a partial fill; review on LI.FI and decide whether to deposit manually."));
      return;
    }
    if (outcome !== "COMPLETED") {
      fail(new Error(`Bridge ${outcome.toLowerCase()} — funds may be stranded; check the source tx on LI.FI`));
      return;
    }

    // ── Read destination balance DELTA ─────────────────────────────────
    let postBridgeDestBalance: ethers.BigNumber;
    try {
      postBridgeDestBalance = await readBalance(
        destinationUnderlying.address,
        userAddress,
        vault.chainId,
      );
    } catch (err) {
      // Bridge completed but we can't measure delivered amount. Recoverable:
      // the user can retry from `bridge-settled` once the RPC catches up.
      fail(new Error(
        "Bridge settled but we couldn't read your destination balance. Your funds arrived; retry the deposit step.",
      ));
      return;
    }
    const delta = postBridgeDestBalance.sub(preBridgeDestBalance);
    if (delta.lte(0)) {
      fail(new Error(
        "Bridge settled but destination balance hasn't increased yet (RPC lag). Wait a moment and retry the deposit step.",
      ));
      return;
    }
    destinationAmountRaw = delta.toString();

    onStateChange({
      phase: "bridge-settled",
      bridgeTxHash: txHash,
      destinationAmountRaw,
      destinationToken: destinationUnderlying,
    });
  } else {
    // Resuming after a post-bridge failure. Trust on-chain reality, not the
    // stored destinationAmountRaw — the user may have spent / received more
    // of the destination token, or the original delta may have been 0 due to
    // RPC lag at first read. Re-read and treat the live balance as the
    // depositable amount (capped at "what arrived" by reading the bridge
    // status's `receiving.amount` when available, so we don't grab unrelated
    // pre-existing balance).
    let liveBalance: ethers.BigNumber;
    try {
      liveBalance = await readBalance(
        destinationUnderlying.address,
        userAddress,
        vault.chainId,
      );
    } catch (err) {
      fail(new Error("Couldn't read destination balance for retry. Try again in a moment."));
      return;
    }
    if (liveBalance.lte(0)) {
      fail(new Error("Destination balance is zero. Bridge may still be settling, or funds were already deposited."));
      return;
    }
    // Cap retry amount at the originally-bridged amount when known. If the
    // stored value is "0" (the old broken case), fall back to the live
    // balance — risky but only reachable from a recoverable-fail state the
    // user explicitly retried.
    let chosen = liveBalance;
    try {
      const original = ethers.BigNumber.from(destinationAmountRaw ?? "0");
      if (original.gt(0) && liveBalance.gte(original)) {
        chosen = original;
      }
    } catch {
      /* keep liveBalance */
    }
    destinationAmountRaw = chosen.toString();

    onStateChange({
      phase: "bridge-settled",
      bridgeTxHash: bridgeTxHash!,
      destinationAmountRaw,
      destinationToken: destinationUnderlying,
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // STAGE 2: deposit underlying -> vault (same-chain on vault.chainId)
  // ─────────────────────────────────────────────────────────────────────
  // At this point bridgeTxHash and destinationAmountRaw are non-null.
  const lockedBridgeHash = bridgeTxHash as string;
  const lockedDestAmount = destinationAmountRaw as string;

  onStateChange({
    phase: "quoting-deposit",
    bridgeTxHash: lockedBridgeHash,
    destinationAmountRaw: lockedDestAmount,
  });

  let depositQuote;
  try {
    depositQuote = await fetchComposerQuote({
      fromChain: vault.chainId,
      toChain: vault.chainId,
      fromToken: destinationUnderlying.address,
      toToken: vault.address,
      fromAddress: userAddress,
      toAddress: userAddress,
      fromAmount: lockedDestAmount,
    });
  } catch (err) {
    fail(err);
    return;
  }

  try {
    await switchChain(vault.chainId);
  } catch (err) {
    fail(err);
    return;
  }

  let destWalletClient;
  try {
    destWalletClient = await getWagmiWalletClient(wagmiConfig, {
      chainId: vault.chainId,
    });
    if (!destWalletClient) {
      throw new Error("No wallet client available on destination chain");
    }
  } catch (err) {
    fail(err);
    return;
  }

  // ── Approve underlying for vault deposit (with USDT-style reset) ─────
  if (!isNativeToken(destinationUnderlying.address)) {
    const spender = depositQuote.estimate.approvalAddress;
    const depositAmountBN = ethers.BigNumber.from(lockedDestAmount);
    let currentAllowance: ethers.BigNumber;
    try {
      currentAllowance = await readAllowance(
        destinationUnderlying.address,
        userAddress,
        spender,
        vault.chainId,
      );
    } catch {
      currentAllowance = ethers.BigNumber.from(0);
    }
    if (currentAllowance.lt(depositAmountBN)) {
      onStateChange({
        phase: "approving-deposit",
        bridgeTxHash: lockedBridgeHash,
        destinationAmountRaw: lockedDestAmount,
        depositApprovalSpender: spender,
      });
      try {
        await approveWithReset({
          wagmiConfig,
          walletClient: destWalletClient,
          tokenAddress: destinationUnderlying.address,
          spender,
          amount: depositAmountBN,
          chainId: vault.chainId,
          currentAllowance,
        });
      } catch (err) {
        fail(err);
        return;
      }
    }
  }

  // ── Send deposit tx ───────────────────────────────────────────────────
  onStateChange({
    phase: "signing-deposit",
    bridgeTxHash: lockedBridgeHash,
    destinationAmountRaw: lockedDestAmount,
  });
  let depositHash: `0x${string}`;
  try {
    depositHash = await destWalletClient.sendTransaction({
      to: depositQuote.transactionRequest.to as `0x${string}`,
      data: depositQuote.transactionRequest.data as `0x${string}`,
      value: depositQuote.transactionRequest.value
        ? BigInt(depositQuote.transactionRequest.value)
        : undefined,
      gas: depositQuote.transactionRequest.gasLimit
        ? BigInt(depositQuote.transactionRequest.gasLimit)
        : undefined,
      chain: { id: vault.chainId } as any,
    });
  } catch (err) {
    fail(err);
    return;
  }

  onStateChange({
    phase: "depositing",
    bridgeTxHash: lockedBridgeHash,
    depositTxHash: depositHash,
    destinationAmountRaw: lockedDestAmount,
  });

  try {
    const receipt = await wagmiWaitForReceipt(wagmiConfig, {
      hash: depositHash,
      chainId: vault.chainId,
      timeout: RECEIPT_TIMEOUT_MS,
    });
    if (receipt.status === "reverted") {
      throw new Error("Deposit transaction reverted onchain");
    }
  } catch (err) {
    fail(err);
    return;
  }

  onStateChange({
    phase: "done",
    bridgeTxHash: lockedBridgeHash,
    depositTxHash: depositHash,
  });
}
