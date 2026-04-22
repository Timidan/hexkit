import React, { useMemo, useState, useRef, useEffect } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import {
  getWalletClient as getWagmiWalletClient,
  waitForTransactionReceipt as wagmiWaitForReceipt,
} from "@wagmi/core";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import {
  CircleNotch,
  CheckCircle,
  XCircle,
  Warning,
  ArrowDown,
} from "@phosphor-icons/react";
import { Input } from "../../../components/ui/input";
import { Button } from "../../../components/ui/button";
import { Switch } from "../../../components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { SUPPORTED_CHAINS, CHAIN_REGISTRY } from "../../../utils/chains";
import { simulateAssetMovements } from "../../../utils/transaction-simulation/simulateAssetMovements";
import type { AssetMovementResult } from "../../../utils/transaction-simulation/simulateAssetMovements";
import { getCachedTokenMetadata, fetchTokenMetadata } from "../../../utils/tokenMovements";
import { networkConfigManager } from "../../../config/networkConfig";
import { useComposerQuote } from "./hooks/useComposerQuote";
import { fetchComposerQuote } from "./earnApi";
import { useTokenAllowance } from "./hooks/useTokenAllowance";
import { useTokenBalance } from "./hooks/useTokenBalance";
import { TokenIcon } from "./TokenIcon";
import type { EarnToken, EarnVault } from "./types";
import { formatTxError, shortAddress, isNativeToken } from "./txUtils";

type FlowState =
  | "idle"
  | "quoting"
  | "simulating"
  | "approving"
  | "swapping"
  | "executing"
  | "success"
  | "error";

type SpenderCheckStatus = "idle" | "running" | "verified" | "already" | "suspicious" | "unknown";

interface SpenderCheckResult {
  status: SpenderCheckStatus;
  revertReason?: string;
}

// EDB returns success:true for empty traces — we can't greenlight those, they
// get "unknown". An allowance-family revert is the signal we actually want:
// it means transferFrom would reach the spender, so we mark "verified".
function classifySpenderCheck(
  result: AssetMovementResult
): SpenderCheckResult {
  if (result.success) {
    if (result.error) {
      return { status: "unknown", revertReason: result.error };
    }
    return { status: "already" };
  }
  const reason = (result.error ?? "").toLowerCase();
  if (!reason) {
    return { status: "unknown" };
  }
  const allowancePatterns = [
    "allowance",
    "erc20",
    "transferfrom",
    "transfer_from_failed",
    "insufficient allowance",
    "exceeds allowance",
    "exceeds balance",
    "safeerc20",
  ];
  if (allowancePatterns.some((p) => reason.includes(p))) {
    return { status: "verified", revertReason: result.error ?? undefined };
  }
  return { status: "suspicious", revertReason: result.error ?? undefined };
}


/**
 * Well-known tokens per chain so the deposit form can offer "deposit with X
 * (swap handled by LI.FI)" even when X isn't the vault's underlying token.
 * Only popular, high-liquidity tokens — the Composer API needs liquid routes.
 */
