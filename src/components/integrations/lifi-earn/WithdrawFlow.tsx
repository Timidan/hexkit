import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import {
  getWalletClient as getWagmiWalletClient,
  waitForTransactionReceipt as wagmiWaitForReceipt,
} from "@wagmi/core";
import { ethers } from "ethers";
import { useEarnAdapter } from "../../../features/earn/context/EarnAdapterContext";
import {
  parseEvmChainId,
  parseAddress,
  parseCalldata,
} from "../../../chains/types/evm";
import type { EvmChainDescriptor } from "../../../chains/types";
import type { PreparedTx, PreparedTxEnvelope } from "../../../features/earn/adapter/types";
import {
  CircleNotch,
  CheckCircle,
  XCircle,
  Warning,
  ArrowDown,
  X,
} from "@phosphor-icons/react";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import { SUPPORTED_CHAINS } from "../../../utils/chains";
import { simulateAssetMovements } from "../../../utils/transaction-simulation/simulateAssetMovements";
import type { AssetMovementResult } from "../../../utils/transaction-simulation/simulateAssetMovements";
import { getCachedTokenMetadata, fetchTokenMetadata } from "../../../utils/tokenMovements";
import { networkConfigManager } from "../../../config/networkConfig";
import { TokenIcon } from "./TokenIcon";
import { useWithdrawQuote } from "./hooks/useWithdrawQuote";
import { useTokenAllowance } from "./hooks/useTokenAllowance";
import { formatTxError, shortAddress } from "./txUtils";
import type { EarnPosition, EarnVault, EarnToken } from "./types";

type WithdrawState = "idle" | "approving" | "simulating" | "executing" | "success" | "error";

interface WithdrawFlowProps {
  position: EarnPosition;
  vault: EarnVault;
  onComplete?: () => void;
  onClose?: () => void;
}

