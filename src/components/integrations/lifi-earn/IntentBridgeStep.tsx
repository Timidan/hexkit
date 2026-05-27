import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import {
  getWalletClient as getWagmiWalletClient,
  readContract as wagmiReadContract,
  waitForTransactionReceipt as wagmiWaitForReceipt,
} from "@wagmi/core";
import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import {
  ArrowRight,
  ArrowsClockwise,
  CircleNotch,
  Sparkle,
  XCircle,
} from "@phosphor-icons/react";
import { Button } from "../../ui/button";
import ChainIcon from "../../icons/ChainIcon";
import {
  requestIntentQuote,
  isDeliveredOrSettled,
  readDestinationTxHash,
  type IntentQuote,
} from "./intentsApi";
import { fetchComposerQuote } from "./earnApi";
import { IntentStatusTimeline } from "./IntentStatusTimeline";
import { useIntentOrderStatus } from "./useIntentOrderStatus";
import { encodeEip7930EvmAddress } from "../../../lib/intents/eip7930";
import { buildDeadlinePlan } from "../../../lib/intents/deadlines";
import { nextOrderNonce } from "../../../lib/intents/nonce";
import {
  buildStandardOrder,
  orderForAbi,
  type StandardOrder,
} from "../../../lib/intents/standardOrder";
import {
  INPUT_SETTLER_ESCROW,
  extractOpenOrderId,
  inputSettlerEscrowAbi,
} from "../../../lib/intents/contracts";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import type { DepositExecutionEvent } from "./concierge/types";
import type { EarnToken, EarnVault } from "./types";
import { formatTxError, isNativeToken, safeApproveErc20 } from "./txUtils";

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

type Stage =
  | "idle"
  | "quoting"
  | "quoted"
  | "approving"
  | "signing"
  | "open"
  // Post-delivery deposit phase — once the solver fills on destination we
  // need a second (same-chain) tx to land the underlying into the vault.
  | "deposit-quoting"
  | "deposit-approving"
  | "deposit-signing"
  | "deposit-done"
  | "deposit-failed"
  | "failed"
  | "refunding"
  | "refunded";

interface IntentBridgeStepProps {
  sourceChainId: number;
  sourceToken: EarnToken;
  sourceAmountRaw: string;
  vault: EarnVault;
  /** Where destination tokens land. Defaults to the connected wallet. */
  recipient?: Address;
  /** Fires when the user closes the panel after delivery (NOT a deposit confirmation). */
  onDismiss?: () => void;
  onExecutionEvent?: (event: DepositExecutionEvent) => void;
  /**
   * Fires when the user wants to fall back to the Composer flow — typically
   * after Intents reports "no quote available". The parent should flip its
   * Intents toggle off.
   */
  onFallbackToComposer?: () => void;
}