function getCommonTokensForChain(chainId: number): EarnToken[] {
  const native = (symbol: string, decimals = 18): EarnToken => ({
    address: "0x0000000000000000000000000000000000000000",
    symbol,
    decimals,
    chainId,
  });

  const COMMON: Record<number, EarnToken[]> = {
    // Ethereum
    1: [
      native("ETH"),
      { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", symbol: "USDC", decimals: 6, chainId: 1 },
      { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", symbol: "USDT", decimals: 6, chainId: 1 },
      { address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", symbol: "WETH", decimals: 18, chainId: 1 },
    ],
    // Polygon
    137: [
      native("POL"),
      { address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", symbol: "WPOL", decimals: 18, chainId: 137 },
      { address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", symbol: "USDC", decimals: 6, chainId: 137 },
      { address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", symbol: "USDT", decimals: 6, chainId: 137 },
      { address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", symbol: "WETH", decimals: 18, chainId: 137 },
    ],
    // Arbitrum
    42161: [
      native("ETH"),
      { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", symbol: "USDC", decimals: 6, chainId: 42161 },
      { address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", symbol: "USDT", decimals: 6, chainId: 42161 },
      { address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", symbol: "WETH", decimals: 18, chainId: 42161 },
    ],
    // Optimism
    10: [
      native("ETH"),
      { address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", symbol: "USDC", decimals: 6, chainId: 10 },
      { address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", symbol: "USDT", decimals: 6, chainId: 10 },
      { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, chainId: 10 },
    ],
    // Base
    8453: [
      native("ETH"),
      { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", decimals: 6, chainId: 8453 },
      { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", decimals: 18, chainId: 8453 },
    ],
    // BSC
    56: [
      native("BNB"),
      { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", symbol: "USDC", decimals: 18, chainId: 56 },
      { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", decimals: 18, chainId: 56 },
      { address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", symbol: "WBNB", decimals: 18, chainId: 56 },
    ],
    // Avalanche
    43114: [
      native("AVAX"),
      { address: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", symbol: "USDC", decimals: 6, chainId: 43114 },
      { address: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", symbol: "USDT", decimals: 6, chainId: 43114 },
    ],
    // Gnosis
    100: [
      native("xDAI", 18),
      { address: "0x6A023CCd1ff6F2045C3309768eAD9E68F978f6e1", symbol: "WETH", decimals: 18, chainId: 100 },
      { address: "0xDDAfbb505ad214D7b80b1f830fcCc89B60fb7A83", symbol: "USDC", decimals: 6, chainId: 100 },
    ],
  };

  const chainMeta = CHAIN_REGISTRY.find((c) => c.id === chainId);
  const nativeSymbol = chainMeta?.nativeCurrency?.symbol ?? "ETH";
  const nativeDecimals = chainMeta?.nativeCurrency?.decimals ?? 18;
  return COMMON[chainId] ?? [native(nativeSymbol, nativeDecimals)];
}

interface DepositFlowOverride {
  fromChain: number;
  fromToken: EarnToken;
  fromAmountRaw: string;
}

interface DepositFlowProps {
  vault: EarnVault;
  override?: DepositFlowOverride;
  onBroadcast?: (txHash: string) => void;
  onConfirmed?: () => void;
  onError?: (message: string) => void;
}


export function DepositFlow({
  vault,
  override,
  onBroadcast,
  onConfirmed,
  onError,
}: DepositFlowProps) {
  const { address, isConnected, chain: walletChain } = useAccount();
  const wagmiConfig = useConfig();
  const { switchChainAsync } = useSwitchChain();

  const fromChainForQuote = override?.fromChain ?? vault.chainId;

  const supportedChain = SUPPORTED_CHAINS.find((c) => c.id === fromChainForQuote);

  const underlyingTokens = useMemo(
    () => vault.underlyingTokens ?? [],
    [vault.underlyingTokens],
  );
  const firstToken = underlyingTokens[0];

  // Stable symbol list for the Composer error hint — avoids busting the
  // react-query cache with a new array reference every render.
  const underlyingSymbols = useMemo(
    () => underlyingTokens.map((t) => t.symbol),
    [underlyingTokens],
  );

  const tokens = useMemo(() => {
    const seen = new Set(underlyingTokens.map((t) => t.address.toLowerCase()));
    const extras = getCommonTokensForChain(vault.chainId).filter(
      (t) => !seen.has(t.address.toLowerCase()),
    );
    return [...underlyingTokens, ...extras];
  }, [underlyingTokens, vault.chainId]);

  const forcedToken = override?.fromToken ?? null;
  const forcedAmountRaw = override?.fromAmountRaw ?? null;

  const [amount, setAmount] = useState(
    forcedAmountRaw && forcedToken
      ? ethers.utils.formatUnits(forcedAmountRaw, forcedToken.decimals)
      : ""
  );
  const [selectedToken, setSelectedToken] = useState<EarnToken>(
    forcedToken ?? firstToken
  );
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [simResult, setSimResult] = useState<AssetMovementResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [spenderCheck, setSpenderCheck] = useState<SpenderCheckResult>({
    status: "idle",
  });
  const [simulateFirst, setSimulateFirst] = useState(false);
  const [twoStepLabel, setTwoStepLabel] = useState<string | null>(null);

  // Reset state when vault/override changes so reopening the drawer for a
  // different vault doesn't leak stale state.
  useEffect(() => {
    if (override) {
      setSelectedToken(override.fromToken);
      setAmount(
        ethers.utils.formatUnits(override.fromAmountRaw, override.fromToken.decimals)
      );
    } else {
      setSelectedToken(firstToken);
      setAmount("");
    }
    setFlowState("idle");
    setSimResult(null);
    setErrorMsg(null);
    setTxHash(null);
    setSpenderCheck({ status: "idle" });
    setSimulateFirst(false);
    setTwoStepLabel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    vault.slug,
    override?.fromChain,
    override?.fromToken?.address,
    override?.fromAmountRaw,
  ]);

  const fromAmountRaw = useMemo(() => {
    if (!amount || !selectedToken) return null;
    try {
      return ethers.utils.parseUnits(amount, selectedToken.decimals);
    } catch {
      return null;
    }
  }, [amount, selectedToken]);

  const {
    data: quote,
    isLoading: quoteLoading,
    isError: quoteError,
    error: quoteErrorObj,
    refetch: refetchQuote,
  } = useComposerQuote({
    fromChain: fromChainForQuote,
    toChain: vault.chainId,
    fromToken: selectedToken?.address ?? "",
    toToken: vault.address,
    fromAddress: address ?? "",
    toAddress: address ?? "",
    fromAmount: fromAmountRaw?.toString() ?? "0",
    underlyingSymbols,
    enabled: isConnected && !!fromAmountRaw && fromAmountRaw.gt(0),
  });

  // When Composer can't route fromToken → vault directly (1002), detect if a
  // two-step flow is possible: swap fromToken → underlying, then deposit.
  // Only enabled for same-chain deposits — cross-chain two-step would need
  // bridge settlement polling between steps which isn't implemented yet.
  const isTwoStepEligible = useMemo(() => {
    if (!quoteError) return false;
    if (fromChainForQuote !== vault.chainId) return false;
    const msg = (quoteErrorObj as Error)?.message ?? "";
    if (!msg.includes("No route available")) return false;
    if (!selectedToken || underlyingTokens.length === 0) return false;
    const fromAddr = selectedToken.address.toLowerCase();
    return !underlyingTokens.some(
      (t) => t.address.toLowerCase() === fromAddr,
    );
  }, [quoteError, quoteErrorObj, selectedToken, underlyingTokens, fromChainForQuote, vault.chainId]);

  const {
    data: allowanceStr,
    refetch: refetchAllowance,
  } = useTokenAllowance({
    tokenAddress: selectedToken?.address ?? null,
    ownerAddress: address ?? null,
    spenderAddress: quote?.estimate?.approvalAddress ?? null,
    chainId: fromChainForQuote,
  });

  const {
    data: balanceStr,
    isLoading: balanceLoading,
    refetch: refetchBalance,
  } = useTokenBalance({
    tokenAddress: selectedToken?.address ?? null,
    ownerAddress: address ?? null,
    chainId: fromChainForQuote,
  });

  const balance = useMemo(() => {
    if (!balanceStr) return null;
    try {
      return ethers.BigNumber.from(balanceStr);
    } catch {
      return null;
    }
  }, [balanceStr]);

  const balanceDisplay = useMemo(() => {
    if (!balance || !selectedToken) return null;
    try {
      const decimal = ethers.utils.formatUnits(balance, selectedToken.decimals);
      const num = parseFloat(decimal);
      if (!Number.isFinite(num)) return null;
      if (num === 0) return "0";
      if (num > 0 && num < 0.0001) return "<0.0001";
      return num.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
    } catch {
      return null;
    }
  }, [balance, selectedToken]);

  const GAS_RESERVE_WEI = ethers.utils.parseEther("0.01");
  const balanceMaxInput = useMemo(() => {
    if (!balance || !selectedToken) return null;
    try {
      let effective = balance;
      if (isNativeToken(selectedToken.address)) {
        effective = balance.sub(GAS_RESERVE_WEI);
        if (effective.lte(0)) return null;
      }
      return ethers.utils.formatUnits(effective, selectedToken.decimals);
    } catch {
      return null;
    }
  }, [balance, selectedToken]);

  const insufficientBalance = useMemo(() => {
    if (!fromAmountRaw || !balance) return false;
    return fromAmountRaw.gt(balance);
  }, [fromAmountRaw, balance]);

  const allowance = useMemo(() => {
    if (!allowanceStr) return ethers.BigNumber.from(0);
    try {
      return ethers.BigNumber.from(allowanceStr);
    } catch {
      return ethers.BigNumber.from(0);
    }
  }, [allowanceStr]);

  const needsApproval = useMemo(() => {
    if (!fromAmountRaw || !quote) return false;
    if (selectedToken && isNativeToken(selectedToken.address)) return false;
    return allowance.lt(fromAmountRaw);
  }, [allowance, fromAmountRaw, quote, selectedToken]);

  // Resolve simulation Transfer event addresses to EarnTokens.
  // Later entries win (Map.set overwrites): vault fallback → underlyings →
  // selected token → quote-authoritative tokens → included step tokens.
  const resolveMovementToken = useMemo(() => {
    const known = new Map<string, EarnToken>();
    const add = (token: EarnToken) => {
      known.set(token.address.toLowerCase(), {
        ...token,
        chainId: token.chainId ?? vault.chainId,
      });
    };

    add({
      address: vault.address,
      symbol: "shares",
      name: vault.name ?? `${vault.protocol.name} shares`,
      decimals: 18,
      chainId: vault.chainId,
    });

    for (const t of vault.underlyingTokens ?? []) add(t);
    if (selectedToken) add(selectedToken);
    if (quote?.action?.fromToken) add(quote.action.fromToken);
    if (quote?.action?.toToken) add(quote.action.toToken);

    if (quote?.includedSteps) {
      for (const step of quote.includedSteps) {
        if (step?.action?.fromToken) add(step.action.fromToken);
        if (step?.action?.toToken) add(step.action.toToken);
      }
    }

    return (address: string, movementChainId: number): EarnToken => {
      const key = address.toLowerCase();
      const hit = known.get(key);
      if (hit) return hit;

      const cached = getCachedTokenMetadata(address);
      if (cached) {
        return {
          address,
          symbol: cached.symbol,
          name: cached.name,
          decimals: cached.decimals,
          chainId: movementChainId,
        };
      }

      return {
        address,
        symbol: shortAddress(address),
        decimals: 18,
        chainId: movementChainId,
      };
    };
  }, [vault, selectedToken, quote]);

  const netWalletChanges = useMemo(() => {
    if (!simResult?.movements || !address) return [];
    const walletLower = address.toLowerCase();
    const perToken = new Map<string, { delta: bigint; tokenAddress: string; tokenSymbol?: string; decimals?: number }>();
    for (const mv of simResult.movements) {
      const fromLower = mv.from.toLowerCase();
      const toLower = mv.to.toLowerCase();
      const touchesWallet = fromLower === walletLower || toLower === walletLower;
      if (!touchesWallet) continue;

      const key = mv.tokenAddress.toLowerCase();
      let amt: bigint;
      try {
        amt = BigInt(mv.amount || "0");
      } catch {
        continue;
      }
      const existing = perToken.get(key) ?? {
        delta: 0n,
        tokenAddress: mv.tokenAddress,
        tokenSymbol: mv.tokenSymbol,
        decimals: mv.decimals,
      };
      if (fromLower === walletLower) existing.delta -= amt;
      if (toLower === walletLower) existing.delta += amt;
      if (mv.tokenSymbol && !mv.tokenSymbol.startsWith("0x")) {
        existing.tokenSymbol = mv.tokenSymbol;
      }
      if (mv.decimals !== undefined) existing.decimals = mv.decimals;
      perToken.set(key, existing);
    }

    // Synthesize native-ETH outflow: msg.value payments don't emit an ERC-20
    // Transfer event, so native deposits show only the share inflow otherwise.
    if (
      simResult.success &&
      selectedToken &&
      isNativeToken(selectedToken.address) &&
      fromAmountRaw &&
      !fromAmountRaw.isZero()
    ) {
      const key = selectedToken.address.toLowerCase();
      const existing = perToken.get(key) ?? {
        delta: 0n,
        tokenAddress: selectedToken.address,
      };
      try {
        existing.delta -= BigInt(fromAmountRaw.toString());
        perToken.set(key, existing);
      } catch {
        /* non-fatal: skip synthesis if BigInt conversion fails */
      }
    }

    const rows = [...perToken.values()].filter((r) => r.delta !== 0n);
    rows.sort((a, b) => {
      const aOut = a.delta < 0n ? 0 : 1;
      const bOut = b.delta < 0n ? 0 : 1;
      return aOut - bOut;
    });
    return rows;
  }, [simResult, address, selectedToken, fromAmountRaw]);

  const [resolvedTokens, setResolvedTokens] = useState<Map<string, { symbol: string; decimals: number }>>(new Map());
  const rpcFetchingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!netWalletChanges.length || !supportedChain) return;

    const unknowns: string[] = [];
    for (const change of netWalletChanges) {
      const addr = change.tokenAddress.toLowerCase();
      if (resolvedTokens.has(addr)) continue;
      if (change.tokenSymbol && !change.tokenSymbol.startsWith("0x")) continue;
      const known = resolveMovementToken(addr, fromChainForQuote);
      if (known.symbol && !known.symbol.startsWith("0x") && !known.symbol.includes("…")) continue;
      if (rpcFetchingRef.current.has(addr)) continue;
      unknowns.push(change.tokenAddress);
    }

    if (unknowns.length === 0) return;
    unknowns.forEach((a) => rpcFetchingRef.current.add(a.toLowerCase()));

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
      unknowns.forEach((a) => rpcFetchingRef.current.delete(a.toLowerCase()));
    });
  }, [netWalletChanges, supportedChain, resolveMovementToken, fromChainForQuote]);

  // Classify whether the approval spender matches the contract that will
  // actually call ERC20.transferFrom. Capped at 20 s on slow RPCs.
  useEffect(() => {
    if (!needsApproval) {
      setSpenderCheck({ status: "idle" });
      return;
    }
    if (!quote || !supportedChain || !address) return;
    if (
      flowState === "simulating" ||
      flowState === "approving" ||
      flowState === "executing"
    ) {
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      cancelled = true;
      setSpenderCheck({ status: "unknown" });
    }, 20_000);

    setSpenderCheck({ status: "running" });
    (async () => {
      try {
        const tx = {
          to: quote.transactionRequest.to,
          data: quote.transactionRequest.data,
          value: quote.transactionRequest.value,
          gasLimit: quote.transactionRequest.gasLimit,
          gasPrice: quote.transactionRequest.gasPrice,
        };
        const result = await simulateAssetMovements(tx, supportedChain, address);
        if (cancelled) return;
        clearTimeout(timeout);
        setSpenderCheck(classifySpenderCheck(result));
      } catch {
        if (cancelled) return;
        clearTimeout(timeout);
        setSpenderCheck({ status: "unknown" });
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    needsApproval,
    quote?.transactionRequest?.to,
    quote?.transactionRequest?.data,
    quote?.estimate?.approvalAddress,
    supportedChain?.id,
    address,
    flowState,
  ]);

  async function handleSimulate() {
    if (!quote || !supportedChain || !address) return;

    setFlowState("simulating");
    setSimResult(null);
    setErrorMsg(null);

    try {
      const { data: freshQuote } = await refetchQuote();
      const q = freshQuote ?? quote;

      const tx = {
        to: q.transactionRequest.to,
        data: q.transactionRequest.data,
        value: q.transactionRequest.value,
        gasLimit: q.transactionRequest.gasLimit,
        gasPrice: q.transactionRequest.gasPrice,
      };

      const result = await simulateAssetMovements(tx, supportedChain, address);
      setSimResult(result);
      setFlowState("idle");
      if (result.success) {
        setSimulateFirst(false);
      }
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setFlowState("error");
    }
  }

  async function handleApprove() {
    if (!quote || !address || !selectedToken) return;

    setFlowState("approving");
    setErrorMsg(null);

    try {
      if (walletChain?.id !== fromChainForQuote) {
        await switchChainAsync({ chainId: fromChainForQuote });
      }

      const walletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: fromChainForQuote,
      });

      if (!walletClient) {
        throw new Error("No wallet client available. Please connect your wallet.");
      }

      const spender = quote.estimate.approvalAddress as `0x${string}`;
      const tokenAddr = selectedToken.address as `0x${string}`;

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
          chain: { id: fromChainForQuote } as any,
        });

        const resetReceipt = await wagmiWaitForReceipt(wagmiConfig, {
          hash: resetHash,
          chainId: fromChainForQuote,
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
        chain: { id: fromChainForQuote } as any,
      });

      const receipt = await wagmiWaitForReceipt(wagmiConfig, {
        hash,
        chainId: fromChainForQuote,
        timeout: 120_000,
      });

      if (receipt.status === "reverted") {
        throw new Error("Approval transaction reverted onchain");
      }

      await refetchAllowance();
      await refetchBalance();
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
      const { data: freshQuote } = await refetchQuote();
      const q = freshQuote ?? quote;

      if (walletChain?.id !== fromChainForQuote) {
        await switchChainAsync({ chainId: fromChainForQuote });
      }

      const walletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: fromChainForQuote,
      });

      if (!walletClient) {
        throw new Error("No wallet client available. Please connect your wallet.");
      }

      const hash = await walletClient.sendTransaction({
        to: q.transactionRequest.to as `0x${string}`,
        data: q.transactionRequest.data as `0x${string}`,
        value: q.transactionRequest.value
          ? BigInt(q.transactionRequest.value)
          : undefined,
        gas: q.transactionRequest.gasLimit
          ? BigInt(q.transactionRequest.gasLimit)
          : undefined,
        chain: { id: fromChainForQuote } as any,
      });

      setTxHash(hash);
      onBroadcast?.(hash);

      const receipt = await wagmiWaitForReceipt(wagmiConfig, {
        hash,
        chainId: fromChainForQuote,
        timeout: 120_000,
      });

      if (receipt.status === "reverted") {
        throw new Error("Deposit transaction reverted onchain");
      }

      setFlowState("success");
      refetchBalance();
      onConfirmed?.();
    } catch (err: unknown) {
      const msg = formatTxError(err);
      setErrorMsg(msg);
      setFlowState("error");
      onError?.(msg);
    }
  }

  async function handleTwoStepExecute() {
    if (!address || !selectedToken || !fromAmountRaw) return;
    const underlying = underlyingTokens[0];
    if (!underlying) return;

    setFlowState("swapping");
    setErrorMsg(null);
    setTwoStepLabel("Fetching swap route…");

    try {
      if (walletChain?.id !== fromChainForQuote) {
        await switchChainAsync({ chainId: fromChainForQuote });
      }

      let walletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: fromChainForQuote,
      });
      if (!walletClient) {
        throw new Error("No wallet client available. Please connect your wallet.");
      }

      // ── Step 1: Swap fromToken → underlying ──────────────────────────
      const swapQ = await fetchComposerQuote({
        fromChain: fromChainForQuote,
        toChain: vault.chainId,
        fromToken: selectedToken.address,
        toToken: underlying.address,
        fromAddress: address,
        toAddress: address,
        fromAmount: fromAmountRaw.toString(),
      });

      // Step 1a: Approve fromToken for the swap if needed
      if (!isNativeToken(selectedToken.address)) {
        setTwoStepLabel("Checking swap approval…");
        const spender = swapQ.estimate.approvalAddress;
        const currentAllowance = await readAllowanceOnChain(
          selectedToken.address,
          address,
          spender,
          fromChainForQuote,
        );
        if (currentAllowance.lt(fromAmountRaw)) {
          setTwoStepLabel(`Approve ${selectedToken.symbol} for swap…`);
          await sendInlineApproval(
            walletClient,
            selectedToken.address,
            spender,
            fromChainForQuote,
          );
        }
      }

      // Step 1b: Execute the swap
      setTwoStepLabel(`Swapping ${selectedToken.symbol} → ${underlying.symbol}…`);
      const swapHash = await walletClient.sendTransaction({
        to: swapQ.transactionRequest.to as `0x${string}`,
        data: swapQ.transactionRequest.data as `0x${string}`,
        value: swapQ.transactionRequest.value
          ? BigInt(swapQ.transactionRequest.value)
          : undefined,
        gas: swapQ.transactionRequest.gasLimit
          ? BigInt(swapQ.transactionRequest.gasLimit)
          : undefined,
        chain: { id: fromChainForQuote } as any,
      });

      setTxHash(swapHash);
      onBroadcast?.(swapHash);
      setTwoStepLabel("Confirming swap…");

      const swapReceipt = await wagmiWaitForReceipt(wagmiConfig, {
        hash: swapHash,
        chainId: fromChainForQuote,
        timeout: 120_000,
      });
      if (swapReceipt.status === "reverted") {
        throw new Error("Swap transaction reverted onchain");
      }

      // ── Step 2: Deposit underlying → vault ───────────────────────────
      setFlowState("executing");
      setTwoStepLabel("Fetching deposit route…");

      // Read the actual on-chain balance of the underlying token after the
      // swap — using toAmountMin would leave dust un-deposited if the swap
      // delivered more than the slippage-adjusted minimum.
      const actualBalance = await readBalanceOnChain(
        underlying.address,
        address,
        vault.chainId,
      );
      const depositAmount = actualBalance.gt(0)
        ? actualBalance.toString()
        : swapQ.estimate.toAmountMin;

      const depositQ = await fetchComposerQuote({
        fromChain: vault.chainId,
        toChain: vault.chainId,
        fromToken: underlying.address,
        toToken: vault.address,
        fromAddress: address,
        toAddress: address,
        fromAmount: depositAmount,
      });

      // Switch chain if the vault is on a different chain
      if (walletChain?.id !== vault.chainId) {
        await switchChainAsync({ chainId: vault.chainId });
      }
      walletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: vault.chainId,
      });
      if (!walletClient) {
        throw new Error("No wallet client available. Please connect your wallet.");
      }

      // Step 2a: Approve underlying for the deposit if needed
      if (!isNativeToken(underlying.address)) {
        setTwoStepLabel(`Checking ${underlying.symbol} deposit approval…`);
        const depositSpender = depositQ.estimate.approvalAddress;
        const depositAllowance = await readAllowanceOnChain(
          underlying.address,
          address,
          depositSpender,
          vault.chainId,
        );
        const depositAmountBN = ethers.BigNumber.from(depositAmount);
        if (depositAllowance.lt(depositAmountBN)) {
          setTwoStepLabel(`Approve ${underlying.symbol} for deposit…`);
          await sendInlineApproval(
            walletClient,
            underlying.address,
            depositSpender,
            vault.chainId,
          );
        }
      }

      // Step 2b: Execute the deposit
      setTwoStepLabel("Depositing into vault…");
      const depositHash = await walletClient.sendTransaction({
        to: depositQ.transactionRequest.to as `0x${string}`,
        data: depositQ.transactionRequest.data as `0x${string}`,
        value: depositQ.transactionRequest.value
          ? BigInt(depositQ.transactionRequest.value)
          : undefined,
        gas: depositQ.transactionRequest.gasLimit
          ? BigInt(depositQ.transactionRequest.gasLimit)
          : undefined,
        chain: { id: vault.chainId } as any,
      });

      setTxHash(depositHash);
      setTwoStepLabel("Confirming deposit…");

      const depositReceipt = await wagmiWaitForReceipt(wagmiConfig, {
        hash: depositHash,
        chainId: vault.chainId,
        timeout: 120_000,
      });
      if (depositReceipt.status === "reverted") {
        throw new Error("Deposit transaction reverted onchain");
      }

      setFlowState("success");
      setTwoStepLabel(null);
      refetchBalance();
      onConfirmed?.();
    } catch (err: unknown) {
      const msg = formatTxError(err);
      setErrorMsg(msg);
      setFlowState("error");
      setTwoStepLabel(null);
      onError?.(msg);
    }
  }

  /** Read ERC-20 allowance directly from the chain via RPC. */
  async function readAllowanceOnChain(
    tokenAddress: string,
    owner: string,
    spender: string,
    chainId: number,
  ): Promise<ethers.BigNumber> {
    const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
    if (!chain) return ethers.BigNumber.from(0);
    const resolution = networkConfigManager.resolveRpcUrl(chainId, chain.rpcUrl);
    if (!resolution.url) return ethers.BigNumber.from(0);
    const provider = new ethers.providers.StaticJsonRpcProvider(
      resolution.url,
      chainId,
    );
    const erc20 = new ethers.Contract(
      tokenAddress,
      ["function allowance(address,address) view returns (uint256)"],
      provider,
    );
    return erc20.allowance(owner, spender);
  }

  /** Read ERC-20 (or native) balance directly from the chain via RPC. */
  async function readBalanceOnChain(
    tokenAddress: string,
    owner: string,
    chainId: number,
  ): Promise<ethers.BigNumber> {
    const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
    if (!chain) return ethers.BigNumber.from(0);
    const resolution = networkConfigManager.resolveRpcUrl(chainId, chain.rpcUrl);
    if (!resolution.url) return ethers.BigNumber.from(0);
    const provider = new ethers.providers.StaticJsonRpcProvider(
      resolution.url,
      chainId,
    );
    if (isNativeToken(tokenAddress)) {
      return provider.getBalance(owner);
    }
    const erc20 = new ethers.Contract(
      tokenAddress,
      ["function balanceOf(address) view returns (uint256)"],
      provider,
    );
    return erc20.balanceOf(owner);
  }

  /** Send an ERC-20 max-approval and wait for confirmation. */
  async function sendInlineApproval(
    walletClient: Awaited<ReturnType<typeof getWagmiWalletClient>>,
    tokenAddress: string,
    spender: string,
    chainId: number,
  ) {
    const iface = new ethers.utils.Interface([
      "function approve(address spender, uint256 amount) returns (bool)",
    ]);
    const data = iface.encodeFunctionData("approve", [
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
      timeout: 120_000,
    });
    if (receipt.status === "reverted") {
      throw new Error("Approval transaction reverted onchain");
    }
  }

  if (!supportedChain) {
    return (
      <div className="rounded-lg border border-border/40 bg-muted/10 p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Warning className="h-4 w-4 shrink-0 text-yellow-500" />
          Deposits on this chain are not supported yet.
        </div>
      </div>
    );
  }

  const explorerUrl = supportedChain?.explorerUrl ?? "";

  const isBusy =
    flowState === "simulating" ||
    flowState === "approving" ||
    flowState === "swapping" ||
    flowState === "executing";

  return (
    <div className="p-3">
      <div className="mx-auto w-full max-w-xl space-y-3">
      <p className="text-base font-semibold">Deposit</p>

      {!isConnected ? (
        <p className="text-sm text-muted-foreground">
          Connect your wallet to deposit.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-sm text-muted-foreground">Deposit with</label>
            <Select
              value={selectedToken?.address}
              onValueChange={(addr) => {
                const t = tokens.find((tk) => tk.address === addr);
                if (t) {
                  setSelectedToken(t);
                  setAmount("");
                  setSimResult(null);
                }
              }}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {underlyingTokens.length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    Direct
                  </div>
                )}
                {underlyingTokens.map((t) => (
                  <SelectItem key={t.address} value={t.address}>
                    <TokenSelectRow
                      token={t}
                      chainId={fromChainForQuote}
                      ownerAddress={address ?? null}
                    />
                  </SelectItem>
                ))}
                {tokens.length > underlyingTokens.length && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      Swap + Deposit
                    </div>
                    {tokens.slice(underlyingTokens.length).map((t) => (
                      <SelectItem key={t.address} value={t.address}>
                        <TokenSelectRow
                          token={t}
                          chainId={fromChainForQuote}
                          ownerAddress={address ?? null}
                        />
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-sm text-muted-foreground">Amount</label>
              {address && selectedToken && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Balance:</span>
                  {balanceLoading && !balance ? (
                    <CircleNotch className="h-2.5 w-2.5 animate-spin" />
                  ) : balanceDisplay != null ? (
                    <>
                      <span className="font-mono tabular-nums text-foreground/80">
                        {balanceDisplay} {selectedToken.symbol}
                      </span>
                      {balanceMaxInput && balance?.gt(0) && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setAmount(balanceMaxInput);
                            setSimResult(null);
                            setErrorMsg(null);
                            setFlowState("idle");
                            setSpenderCheck({ status: "idle" });
                          }}
                          className="rounded border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                        >
                          Max
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">—</span>
                  )}
                </div>
              )}
            </div>
            <div className="relative">
              <Input
                className={`h-11 text-base pr-16 ${
                  insufficientBalance
                    ? "border-destructive/60 focus-visible:ring-destructive/30"
                    : ""
                }`}
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setSimResult(null);
                  setErrorMsg(null);
                  setFlowState("idle");
                  setSpenderCheck({ status: "idle" });
                }}
                disabled={isBusy}
                type="number"
                min="0"
                step="any"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground pointer-events-none">
                {selectedToken?.symbol}
              </span>
            </div>
            {insufficientBalance && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <Warning className="h-2.5 w-2.5" />
                Exceeds your {selectedToken?.symbol} balance on {supportedChain?.name}
              </p>
            )}
            {address && selectedToken && balance?.gt(0) && (
              <div className="flex items-center gap-1.5 pt-1">
                {[25, 50, 75].map((pct) => {
                  const maxStr = balanceMaxInput ?? (balance ? ethers.utils.formatUnits(balance, selectedToken.decimals) : null);
                  return (
                    <button
                      key={pct}
                      type="button"
                      disabled={isBusy}
                      onClick={() => {
                        if (!maxStr) return;
                        const maxVal = parseFloat(maxStr);
                        if (!Number.isFinite(maxVal) || maxVal <= 0) return;
                        const val = (maxVal * pct) / 100;
                        const dp = Math.min(selectedToken.decimals, 6);
                        setAmount(val.toFixed(dp));
                        setSimResult(null);
                        setErrorMsg(null);
                        setFlowState("idle");
                        setSpenderCheck({ status: "idle" });
                      }}
                      className="flex-1 rounded border border-border/40 bg-muted/30 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                    >
                      {pct}%
                    </button>
                  );
                })}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    const maxStr = balanceMaxInput ?? (balance ? ethers.utils.formatUnits(balance, selectedToken.decimals) : null);
                    if (!maxStr) return;
                    setAmount(maxStr);
                    setSimResult(null);
                    setErrorMsg(null);
                    setFlowState("idle");
                    setSpenderCheck({ status: "idle" });
                  }}
                  className="flex-1 rounded border border-border/40 bg-muted/30 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
            )}
          </div>

          <YieldForecast
            amount={parseFloat(amount) || 0}
            tokenSymbol={selectedToken?.symbol ?? ""}
            apy={vault.analytics.apy.total}
          />

          {amount && fromAmountRaw && fromAmountRaw.gt(0) && (
            <div className="text-sm space-y-1">
              {quoteLoading && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CircleNotch className="h-3 w-3 animate-spin" />
                  Fetching quote…
                </div>
              )}
              {quoteError && !isTwoStepEligible && (
                <div className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-3 w-3" />
                  {(quoteErrorObj as Error)?.message ?? "Failed to fetch quote"}
                </div>
              )}
              {isTwoStepEligible && (
                <div className="rounded-md border border-yellow-500/40 bg-yellow-500/5 p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-yellow-600">
                    <Warning className="h-3.5 w-3.5 shrink-0" />
                    No direct route — two-step deposit available
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Step 1: Swap {selectedToken?.symbol} → {underlyingTokens[0]?.symbol}.{" "}
                    Step 2: Deposit {underlyingTokens[0]?.symbol} into vault.
                  </p>
                </div>
              )}
              {quote && !quoteError && (() => {
                // Composer's `toToken` is the vault share — prefer USD display.
                const fromUsd = quote.estimate.fromAmountUSD
                  ? parseFloat(quote.estimate.fromAmountUSD)
                  : null;
                const toUsd = quote.estimate.toAmountUSD
                  ? parseFloat(quote.estimate.toAmountUSD)
                  : null;
                const shareDecimals = quote.action.toToken.decimals ?? 18;
                const shareSymbol = quote.action.toToken.symbol ?? "shares";
                let sharesDisplay = "";
                try {
                  const sharesNum = parseFloat(
                    ethers.utils.formatUnits(quote.estimate.toAmountMin, shareDecimals),
                  );
                  sharesDisplay = Number.isFinite(sharesNum) && sharesNum > 0
                    ? sharesNum.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })
                    : "—";
                } catch {
                  sharesDisplay = "—";
                }
                const priceImpact =
                  fromUsd != null && toUsd != null && fromUsd > 0
                    ? (fromUsd - toUsd) / fromUsd
                    : null;
                const impactBad = priceImpact != null && priceImpact > 0.02;

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
                          : `${sharesDisplay} ${shareSymbol}`}
                      </span>
                    </div>
                    {toUsd != null && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Min shares</span>
                        <span className="tabular-nums font-mono">
                          {sharesDisplay} {shareSymbol}
                        </span>
                      </div>
                    )}
                    {priceImpact != null && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Price impact</span>
                        <span
                          className={`tabular-nums ${
                            impactBad ? "text-yellow-500" : "text-muted-foreground"
                          }`}
                        >
                          {(priceImpact * 100).toFixed(2)}%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {simResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className={`rounded-md border p-2.5 text-sm space-y-1.5 ${
                simResult.success
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-destructive/40 bg-destructive/5"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium">
                {simResult.success ? (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
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
                    const token = resolveMovementToken(
                      change.tokenAddress,
                      fromChainForQuote
                    );

                    const reactiveHit = resolvedTokens.get(change.tokenAddress.toLowerCase());
                    const resolvedSym =
                      reactiveHit?.symbol
                        ?? (change.tokenSymbol && !change.tokenSymbol.startsWith("0x") ? change.tokenSymbol : null)
                        ?? (token.symbol && !token.symbol.startsWith("0x") && !token.symbol.includes("…") ? token.symbol : null);

                    // Skip protocol-internal addresses (e.g. Aave RewardsController)
                    // whose symbol() reverts — they're not real ERC-20 tokens.
                    if (!resolvedSym) return null;

                    const effectiveSymbol = resolvedSym;
                    const underlyingAsset = vault.underlyingTokens?.[0];
                    const effectiveDecimals = reactiveHit?.decimals ?? change.decimals ?? token.decimals ?? underlyingAsset?.decimals ?? 18;

                    let display: string;
                    let numericAmount = 0;
                    try {
                      const absStr =
                        change.delta < 0n
                          ? (-change.delta).toString()
                          : change.delta.toString();
                      const raw = ethers.utils.formatUnits(
                        absStr,
                        effectiveDecimals
                      );
                      const num = Number(raw);
                      numericAmount = num;
                      if (Number.isFinite(num)) {
                        if (num === 0) {
                          display = "0";
                        } else if (num > 0 && num < 0.0001) {
                          display = "<0.0001";
                        } else {
                          display = num.toLocaleString(undefined, {
                            maximumFractionDigits: 6,
                          });
                        }
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
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs"
                      >
                        <TokenIcon
                          token={{
                            address: token.address,
                            symbol: effectiveSymbol,
                            logoURI: token.logoURI,
                          }}
                          chainId={token.chainId ?? fromChainForQuote}
                          className="h-4 w-4 shrink-0 rounded-full"
                        />
                        <span className={`font-mono tabular-nums ${color}`}>
                          {sign}
                          {display}
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
              {simResult.movements.length > 0 && netWalletChanges.length === 0 && (
                <p className="pt-1 text-xs text-muted-foreground border-t border-border/30">
                  No net balance change for your wallet.
                </p>
              )}
            </motion.div>
          )}

          <AnimatePresence>
            {flowState === "error" && errorMsg && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive"
              >
                <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span className="break-words">{errorMsg}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {flowState === "success" && txHash && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5 text-sm text-emerald-600"
              >
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12, delay: 0.1 }}
                  className="mt-0.5 shrink-0"
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                </motion.span>
                <span>
                  Deposit confirmed!{" "}
                  {explorerUrl && (
                    <a
                      href={`${explorerUrl}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:opacity-80"
                    >
                      View on explorer
                    </a>
                  )}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {needsApproval && quote?.estimate?.approvalAddress && (
            <SpenderCheckPanel
              spender={quote.estimate.approvalAddress}
              explorerUrl={explorerUrl}
              check={spenderCheck}
            />
          )}

          {/*
            Single-CTA layout with an opt-in "Simulate first" toggle. The
            toggle only renders in the Deposit branch — running the simulator
            against the deposit tx before allowance is live always reverts
            with TRANSFER_FROM_FAILED, which is just noise. The pre-approval
            sanity check is already handled by the automatic spender check
            panel above. Outline variant on the CTA keeps it from lighting
            up blue.
          */}
          {/* Two-step progress indicator */}
          {twoStepLabel && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-md border border-border/40 bg-background/30 p-2.5 text-sm text-muted-foreground"
            >
              <CircleNotch className="h-3.5 w-3.5 animate-spin shrink-0 text-emerald-500" />
              <span>{twoStepLabel}</span>
            </motion.div>
          )}

          <div className="flex flex-col items-center gap-2 pt-1">
            {!needsApproval && !isTwoStepEligible && !simResult?.success && (
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
                <Switch
                  checked={simulateFirst}
                  onCheckedChange={setSimulateFirst}
                  disabled={isBusy || flowState === "success"}
                />
                Simulate first
              </label>
            )}

            {(() => {
              // Two-step mode: the CTA is always "Deposit (2 steps)"
              if (isTwoStepEligible) {
                const twoStepBusy =
                  flowState === "swapping" || flowState === "executing";
                const disabled =
                  twoStepBusy ||
                  flowState === "success" ||
                  insufficientBalance ||
                  !fromAmountRaw ||
                  fromAmountRaw.isZero();

                const ctaKey = twoStepBusy
                  ? flowState === "swapping"
                    ? "swapping"
                    : "depositing"
                  : "two-step";
                const ctaLabel = twoStepBusy ? (
                  <>
                    <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
                    {flowState === "swapping" ? "Swapping…" : "Depositing…"}
                  </>
                ) : insufficientBalance ? (
                  "Insufficient balance"
                ) : (
                  "Deposit (2 steps)"
                );

                return (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 px-6 text-sm overflow-hidden"
                    disabled={disabled}
                    onClick={handleTwoStepExecute}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={ctaKey}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{
                          duration: 0.2,
                          ease: [0.22, 1, 0.36, 1],
                        }}
                        className="inline-flex items-center"
                      >
                        {ctaLabel}
                      </motion.span>
                    </AnimatePresence>
                  </Button>
                );
              }

              // Single-step mode (existing logic)
              const disabled =
                !quote ||
                isBusy ||
                flowState === "success" ||
                insufficientBalance;

              let ctaKey: string;
              let ctaLabel: React.ReactNode;
              let ctaHandler: () => void;

              if (!needsApproval && simulateFirst && !simResult?.success) {
                ctaKey = flowState === "simulating" ? "simulating" : "simulate";
                ctaLabel = flowState === "simulating" ? (
                  <>
                    <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
                    Simulating…
                  </>
                ) : "Simulate";
                ctaHandler = handleSimulate;
              } else if (needsApproval) {
                ctaKey = flowState === "approving" ? "approving" : insufficientBalance ? "insufficient" : "approve";
                ctaLabel = flowState === "approving" ? (
                  <>
                    <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
                    Approving…
                  </>
                ) : insufficientBalance ? "Insufficient balance" : "Approve";
                ctaHandler = handleApprove;
              } else {
                ctaKey = flowState === "executing" ? "executing" : insufficientBalance ? "insufficient" : "deposit";
                ctaLabel = flowState === "executing" ? (
                  <>
                    <CircleNotch className="h-3 w-3 animate-spin mr-1.5" />
                    Depositing…
                  </>
                ) : insufficientBalance ? "Insufficient balance" : "Deposit";
                ctaHandler = handleExecute;
              }

              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-6 text-sm overflow-hidden"
                  disabled={disabled}
                  onClick={ctaHandler}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={ctaKey}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="inline-flex items-center"
                    >
                      {ctaLabel}
                    </motion.span>
                  </AnimatePresence>
                </Button>
              );
            })()}
          </div>
        </>
      )}
      </div>
    </div>
  );
}

