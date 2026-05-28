import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import {
  getWalletClient as getWagmiWalletClient,
  waitForTransactionReceipt as wagmiWaitForReceipt,
} from "@wagmi/core";
import {
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import {
  ArrowRight,
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  Sparkle,
  XCircle,
} from "@phosphor-icons/react";

import { Button } from "../../ui/button";
import ChainIcon from "../../icons/ChainIcon";
import { TokenIcon } from "./TokenIcon";
import { IntentStatusTimeline } from "./IntentStatusTimeline";
import {
  isDeliveredOrSettled,
  readDestinationTxHash,
  requestIntentQuote,
  type IntentQuote,
} from "./intentsApi";
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
import { CHAIN_REGISTRY, SUPPORTED_CHAINS } from "../../../utils/chains";
import type { EarnToken } from "./types";
import { formatTxError, isNativeToken, safeApproveErc20 } from "./txUtils";

export type WithdrawIntentRouteStage =
  | "idle"
  | "quoting"
  | "quoted"
  | "approving"
  | "signing"
  | "open"
  | "delivered"
  | "failed"
  | "refunding"
  | "refunded";

interface WithdrawIntentRouteStepProps {
  sourceChainId: number;
  sourceToken: EarnToken;
  sourceAmountRaw: string;
  destinationChainId: number;
  destinationToken: EarnToken;
  recipient?: Address;
  onStageChange?: (stage: WithdrawIntentRouteStage) => void;
  onDelivered?: (details: {
    openTxHash?: Hex;
    destinationTxHash?: Hex;
    orderId?: Hex;
  }) => void;
  onFallbackToComposer?: () => void;
  onKeepUnderlying?: () => void;
  onRefunded?: () => void;
}

export function WithdrawIntentRouteStep({
  sourceChainId,
  sourceToken,
  sourceAmountRaw,
  destinationChainId,
  destinationToken,
  recipient,
  onStageChange,
  onDelivered,
  onFallbackToComposer,
  onKeepUnderlying,
  onRefunded,
}: WithdrawIntentRouteStepProps) {
  const { address, isConnected, chain: walletChain } = useAccount();
  const config = useConfig();
  const { switchChainAsync } = useSwitchChain();

  const [stage, setStage] = useState<WithdrawIntentRouteStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<IntentQuote | null>(null);
  const [order, setOrder] = useState<StandardOrder | null>(null);
  const [openTxHash, setOpenTxHash] = useState<Hex | null>(null);
  const [orderId, setOrderId] = useState<Hex | null>(null);
  const deliveredNotifiedRef = useRef(false);

  const recipientAddr = (recipient ?? address) as Address | undefined;

  useEffect(() => {
    setStage("idle");
    setError(null);
    setQuote(null);
    setOrder(null);
    setOpenTxHash(null);
    setOrderId(null);
    deliveredNotifiedRef.current = false;
  }, [
    sourceChainId,
    sourceToken.address,
    sourceAmountRaw,
    destinationChainId,
    destinationToken.address,
    recipient,
  ]);

  useEffect(() => {
    onStageChange?.(stage);
  }, [stage, onStageChange]);

  const explorerByChain = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of SUPPORTED_CHAINS) {
      if (c.explorerUrl) map.set(c.id, c.explorerUrl);
    }
    return map;
  }, []);

  const { status: orderStatus, state: orderState } = useIntentOrderStatus({
    onChainOrderId: orderId ?? undefined,
    enabled: isPostOpenStage(stage) || stage === "refunding",
  });
  const deliveryConfirmed = isDeliveredOrSettled(orderState);

  useEffect(() => {
    if (!deliveryConfirmed || deliveredNotifiedRef.current) return;
    deliveredNotifiedRef.current = true;
    setStage("delivered");
    onDelivered?.({
      openTxHash: openTxHash ?? undefined,
      destinationTxHash: readDestinationTxHash(orderStatus),
      orderId: orderId ?? undefined,
    });
  }, [deliveryConfirmed, onDelivered, openTxHash, orderId, orderStatus]);

  async function handleQuote() {
    if (!recipientAddr) return;
    try {
      setStage("quoting");
      setError(null);

      if (BigInt(sourceAmountRaw) <= 0n) {
        throw new Error("No redeemed amount available to route");
      }

      const userEip = encodeEip7930EvmAddress(sourceChainId, recipientAddr);
      const fromAssetEip = encodeEip7930EvmAddress(
        sourceChainId,
        sourceToken.address as Address,
      );
      const toAssetEip = encodeEip7930EvmAddress(
        destinationChainId,
        destinationToken.address as Address,
      );
      const receiverEip = encodeEip7930EvmAddress(
        destinationChainId,
        recipientAddr,
      );

      const res = await requestIntentQuote({
        user: userEip,
        intent: {
          intentType: "oif-swap",
          inputs: [
            { user: userEip, asset: fromAssetEip, amount: sourceAmountRaw },
          ],
          outputs: [
            { receiver: receiverEip, asset: toAssetEip, amount: null },
          ],
          swapType: "exact-input",
        },
        supportedTypes: ["oif-escrow-v0"],
      });

      const q = res.quotes?.[0];
      const previewAmount = q?.preview?.outputs?.[0]?.amount;
      if (!q || !previewAmount) {
        throw new Error("No intent quote available for this receive route");
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
        targetChainId: destinationChainId,
        outputToken: destinationToken.address as Address,
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
    if (!order || !recipientAddr) return;
    try {
      setError(null);
      if (walletChain?.id !== sourceChainId) {
        await switchChainAsync({ chainId: sourceChainId });
      }
      const walletClient = await getWagmiWalletClient(config, {
        chainId: sourceChainId,
      });
      if (!walletClient) throw new Error("No wallet client for source chain");

      setStage("approving");
      await safeApproveErc20({
        wagmiConfig: config,
        walletClient,
        token: sourceToken.address as Address,
        spender: INPUT_SETTLER_ESCROW,
        amount: BigInt(sourceAmountRaw),
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
        throw new Error(
          "open() succeeded but Open(orderId) event could not be decoded",
        );
      }
      setOrderId(decodedOrderId);
      setStage("open");
    } catch (err) {
      setError(formatTxError(err));
      setStage("failed");
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
      await wagmiWaitForReceipt(config, {
        hash,
        chainId: sourceChainId,
        timeout: 120_000,
      });
      setStage("refunded");
      onRefunded?.();
    } catch (err) {
      setError(formatTxError(err));
      setStage("failed");
    }
  }

  const previewOut = quote?.preview?.outputs?.[0]?.amount;
  const previewOutDecimal = previewOut
    ? formatRaw(previewOut, destinationToken.decimals)
    : null;

  if (isNativeToken(sourceToken.address)) {
    return (
      <div className="space-y-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2.5 text-xs text-yellow-500">
        <p>
          LI.FI Intent routing requires an ERC-20 source after redeem. Keep the
          underlying or try the Composer route.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {onFallbackToComposer && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={onFallbackToComposer}
            >
              Try Composer route
            </Button>
          )}
          {onKeepUnderlying && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={onKeepUnderlying}
            >
              Keep underlying
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3">
      <header className="flex items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Sparkle size={14} weight="fill" className="text-emerald-400" />
          LI.FI Intent route
        </span>
        <span className="text-right text-muted-foreground">
          Delivery is final
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <ChainIcon chainId={sourceChainId} size={14} rounded={999} />
        <TokenIcon
          token={{
            address: sourceToken.address,
            symbol: sourceToken.symbol,
            logoURI: sourceToken.logoURI,
          }}
          chainId={sourceChainId}
          className="h-4 w-4 rounded-full"
        />
        <span className="font-mono tabular-nums">
          {formatRaw(sourceAmountRaw, sourceToken.decimals)}{" "}
          {sourceToken.symbol ?? "token"}
        </span>
        <ArrowRight size={12} className="text-muted-foreground" />
        <ChainIcon chainId={destinationChainId} size={14} rounded={999} />
        <TokenIcon
          token={{
            address: destinationToken.address,
            symbol: destinationToken.symbol,
            logoURI: destinationToken.logoURI,
          }}
          chainId={destinationChainId}
          className="h-4 w-4 rounded-full"
        />
        <span className="font-medium">
          {previewOutDecimal ?? "—"} {destinationToken.symbol}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          on {chainName(destinationChainId)}
        </span>
      </div>

      {error && (
        <p className="flex items-start gap-1 rounded border border-destructive/40 bg-destructive/5 p-1.5 text-xs text-destructive">
          <XCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
          <span className="break-words">{error}</span>
        </p>
      )}

      {(isPostOpenStage(stage) || stage === "refunding") && order && (
        <IntentStatusTimeline
          onChainOrderId={orderId ?? undefined}
          fillDeadline={order.fillDeadline}
          expires={order.expires}
          openTxHash={openTxHash ?? undefined}
          originExplorerUrl={explorerByChain.get(sourceChainId)}
          destinationExplorerUrl={explorerByChain.get(destinationChainId)}
          onRefund={handleRefund}
          refundPending={stage === "refunding"}
        />
      )}

      {stage === "delivered" && (
        <div className="flex items-start gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-2 text-xs text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5 shrink-0" />
          Funds delivered as {destinationToken.symbol} on{" "}
          {chainName(destinationChainId)}.
        </div>
      )}

      {(orderState === "Failed" || orderState === "Expired") && stage !== "refunded" && (
        <p className="rounded border border-yellow-500/30 bg-yellow-500/5 p-1.5 text-xs text-yellow-500">
          Intent {orderState.toLowerCase()}. Use the refund control once the
          expiry window opens, then keep the underlying or try another route.
        </p>
      )}

      {stage === "refunded" && (
        <div className="space-y-2 rounded border border-yellow-500/30 bg-yellow-500/5 p-2 text-xs text-yellow-500">
          <p>Escrow refunded to the source chain.</p>
          {onKeepUnderlying && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px]"
              onClick={onKeepUnderlying}
            >
              Keep underlying
            </Button>
          )}
        </div>
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

      {stage === "quoted" && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20"
          onClick={handleOpen}
        >
          Open order on {chainName(sourceChainId)}
        </Button>
      )}

      {(stage === "approving" || stage === "signing") && (
        <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
          <CircleNotch className="mr-1.5 h-3 w-3 animate-spin" />
          {stage === "approving" ? "Approving escrow…" : "Opening…"}
        </Button>
      )}

      {stage === "failed" && (
        <div className="grid gap-1.5">
          {onFallbackToComposer && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20"
              onClick={onFallbackToComposer}
            >
              Try Composer route
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
            Retry route
          </Button>
          {onKeepUnderlying && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-full text-xs"
              onClick={onKeepUnderlying}
            >
              Keep underlying
            </Button>
          )}
        </div>
      )}

      {stage === "refunding" && (
        <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
          <CircleNotch className="mr-1.5 h-3 w-3 animate-spin" />
          Refunding…
        </Button>
      )}
    </div>
  );
}

function isPostOpenStage(stage: WithdrawIntentRouteStage): boolean {
  return stage === "open" || stage === "delivered" || stage === "refunded";
}

function chainName(id: number): string {
  return (
    SUPPORTED_CHAINS.find((c) => c.id === id)?.name ??
    CHAIN_REGISTRY.find((c) => c.id === id)?.name ??
    `chain ${id}`
  );
}

function formatRaw(raw: string, decimals: number): string {
  try {
    const big = BigInt(raw);
    const whole = big / 10n ** BigInt(decimals);
    const frac = big % 10n ** BigInt(decimals);
    const fracStr = frac
      .toString()
      .padStart(decimals, "0")
      .slice(0, 6)
      .replace(/0+$/, "");
    return fracStr ? `${whole.toString()}.${fracStr}` : whole.toString();
  } catch {
    return raw;
  }
}