export function IntentBridgeStep({
  sourceChainId,
  sourceToken,
  sourceAmountRaw,
  vault,
  recipient,
  onDismiss,
  onExecutionEvent,
  onFallbackToComposer,
}: IntentBridgeStepProps) {
  const { address, isConnected, chain: walletChain } = useAccount();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();

  const outputToken = vault.underlyingTokens?.[0];
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<IntentQuote | null>(null);
  const [order, setOrder] = useState<StandardOrder | null>(null);
  const [openTxHash, setOpenTxHash] = useState<Hex | null>(null);
  const [orderId, setOrderId] = useState<Hex | null>(null);
  // Pre-open balance of the destination underlying so we can compute the
  // actual delivered amount (solver fills can drift vs. quote preview).
  const [predeliveryBalance, setPredeliveryBalance] = useState<bigint | null>(null);
  const [deliveredAmount, setDeliveredAmount] = useState<bigint | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<Hex | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const lastIntentStatusEventRef = useRef<string | null>(null);
  const lastDeliveredEventRef = useRef<string | null>(null);

  // Reset state on source/destination/recipient changes so we don't reuse a
  // stale quote, signed order, or orderId from a prior flow.
  useEffect(() => {
    setStage("idle");
    setError(null);
    setQuote(null);
    setOrder(null);
    setOpenTxHash(null);
    setOrderId(null);
    setPredeliveryBalance(null);
    setDeliveredAmount(null);
    setDepositTxHash(null);
    setDepositError(null);
    lastIntentStatusEventRef.current = null;
    lastDeliveredEventRef.current = null;
  }, [sourceChainId, sourceToken.address, sourceAmountRaw, vault.address, recipient]);

  const explorerByChain = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of SUPPORTED_CHAINS) {
      if (c.explorerUrl) map.set(c.id, c.explorerUrl);
    }
    return map;
  }, []);

  const recipientAddr = (recipient ?? address) as Address | undefined;

  // Shared with IntentStatusTimeline via React Query dedupe (same queryKey).
  // Keep polling through the deposit phase too — the order can transition
  // from Delivered → Settled while the user signs the deposit tx, and we
  // want the timeline to reflect that.
  const {
    status: orderStatus,
    state: orderState,
    rawLabel: orderStatusLabel,
  } = useIntentOrderStatus({
    onChainOrderId: orderId ?? undefined,
    enabled: isPostOpenStage(stage) || stage === "refunding",
  });
  const deliveryConfirmed = isDeliveredOrSettled(orderState);

  useEffect(() => {
    if (!onExecutionEvent) return;
    // CRITICAL: once stage === "refunded" we've locally fired the
    // terminal-good event from handleRefund. Any later poll cycle that
    // returns a stale/cached "Expired" or "Failed" status would, if
    // forwarded, get reduced to leg.status === "failed" and overwrite the
    // refunded state. Stop emitting once locally terminal.
    if (stage === "refunded" || stage === "deposit-done") return;
    if (!isPostOpenStage(stage) && stage !== "refunding") return;
    const destinationTxHash = readDestinationTxHash(orderStatus);
    const key = `${orderId ?? ""}:${orderStatusLabel}:${destinationTxHash ?? ""}`;
    if (lastIntentStatusEventRef.current === key) return;
    lastIntentStatusEventRef.current = key;
    onExecutionEvent({
      type: "intent-status",
      phase: "intent-open",
      orderId: orderId ?? undefined,
      status: orderStatusLabel,
      destinationTxHash,
    });
  }, [onExecutionEvent, orderId, orderStatus, orderStatusLabel, stage]);

  useEffect(() => {
    if (!onExecutionEvent || !deliveryConfirmed) return;
    const destinationTxHash = readDestinationTxHash(orderStatus);
    const amountRaw = deliveredAmount?.toString();
    const key = `${orderId ?? ""}:${destinationTxHash ?? ""}:${amountRaw ?? ""}`;
    if (lastDeliveredEventRef.current === key) return;
    lastDeliveredEventRef.current = key;
    onExecutionEvent({
      type: "delivered",
      phase: "intent-open",
      orderId: orderId ?? undefined,
      amountRaw,
      destinationTxHash,
    });
  }, [deliveryConfirmed, deliveredAmount, onExecutionEvent, orderId, orderStatus]);

  async function handleQuote() {
    if (!recipientAddr || !outputToken) return;
    try {
      setStage("quoting");
      setError(null);

      const userEip = encodeEip7930EvmAddress(sourceChainId, recipientAddr);
      const fromAssetEip = encodeEip7930EvmAddress(
        sourceChainId,
        sourceToken.address as Address,
      );
      const toAssetEip = encodeEip7930EvmAddress(
        vault.chainId,
        outputToken.address as Address,
      );
      const receiverEip = encodeEip7930EvmAddress(vault.chainId, recipientAddr);

      const res = await requestIntentQuote({
        user: userEip,
        intent: {
          intentType: "oif-swap",
          inputs: [
            { user: userEip, asset: fromAssetEip, amount: sourceAmountRaw },
          ],
          outputs: [{ receiver: receiverEip, asset: toAssetEip, amount: null }],
          swapType: "exact-input",
        },
        supportedTypes: ["oif-escrow-v0"],
      });

      const q = res.quotes?.[0];
      const previewAmount = q?.preview?.outputs?.[0]?.amount;
      if (!q || !previewAmount) {
        throw new Error("No quote available for this route");
      }

      const deadlines = buildDeadlinePlan({
        quoteValidUntilIso: q.validUntil ?? null,
      });

      const built = buildStandardOrder({
        user: recipientAddr,
        nonce: nextOrderNonce(),
        originChainId: sourceChainId,
        inputToken: sourceToken.address as Address,
        inputAmount: BigInt(sourceAmountRaw),
        targetChainId: vault.chainId,
        outputToken: outputToken.address as Address,
        outputAmount: BigInt(previewAmount),
        recipient: recipientAddr,
        expires: deadlines.expires,
        fillDeadline: deadlines.fillDeadline,
        context: (q.context as Hex | undefined) ?? "0x",
      });

      setQuote(q);
      setOrder(built);
      setStage("quoted");
    } catch (err) {
      setError(formatTxError(err));
      setStage("failed");
    }
  }

  async function handleOpen() {
    if (!order || !recipientAddr || !outputToken) return;
    try {
      if (walletChain?.id !== sourceChainId) {
        await switchChainAsync({ chainId: sourceChainId });
      }
      const walletClient = await getWagmiWalletClient(config, {
        chainId: sourceChainId,
      });
      if (!walletClient) throw new Error("No wallet client for source chain");

      // Snapshot the destination underlying balance BEFORE we open the order.
      // CRITICAL: a failed pre-read must HARD-FAIL — otherwise the post-fill
      // delta calculation can't distinguish solver-delivered tokens from the
      // user's pre-existing balance, and we'd deposit unrelated funds.
      let preSnapshot: bigint;
      try {
        preSnapshot = (await wagmiReadContract(config, {
          address: outputToken.address as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [recipientAddr],
          chainId: vault.chainId,
        })) as bigint;
      } catch {
        throw new Error(
          "Couldn't read destination balance before opening the order — refusing to proceed (would risk depositing unrelated funds). Try again in a moment.",
        );
      }
      setPredeliveryBalance(preSnapshot);

      const tokenAddr = sourceToken.address as Address;
      const amount = BigInt(sourceAmountRaw);

      setStage("approving");
      await safeApproveErc20({
        wagmiConfig: config,
        walletClient,
        token: tokenAddr,
        spender: INPUT_SETTLER_ESCROW,
        amount,
        owner: recipientAddr,
        chainId: sourceChainId,
      });

      setStage("signing");
      const openData = encodeFunctionData({
        abi: inputSettlerEscrowAbi,
        functionName: "open",
        args: [orderForAbi(order)],
      });
      const hash = await walletClient.sendTransaction({
        to: INPUT_SETTLER_ESCROW,
        data: openData,
      });
      onExecutionEvent?.({
        type: "tx-broadcast",
        phase: "intent-open",
        txHash: hash,
      });
      const receipt = await wagmiWaitForReceipt(config, {
        hash,
        chainId: sourceChainId,
        timeout: 120_000,
      });
      if (receipt.status === "reverted") {
        throw new Error("open() reverted on-chain");
      }

      setOpenTxHash(hash);
      const decodedOrderId = extractOpenOrderId(receipt.logs);
      if (!decodedOrderId) {
        // Without an orderId we can't poll status; fail loudly instead of
        // dead-ending at "Opened".
        throw new Error(
          "open() succeeded but Open(orderId) event could not be decoded — escrow ABI may have changed",
        );
      }
      setOrderId(decodedOrderId);
      setStage("open");
      onExecutionEvent?.({
        type: "intent-opened",
        phase: "intent-open",
        txHash: hash,
        orderId: decodedOrderId,
      });
    } catch (err) {
      const message = formatTxError(err);
      setError(message);
      setStage("failed");
      onExecutionEvent?.({
        type: "failed",
        phase: "intent-open",
        message,
      });
    }
  }

  async function handleRefund() {
    if (!order) return;
    try {
      setStage("refunding");
      if (walletChain?.id !== sourceChainId) {
        await switchChainAsync({ chainId: sourceChainId });
      }
      const walletClient = await getWagmiWalletClient(config, {
        chainId: sourceChainId,
      });
      if (!walletClient) throw new Error("No wallet client for source chain");
      const data = encodeFunctionData({
        abi: inputSettlerEscrowAbi,
        functionName: "refund",
        args: [orderForAbi(order)],
      });
      const hash = await walletClient.sendTransaction({
        to: INPUT_SETTLER_ESCROW,
        data,
      });
      const receipt = await wagmiWaitForReceipt(config, {
        hash,
        chainId: sourceChainId,
        timeout: 120_000,
      });
      // wagmiWaitForReceipt resolves on reverted txs — without this check the
      // UI would advance to "refunded" even though the funds are still
      // escrowed on-chain.
      if (receipt.status === "reverted") {
        throw new Error(`refund() reverted: ${hash}`);
      }
      setStage("refunded");
      // ONLY emit the intent-status — the reducer maps "Refunded" to the
      // terminal-good "refunded" leg status. Emitting a separate `failed`
      // event right after would overwrite that with `failed` (the reducer
      // runs in event order), which defeats the whole point of having a
      // refunded terminal state.
      onExecutionEvent?.({
        type: "intent-status",
        phase: "intent-open",
        orderId: orderId ?? undefined,
        status: "Refunded",
      });
    } catch (err) {
      setError(formatTxError(err));
      setStage("failed");
    }
  }

  // Once delivery is confirmed, read the destination balance delta — the
  // actual amount the solver delivered is what we want to deposit, not the
  // quote preview (solver fill quality varies). Falls back to the quote
  // preview if we never got a pre-snapshot.
  useEffect(() => {
    if (!deliveryConfirmed || !recipientAddr || !outputToken) return;
    if (deliveredAmount !== null) return;
    if (stage !== "open") return;
    let cancelled = false;
    void (async () => {
      // If we couldn't take a pre-snapshot, we have no safe way to compute
      // the delivered amount — refuse rather than fall back to the quote
      // preview (which would risk depositing pre-existing funds).
      if (predeliveryBalance === null) {
        if (cancelled) return;
        setDepositError(
          "Pre-delivery balance unknown — refusing to auto-compute delivered amount. Open vault drawer manually to deposit.",
        );
        return;
      }
      try {
        const post = (await wagmiReadContract(config, {
          address: outputToken.address as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [recipientAddr],
          chainId: vault.chainId,
        })) as bigint;
        if (cancelled) return;
        const delta = post > predeliveryBalance ? post - predeliveryBalance : 0n;
        if (delta > 0n) {
          setDeliveredAmount(delta);
        } else {
          // RPC lag: post equals pre. Don't fall back to quote preview —
          // wait for the user to manually retry deposit (which re-reads).
          setDepositError(
            "Solver fill not yet visible on-chain (RPC may be lagging). Retry the deposit step in a moment.",
          );
        }
      } catch {
        if (cancelled) return;
        setDepositError(
          "Couldn't read destination balance after delivery — retry the deposit step.",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    deliveryConfirmed,
    recipientAddr,
    outputToken,
    deliveredAmount,
    stage,
    predeliveryBalance,
    quote,
    vault.chainId,
    config,
  ]);

  async function handleDeposit() {
    if (!recipientAddr || !outputToken) return;

    // If the auto-computed deliveredAmount is missing (RPC lag at delivery
    // time), re-attempt the balance read here. Don't fall back to the quote
    // preview — that would risk depositing pre-existing funds.
    let amountToDeposit = deliveredAmount;
    if ((amountToDeposit === null || amountToDeposit === 0n) && predeliveryBalance !== null) {
      try {
        const post = (await wagmiReadContract(config, {
          address: outputToken.address as Address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [recipientAddr],
          chainId: vault.chainId,
        })) as bigint;
        const delta = post > predeliveryBalance ? post - predeliveryBalance : 0n;
        if (delta > 0n) {
          amountToDeposit = delta;
          setDeliveredAmount(delta);
          setDepositError(null);
        }
      } catch {
        // fall through to the error path below
      }
    }

    if (amountToDeposit === null || amountToDeposit === 0n) {
      const message =
        "Delivered amount still not visible on-chain. Wait a moment and try again.";
      setDepositError(message);
      setStage("deposit-failed");
      onExecutionEvent?.({
        type: "failed",
        phase: "intent-deposit",
        message,
        recoverable: true,
        orderId: orderId ?? undefined,
      });
      return;
    }
    try {
      setDepositError(null);
      setStage("deposit-quoting");

      const fromAmount = amountToDeposit.toString();
      const composer = await fetchComposerQuote({
        fromChain: vault.chainId,
        toChain: vault.chainId,
        fromToken: outputToken.address,
        toToken: vault.address,
        fromAddress: recipientAddr,
        toAddress: recipientAddr,
        fromAmount,
        underlyingSymbols: outputToken.symbol ? [outputToken.symbol] : undefined,
      });

      // Switch to the vault chain for the second tx — the user has been on
      // the source chain since open().
      if (walletChain?.id !== vault.chainId) {
        await switchChainAsync({ chainId: vault.chainId });
      }
      const walletClient = await getWagmiWalletClient(config, {
        chainId: vault.chainId,
      });
      if (!walletClient) throw new Error("No wallet client for vault chain");

      const spender = composer.estimate.approvalAddress as Address;
      const needed = BigInt(fromAmount);
      setStage("deposit-approving");
      await safeApproveErc20({
        wagmiConfig: config,
        walletClient,
        token: outputToken.address as Address,
        spender,
        amount: needed,
        owner: recipientAddr,
        chainId: vault.chainId,
      });

      setStage("deposit-signing");
      const depositHash = await walletClient.sendTransaction({
        to: composer.transactionRequest.to as Address,
        data: composer.transactionRequest.data as Hex,
        value: composer.transactionRequest.value
          ? BigInt(composer.transactionRequest.value)
          : undefined,
        gas: composer.transactionRequest.gasLimit
          ? BigInt(composer.transactionRequest.gasLimit)
          : undefined,
      });
      onExecutionEvent?.({
        type: "tx-broadcast",
        phase: "intent-deposit",
        txHash: depositHash,
      });
      const receipt = await wagmiWaitForReceipt(config, {
        hash: depositHash,
        chainId: vault.chainId,
        timeout: 120_000,
      });
      if (receipt.status === "reverted") {
        throw new Error("Deposit transaction reverted on-chain");
      }
      setDepositTxHash(depositHash);
      setStage("deposit-done");
      onExecutionEvent?.({
        type: "confirmed",
        phase: "intent-deposit",
        txHash: depositHash,
      });
    } catch (err) {
      const message = formatTxError(err);
      setDepositError(message);
      setStage("deposit-failed");
      onExecutionEvent?.({
        type: "failed",
        phase: "intent-deposit",
        message,
        recoverable: true,
        orderId: orderId ?? undefined,
      });
    }
  }

  if (!outputToken) {
    return (
      <div className="rounded-md border border-border/40 bg-muted/10 p-2.5 text-xs text-muted-foreground">
        Intent bridge unavailable — vault has no underlying ERC-20.
      </div>
    );
  }

  if (isNativeToken(sourceToken.address)) {
    // OIF Escrow uses ERC-20 transferFrom; native sources revert on approve().
    return (
      <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5 text-xs text-yellow-500">
        LI.FI Intent bridging requires an ERC-20 source. Pick a wrapped or
        stablecoin balance (e.g. WETH / USDC) — native tokens aren't supported
        yet on the escrow path.
      </div>
    );
  }

  const previewOut = quote?.preview?.outputs?.[0]?.amount;
  const previewOutDecimal = previewOut
    ? formatRaw(previewOut, outputToken.decimals)
    : null;

  return (
    <div className="space-y-2.5 rounded-md border border-primary/30 bg-primary/5 p-3">
      <header className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Sparkle size={14} weight="fill" className="text-primary" />
          LI.FI Intent bridge
        </span>
        <span className="text-muted-foreground">
          Solver settles to {outputToken.symbol} on {chainName(vault.chainId)}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ChainIcon chainId={sourceChainId} size={14} rounded={999} />
        <span className="font-mono tabular-nums">
          {formatRaw(sourceAmountRaw, sourceToken.decimals)} {sourceToken.symbol ?? "?"}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          on {chainName(sourceChainId)}
        </span>
        <ArrowRight size={12} className="text-muted-foreground" />
        <ChainIcon chainId={vault.chainId} size={14} rounded={999} />
        <span className="font-medium">
          {previewOutDecimal ?? "—"} {outputToken.symbol}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          on {chainName(vault.chainId)}
        </span>
      </div>

      {error && (
        <p className="flex items-start gap-1 rounded border border-destructive/40 bg-destructive/5 p-1.5 text-xs text-destructive">
          <XCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
          <span className="break-words">{error}</span>
        </p>
      )}

      {isPostOpenStage(stage) && order && (
        <>
          <IntentStatusTimeline
            onChainOrderId={orderId ?? undefined}
            fillDeadline={order.fillDeadline}
            expires={order.expires}
            openTxHash={openTxHash ?? undefined}
            originExplorerUrl={explorerByChain.get(sourceChainId)}
            destinationExplorerUrl={explorerByChain.get(vault.chainId)}
            onRefund={handleRefund}
            refundPending={false}
          />

          {!deliveryConfirmed && stage === "open" && (
            <p className="rounded-md border border-border/40 bg-background/30 p-2 text-[11px] text-muted-foreground">
              Funds are escrowed on origin until the solver fills on
              destination — usually under a minute.
            </p>
          )}

          {deliveryConfirmed && (
            <div className="space-y-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs text-emerald-400">
              <p className="font-medium">
                Funds delivered on {chainName(vault.chainId)}.
              </p>
              {stage !== "deposit-done" && (
                <p className="text-emerald-400/80">
                  Complete the deposit on {chainName(vault.chainId)} —
                  underlying → vault shares is a separate signature.
                </p>
              )}

              {depositError && (
                <p className="flex items-start gap-1 rounded border border-destructive/40 bg-destructive/5 p-1.5 text-destructive">
                  <XCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
                  <span className="break-words">{depositError}</span>
                </p>
              )}

              {stage === "deposit-done" ? (
                <div className="space-y-1.5">
                  <p className="text-emerald-400/80">
                    Deposit confirmed.
                    {depositTxHash && explorerByChain.get(vault.chainId) && (
                      <>
                        {" "}
                        <a
                          href={`${explorerByChain.get(vault.chainId)}/tx/${depositTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          View tx
                        </a>
                      </>
                    )}
                  </p>
                  {onDismiss && (
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={onDismiss}
                      >
                        Close
                      </Button>
                    </div>
                  )}
                </div>
              ) : stage === "deposit-quoting" ? (
                <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
                  <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
                  Fetching deposit route…
                </Button>
              ) : stage === "deposit-approving" ? (
                <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
                  <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
                  Approving {outputToken.symbol ?? "token"}…
                </Button>
              ) : stage === "deposit-signing" ? (
                <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
                  <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
                  Depositing into vault…
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50"
                  onClick={handleDeposit}
                  disabled={!isConnected || predeliveryBalance === null}
                >
                  {deliveredAmount === null
                    ? "Re-check & deposit"
                    : stage === "deposit-failed"
                      ? "Retry deposit"
                      : "Complete deposit"}
                  {deliveredAmount !== null && outputToken && (
                    <span className="ml-1 font-mono text-[10px] opacity-80">
                      ({formatRaw(deliveredAmount.toString(), outputToken.decimals)}{" "}
                      {outputToken.symbol})
                    </span>
                  )}
                </Button>
              )}

              {stage !== "deposit-done" && onDismiss && (
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={onDismiss}
                  >
                    Close without depositing
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {(stage === "idle" || stage === "quoting") && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full gap-1 text-xs"
          onClick={handleQuote}
          disabled={!isConnected || stage === "quoting"}
        >
          {stage === "quoting" ? (
            <>
              <CircleNotch className="h-3 w-3 animate-spin" /> Quoting…
            </>
          ) : (
            <>
              <ArrowsClockwise size={12} weight="bold" />
              Get intent quote
            </>
          )}
        </Button>
      )}

      {stage === "failed" && (
        <div className="space-y-1.5">
          {onFallbackToComposer && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50"
              onClick={onFallbackToComposer}
            >
              Try Composer route instead
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full gap-1 text-xs"
            onClick={handleQuote}
            disabled={!isConnected}
          >
            <ArrowsClockwise size={12} weight="bold" />
            Retry intent quote
          </Button>
        </div>
      )}

      {stage === "quoted" && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50"
          onClick={handleOpen}
        >
          Open order on {chainName(sourceChainId)}
        </Button>
      )}

      {(stage === "approving" || stage === "signing") && (
        <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
          <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
          {stage === "approving" ? "Approving escrow…" : "Opening…"}
        </Button>
      )}

      {stage === "refunding" && (
        <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
          <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
          Refunding…
        </Button>
      )}

      {stage === "refunded" && (
        <p className="rounded border border-yellow-500/30 bg-yellow-500/5 p-1.5 text-center text-xs text-yellow-500">
          Escrow refunded.
        </p>
      )}
    </div>
  );
}

// Any stage where the source-chain order has been opened and we're either
// awaiting delivery or running the post-delivery deposit. Used both to
// render the timeline + delivery panel and to keep status polling active.
function isPostOpenStage(stage: Stage): boolean {
  return (
    stage === "open" ||
    stage === "deposit-quoting" ||
    stage === "deposit-approving" ||
    stage === "deposit-signing" ||
    stage === "deposit-done" ||
    stage === "deposit-failed"
  );
}

function chainName(id: number): string {
  return SUPPORTED_CHAINS.find((c) => c.id === id)?.name ?? `chain ${id}`;
}

function formatRaw(raw: string, decimals: number): string {
  try {
    const big = BigInt(raw);
    const whole = big / 10n ** BigInt(decimals);
    const frac = big % 10n ** BigInt(decimals);
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 6).replace(/0+$/, "");
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    return raw;
  }
}