const FORECAST_PERIODS = [
  { label: "1d", days: 1 },
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "1y", days: 365 },
] as const;

function YieldForecast({
  amount,
  tokenSymbol,
  apy,
}: {
  amount: number;
  tokenSymbol: string;
  apy: number | null;
}) {
  if (!apy) return null;

  const hasAmount = Number.isFinite(amount) && amount > 0;
  const dailyRate = apy / 100 / 365;

  return (
    <div className="rounded-md border border-border/40 bg-background/30 p-2.5 space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        Yield forecast at {apy.toFixed(2)}% APY
      </p>
      <div className="grid grid-cols-4 gap-2">
        {FORECAST_PERIODS.map(({ label, days }) => {
          const earned = hasAmount ? amount * dailyRate * days : 0;
          return (
            <div key={label} className="text-center">
              <p className="text-[10px] text-muted-foreground">{label}</p>
              <p className={`text-xs font-medium tabular-nums ${hasAmount ? "text-emerald-500" : "text-muted-foreground/40"}`}>
                {hasAmount
                  ? `+${earned < 0.01 ? "<0.01" : earned.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">{tokenSymbol}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SpenderCheckPanelProps {
  spender: string;
  explorerUrl: string;
  check: SpenderCheckResult;
}

function SpenderCheckPanel({
  spender,
  explorerUrl,
  check,
}: SpenderCheckPanelProps) {
  const explorerLink = explorerUrl ? `${explorerUrl}/address/${spender}` : null;

  if (check.status === "idle") return null;

  // Compact single-line badge — no verbose hints. The status label is
  // self-explanatory; the spender address links to the explorer for anyone
  // who wants to dig deeper.
  const statusContent = (() => {
    switch (check.status) {
      case "running":
        return (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <CircleNotch className="h-3.5 w-3.5 animate-spin" />
            Verifying…
          </span>
        );
      case "verified":
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-500 animate-in fade-in zoom-in duration-300">
            <CheckCircle className="h-4 w-4" weight="fill" />
            Spender verified
          </span>
        );
      case "already":
        return (
          <span className="inline-flex items-center gap-1.5 text-emerald-500 animate-in fade-in zoom-in duration-300">
            <CheckCircle className="h-4 w-4" weight="fill" />
            No approval needed
          </span>
        );
      case "suspicious":
        return (
          <span className="inline-flex items-center gap-1.5 text-yellow-500">
            <Warning className="h-3.5 w-3.5" />
            Unverified spender
          </span>
        );
      case "unknown":
        return (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Warning className="h-3.5 w-3.5" />
            Check unavailable
          </span>
        );
    }
  })();

  return (
    <div className="flex items-center justify-between px-1 text-xs">
      <span className="font-mono text-muted-foreground" title={spender}>
        {explorerLink ? (
          <a
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:underline"
          >
            {shortAddress(spender)}
          </a>
        ) : (
          shortAddress(spender)
        )}
      </span>
      {statusContent}
    </div>
  );
}

/** Token row inside the deposit-with dropdown — icon + symbol + balance. */
function TokenSelectRow({
  token,
  chainId,
  ownerAddress,
}: {
  token: EarnToken;
  chainId: number;
  ownerAddress: string | null;
}) {
  const { data: rawBalance } = useTokenBalance({
    tokenAddress: token.address,
    ownerAddress,
    chainId,
  });

  let displayBal: string | null = null;
  if (rawBalance) {
    const n = parseFloat(
      ethers.utils.formatUnits(rawBalance, token.decimals),
    );
    if (n > 0) {
      displayBal = n < 0.0001 ? "<0.0001" : n < 1 ? n.toPrecision(4) : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
  }

  return (
    <span className="flex w-full items-center gap-2">
      <TokenIcon
        token={{ address: token.address, symbol: token.symbol, logoURI: token.logoURI }}
        chainId={chainId}
        className="h-4 w-4 shrink-0 rounded-full"
      />
      <span className="flex-1 truncate">{token.symbol}</span>
      {displayBal && (
        <span className="text-[10px] text-muted-foreground">{displayBal}</span>
      )}
    </span>
  );
}