export function WithdrawFlow({ position, vault, onComplete, onClose }: WithdrawFlowProps) {
  const { address, chain: walletChain } = useAccount();
  const wagmiConfig = useConfig();
  const { switchChainAsync } = useSwitchChain();
  const earnCtx = useEarnAdapter();
  const evmAdapter =
    earnCtx.adapter && earnCtx.adapter.family === "evm"
      ? (earnCtx.adapter as typeof earnCtx.adapter & { family: "evm" })
      : null;

  const [amount, setAmount] = useState("");
  const [flowState, setFlowState] = useState<WithdrawState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [simulateFirst, setSimulateFirst] = useState(false);
  const [simResult, setSimResult] = useState<AssetMovementResult | null>(null);

  const supportedChain = SUPPORTED_CHAINS.find((c) => c.id === position.chainId);

  const positionTotal = useMemo(() => {
    try {
      const n = parseFloat(position.balanceNative);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, [position.balanceNative]);

  const fromAmountForQuote = useMemo(() => {
    if (!amount) return null;
    try {
      const parsed = ethers.utils.parseUnits(amount, position.asset.decimals);
      if (parsed.isZero()) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }, [amount, position.asset.decimals]);

  const insufficientBalance = useMemo(() => {
    if (!amount || !positionTotal) return false;
    const n = parseFloat(amount);
    return Number.isFinite(n) && n > positionTotal;
  }, [amount, positionTotal]);

  const {
    data: quote,
    isLoading: quoteLoading,
    isError: quoteError,
    error: quoteErrorObj,
  } = useWithdrawQuote({
    chainId: position.chainId,
    vaultAddress: vault.address,
    underlyingAddress: position.asset.address,
    walletAddress: address ?? "",
    fromAmount: fromAmountForQuote ?? "0",
    enabled: !!address && !!fromAmountForQuote,
  });

  const {
    data: allowanceStr,
    refetch: refetchAllowance,
  } = useTokenAllowance({
    tokenAddress: vault.address,
    ownerAddress: address ?? null,
    spenderAddress: quote?.estimate?.approvalAddress ?? null,
    chainId: position.chainId,
  });

  const allowance = useMemo(() => {
    if (!allowanceStr) return ethers.BigNumber.from(0);
    try {
      return ethers.BigNumber.from(allowanceStr);
    } catch {
      return ethers.BigNumber.from(0);
    }
  }, [allowanceStr]);

  const needsApproval = useMemo(() => {
    if (!fromAmountForQuote || !quote) return false;
    try {
      return allowance.lt(ethers.BigNumber.from(fromAmountForQuote));
    } catch {
      return false;
    }
  }, [allowance, fromAmountForQuote, quote]);

  const balanceDisplay = useMemo(() => {
    if (!positionTotal) return null;
    if (positionTotal < 0.0001) return "<0.0001";
    return positionTotal.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  }, [positionTotal]);

  const resolveMovementToken = useMemo(() => {
    const known = new Map<string, EarnToken>();
    const add = (token: EarnToken) => {
      known.set(token.address.toLowerCase(), {
        ...token,
        chainId: token.chainId ?? position.chainId,
      });
    };

    add({
      address: vault.address,
      symbol: vault.name ?? `${vault.protocol.name} shares`,
      decimals: position.asset.decimals,
      chainId: position.chainId,
    });

    for (const t of vault.underlyingTokens ?? []) add(t);

    add({
      address: position.asset.address,
      symbol: position.asset.symbol,
      decimals: position.asset.decimals,
      chainId: position.chainId,
    });

    if (quote?.action?.fromToken) add(quote.action.fromToken);
    if (quote?.action?.toToken) add(quote.action.toToken);

    if (quote?.includedSteps) {
      for (const step of quote.includedSteps) {
        if (step?.action?.fromToken) add(step.action.fromToken);
        if (step?.action?.toToken) add(step.action.toToken);
      }
    }

    return (addr: string, movementChainId: number): EarnToken => {
      const key = addr.toLowerCase();
      const hit = known.get(key);
      if (hit) return hit;

      const cached = getCachedTokenMetadata(addr);
      if (cached && cached.symbol && !cached.symbol.startsWith("0x")) {
        return {
          address: addr,
          symbol: cached.symbol,
          name: cached.name,
          decimals: cached.decimals,
          chainId: movementChainId,
        };
      }

      return {
        address: addr,
        symbol: shortAddress(addr),
        decimals: 18,
        chainId: movementChainId,
      };
    };
  }, [vault, position, quote]);

  const netWalletChanges = useMemo(() => {
    if (!simResult?.movements || !address) return [];
    const walletLower = address.toLowerCase();
    const perToken = new Map<string, { delta: bigint; tokenAddress: string; tokenSymbol?: string; decimals?: number }>();
    for (const mv of simResult.movements) {
      const fromLower = mv.from.toLowerCase();
      const toLower = mv.to.toLowerCase();
      if (fromLower !== walletLower && toLower !== walletLower) continue;

      const key = mv.tokenAddress.toLowerCase();
      let amt: bigint;
      try {
        amt = BigInt(mv.amount || "0");
      } catch {
        continue;
      }
      const existing = perToken.get(key) ?? { delta: 0n, tokenAddress: mv.tokenAddress, tokenSymbol: mv.tokenSymbol, decimals: mv.decimals };
      if (fromLower === walletLower) existing.delta -= amt;
      if (toLower === walletLower) existing.delta += amt;
      if (mv.tokenSymbol && !mv.tokenSymbol.startsWith("0x")) {
        existing.tokenSymbol = mv.tokenSymbol;
      }
      if (mv.decimals !== undefined) existing.decimals = mv.decimals;
      perToken.set(key, existing);
    }

    // Aave V3 burns aTokens internally — the Transfer event rarely appears
    // in the trace. Synthesize the outflow from the quote's fromAmount.
    const shareKey = vault.address.toLowerCase();
    if (simResult.success && fromAmountForQuote && !perToken.has(shareKey)) {
      try {
        const shareToken = resolveMovementToken(vault.address, position.chainId);
        perToken.set(shareKey, {
          delta: -BigInt(fromAmountForQuote),
          tokenAddress: vault.address,
          tokenSymbol: shareToken.symbol,
          decimals: position.asset.decimals,
        });
      } catch {
        /* non-fatal */
      }
    }

    return [...perToken.values()]
      .filter((e) => e.delta !== 0n)
      .sort((a, b) => (a.delta > b.delta ? -1 : 1));
  }, [simResult, address, vault, fromAmountForQuote, position, resolveMovementToken]);

  const [resolvedTokens, setResolvedTokens] = useState<Map<string, { symbol: string; decimals: number }>>(new Map());
  const fetchingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!netWalletChanges.length || !supportedChain) return;

    const unknowns: string[] = [];
    for (const change of netWalletChanges) {
      const addr = change.tokenAddress.toLowerCase();
      if (resolvedTokens.has(addr)) continue;
      if (change.tokenSymbol && !change.tokenSymbol.startsWith("0x")) continue;
      const known = resolveMovementToken(addr, position.chainId);
      if (known.symbol && !known.symbol.startsWith("0x") && !known.symbol.includes("…")) continue;
      if (fetchingRef.current.has(addr)) continue;
      unknowns.push(change.tokenAddress);
    }

    if (unknowns.length === 0) return;
    unknowns.forEach((a) => fetchingRef.current.add(a.toLowerCase()));

    const resolution = networkConfigManager.resolveRpcUrl(supportedChain.id, supportedChain.rpcUrl);
    if (!resolution.url) return;

    const provider = new ethers.providers.StaticJsonRpcProvider(resolution.url, supportedChain.id);

    (async () => {
      const results = new Map<string, { symbol: string; decimals: number }>();
      for (const addr of unknowns) {
        try {
          const meta = await Promise.race([
            fetchTokenMetadata(addr, provider),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          if (meta && meta.symbol && !meta.symbol.startsWith("0x")) {
            results.set(addr.toLowerCase(), { symbol: meta.symbol, decimals: meta.decimals });
          }
        } catch {
          // skip
        }
      }
      if (results.size > 0) {
        setResolvedTokens((prev) => {
          const merged = new Map(prev);
          results.forEach((v, k) => merged.set(k, v));
          return merged;
        });
      }
    })().finally(() => {
      unknowns.forEach((a) => fetchingRef.current.delete(a.toLowerCase()));
    });
  }, [netWalletChanges, supportedChain, resolveMovementToken, position.chainId]);

  async function handleSimulate() {
    if (!quote || !supportedChain || !address) return;

    setFlowState("simulating");
    setSimResult(null);
    setErrorMsg(null);

    const tx = {
      to: quote.transactionRequest.to,
      data: quote.transactionRequest.data,
      value: quote.transactionRequest.value,
      gasLimit: quote.transactionRequest.gasLimit,
      gasPrice: quote.transactionRequest.gasPrice,
    };

    // Auto-retry once on transient failures. Aave's
    // NotEnoughAvailableUserBalance (0x47bc4b2c) commonly fires when EDB
    // forks from a block that hasn't indexed the approval yet — a brief
    // pause lets the chain advance past the confirmation.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await simulateAssetMovements(tx, supportedChain, address);
        if (!result.success && attempt === 0) {
          // Wait ~2s for the chain to advance before retrying
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        setSimResult(result);
        setFlowState("idle");
        if (result.success) {
          setSimulateFirst(false);
        }
        return;
      } catch (err: unknown) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        setErrorMsg(formatTxError(err));
        setFlowState("error");
        return;
      }
    }
  }

  async function handleApprove() {
    if (!quote || !address) return;

    setFlowState("approving");
    setErrorMsg(null);

    try {
      if (walletChain?.id !== position.chainId) {
        await switchChainAsync({ chainId: position.chainId });
      }

      const walletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: position.chainId,
      });

      if (!walletClient) {
        throw new Error("No wallet client available. Please connect your wallet.");
      }

      const spender = quote.estimate.approvalAddress as `0x${string}`;
      const tokenAddr = vault.address as `0x${string}`;

      const iface = new ethers.utils.Interface([
        "function approve(address spender, uint256 amount) returns (bool)",
      ]);

      if (allowance.gt(0)) {
        const resetData = iface.encodeFunctionData("approve", [
          spender,
          ethers.constants.Zero,
        ]) as `0x${string}`;

        const resetHash = await walletClient.sendTransaction({
          to: tokenAddr,
          data: resetData,
          chain: { id: position.chainId } as any,
        });

        const resetReceipt = await wagmiWaitForReceipt(wagmiConfig, {
          hash: resetHash,
          chainId: position.chainId,
          timeout: 120_000,
        });

        if (resetReceipt.status === "reverted") {
          throw new Error("Allowance reset transaction reverted onchain");
        }
      }

      const data = iface.encodeFunctionData("approve", [
        spender,
        ethers.constants.MaxUint256,
      ]) as `0x${string}`;

      const hash = await walletClient.sendTransaction({
        to: tokenAddr,
        data,
        chain: { id: position.chainId } as any,
      });

      const receipt = await wagmiWaitForReceipt(wagmiConfig, {
        hash,
        chainId: position.chainId,
        timeout: 120_000,
      });

      if (receipt.status === "reverted") {
        throw new Error("Approval transaction reverted onchain");
      }

      await refetchAllowance();
      setFlowState("idle");
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setFlowState("error");
    }
  }

  async function handleExecute() {
    if (!quote || !address) return;

    setFlowState("executing");
    setErrorMsg(null);

    try {
      if (!evmAdapter) {
        throw new Error("EarnAdapter unavailable");
      }

      // Chain-switching is handled inside adapter.submitTx.
      const chainDescriptor = {
        chainFamily: "evm" as const,
        key: `evm:${position.chainId}` as const,
        chainId: parseEvmChainId(position.chainId),
        name:
          SUPPORTED_CHAINS.find((c) => c.id === position.chainId)?.name ??
          "Unknown",
      } satisfies EvmChainDescriptor;

      const envelope: PreparedTxEnvelope<EvmChainDescriptor> = {
        family: "evm",
        chainId: parseEvmChainId(position.chainId),
        to: parseAddress(quote.transactionRequest.to),
        data: parseCalldata(quote.transactionRequest.data),
        value: quote.transactionRequest.value
          ? BigInt(quote.transactionRequest.value)
          : undefined,
        gasLimit: quote.transactionRequest.gasLimit
          ? BigInt(quote.transactionRequest.gasLimit)
          : undefined,
      };

      const tx: PreparedTx<EvmChainDescriptor> = {
        id: "withdraw",
        chain: chainDescriptor,
        kind: "withdraw",
        title: "LI.FI Composer withdraw",
        request: envelope,
      };

      const submitted = await evmAdapter.submitTx(tx);
      setTxHash(submitted.txId);

      const confirmed = await evmAdapter.waitForTx(submitted, {
        timeoutMs: 120_000,
      });

      if (confirmed.status !== "confirmed") {
        throw new Error("Withdraw transaction reverted onchain");
      }

      setFlowState("success");
      onComplete?.();
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setFlowState("error");
    }
  }

  const isBusy = flowState === "approving" || flowState === "executing" || flowState === "simulating";
  const explorerUrl = supportedChain?.explorerUrl ?? "";

  if (!supportedChain) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Warning className="h-4 w-4 shrink-0 text-yellow-500" />
          Withdrawals on this chain are not supported yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border/30 pt-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold">Withdraw {position.asset.symbol}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {flowState === "success" ? (
        <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-emerald-500">
            <CheckCircle className="h-3.5 w-3.5" />
            Withdrawal confirmed
          </div>
          {txHash && explorerUrl && (
            <a
              href={`${explorerUrl}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              View on explorer
            </a>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-muted-foreground">Amount</label>
              {balanceDisplay && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>Available:</span>
                  <>
                    <span className="font-mono tabular-nums text-foreground/80">
                      {balanceDisplay} {position.asset.symbol}
                    </span>
                    <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setAmount(position.balanceNative);
                          setErrorMsg(null);
                          setFlowState("idle");
                        }}
                        className="rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                      >
                        Max
                      </button>
                    </>
                </div>
              )}
            </div>
            <div className="relative">
              <Input
                className={`h-9 text-sm pr-14 ${
                  insufficientBalance
                    ? "border-destructive/60 focus-visible:ring-destructive/30"
                    : ""
                }`}
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setErrorMsg(null);
                  setFlowState("idle");
                }}
                disabled={isBusy}
                type="number"
                min="0"
                step="any"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                {position.asset.symbol}
              </span>
            </div>
            {insufficientBalance && (
              <p className="flex items-center gap-1 text-[11px] text-destructive">
                <Warning className="h-2.5 w-2.5" />
                Exceeds your position balance
              </p>
            )}
            {positionTotal != null && positionTotal > 0 && (
              <div className="flex items-center gap-1.5 pt-1">
                {[25, 50, 75].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      const val = (positionTotal * pct) / 100;
                      const decimals = position.asset.decimals;
                      const display = decimals > 6 ? 6 : decimals;
                      setAmount(val.toFixed(display));
                      setErrorMsg(null);
                      setFlowState("idle");
                    }}
                    className="flex-1 rounded border border-border/40 bg-muted/30 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setAmount(position.balanceNative);
                    setErrorMsg(null);
                    setFlowState("idle");
                  }}
                  className="flex-1 rounded border border-border/40 bg-muted/30 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
            )}
          </div>

          {amount && fromAmountForQuote && (
            <div className="text-xs space-y-1">
              {quoteLoading && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CircleNotch className="h-3 w-3 animate-spin" />
                  Fetching quote…
                </div>
              )}
              {quoteError && (
                <div className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-3 w-3" />
                  {(quoteErrorObj as Error)?.message ?? "Failed to fetch quote"}
                </div>
              )}
              {quote && !quoteError && (() => {
                const toUsd = quote.estimate.toAmountUSD
                  ? parseFloat(quote.estimate.toAmountUSD)
                  : null;
                const toDecimals = position.asset.decimals;
                const toSymbol = position.asset.symbol;
                let amountDisplay = "";
                try {
                  const num = parseFloat(
                    ethers.utils.formatUnits(quote.estimate.toAmountMin, toDecimals),
                  );
                  amountDisplay = Number.isFinite(num) && num > 0
                    ? num.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })
                    : "—";
                } catch {
                  amountDisplay = "—";
                }

                return (
                  <div className="space-y-1 rounded-md border border-border/40 bg-background/30 p-2">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <ArrowDown className="h-3 w-3 text-emerald-500" />
                        You receive
                      </span>
                      <span className="font-medium text-foreground tabular-nums">
                        {toUsd != null
                          ? `$${toUsd.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : `${amountDisplay} ${toSymbol}`}
                      </span>
                    </div>
                    {toUsd != null && (
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>Min received</span>
                        <span className="tabular-nums font-mono">
                          {amountDisplay} {toSymbol}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {simResult && (
            <div
              className={`rounded-md border p-2 text-xs space-y-1.5 ${
                simResult.success
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {simResult.success ? (
                  <CheckCircle className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-destructive" />
                )}
                {simResult.success ? "Simulation passed" : "Simulation failed"}
                {simResult.gasUsed && (
                  <span className="ml-auto font-normal text-muted-foreground">
                    Gas: {simResult.gasUsed}
                  </span>
                )}
              </div>

              {simResult.error && (
                <p className={simResult.success ? "text-yellow-600" : "text-destructive"}>
                  {simResult.error}
                </p>
              )}

              {netWalletChanges.length > 0 && (
                <div className="space-y-1 pt-1 border-t border-border/30">
                  {netWalletChanges.map((change, i) => {
                    const isIn = change.delta > 0n;
                    const sign = isIn ? "+" : "-";
                    const color = isIn ? "text-emerald-500" : "text-red-400";
                    const token = resolveMovementToken(change.tokenAddress, position.chainId);

                    const reactiveHit = resolvedTokens.get(change.tokenAddress.toLowerCase());
                    const resolvedSym =
                      reactiveHit?.symbol
                        ?? (change.tokenSymbol && !change.tokenSymbol.startsWith("0x") ? change.tokenSymbol : null)
                        ?? (token.symbol && !token.symbol.startsWith("0x") && !token.symbol.includes("…") ? token.symbol : null);

                    if (!resolvedSym) return null;

                    const effectiveSymbol = resolvedSym;
                    const effectiveDecimals = reactiveHit?.decimals ?? change.decimals ?? token.decimals ?? position.asset.decimals;

                    let display: string;
                    let numericAmount = 0;
                    try {
                      const absStr = change.delta < 0n
                        ? (-change.delta).toString()
                        : change.delta.toString();
                      const raw = ethers.utils.formatUnits(absStr, effectiveDecimals);
                      const num = Number(raw);
                      numericAmount = num;
                      if (Number.isFinite(num)) {
                        if (num === 0) display = "0";
                        else if (num > 0 && num < 0.0001) display = "<0.0001";
                        else display = num.toLocaleString(undefined, { maximumFractionDigits: 6 });
                      } else {
                        display = raw;
                      }
                    } catch {
                      display = change.delta.toString();
                    }

                    const priceUsd = token.priceUSD ? parseFloat(token.priceUSD) : null;
                    const usdValue =
                      priceUsd && Number.isFinite(priceUsd) && Number.isFinite(numericAmount)
                        ? Math.abs(numericAmount) * priceUsd
                        : null;

                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <TokenIcon
                          token={{
                            address: token.address,
                            symbol: effectiveSymbol,
                            logoURI: token.logoURI,
                          }}
                          chainId={token.chainId ?? position.chainId}
                          className="h-4 w-4 shrink-0 rounded-full"
                        />
                        <span className={`font-mono tabular-nums ${color}`}>
                          {sign}{display}
                        </span>
                        <span className="font-medium">{effectiveSymbol}</span>
                        {usdValue != null && usdValue > 0.01 && (
                          <span className="ml-auto text-muted-foreground tabular-nums">
                            ${usdValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <XCircle className="h-3 w-3 shrink-0" />
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col items-center gap-2">
            {!simResult?.success && (
              <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground select-none">
                <Switch
                  checked={simulateFirst}
                  onCheckedChange={setSimulateFirst}
                  disabled={isBusy}
                />
                Simulate first
              </label>
            )}

            {needsApproval ? (
              <Button
                className="w-full h-8 text-xs"
                disabled={
                  isBusy ||
                  !quote ||
                  quoteLoading ||
                  quoteError ||
                  insufficientBalance ||
                  !fromAmountForQuote
                }
                onClick={handleApprove}
              >
                {flowState === "approving" ? (
                  <span className="flex items-center gap-1.5">
                    <CircleNotch className="h-3 w-3 animate-spin" />
                    Approving…
                  </span>
                ) : simulateFirst ? (
                  "Approve"
                ) : (
                  "Approve & Withdraw"
                )}
              </Button>
            ) : simulateFirst && !simResult?.success ? (
              <Button
                variant="outline"
                className="w-full h-8 text-xs"
                disabled={
                  isBusy ||
                  !quote ||
                  quoteLoading ||
                  quoteError ||
                  insufficientBalance ||
                  !fromAmountForQuote
                }
                onClick={handleSimulate}
              >
                {flowState === "simulating" ? (
                  <span className="flex items-center gap-1.5">
                    <CircleNotch className="h-3 w-3 animate-spin" />
                    Simulating…
                  </span>
                ) : (
                  "Simulate"
                )}
              </Button>
            ) : (
              <Button
                className="w-full h-8 text-xs"
                disabled={
                  isBusy ||
                  !quote ||
                  quoteLoading ||
                  quoteError ||
                  insufficientBalance ||
                  !fromAmountForQuote
                }
                onClick={handleExecute}
              >
                {flowState === "executing" ? (
                  <span className="flex items-center gap-1.5">
                    <CircleNotch className="h-3 w-3 animate-spin" />
                    Withdrawing…
                  </span>
                ) : (
                  "Withdraw"
                )}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
