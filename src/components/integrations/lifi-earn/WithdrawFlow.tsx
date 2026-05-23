import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useConfig, useSwitchChain } from "wagmi";
import {
  getAccount as wagmiGetAccount,
  getWalletClient as getWagmiWalletClient,
  waitForTransactionReceipt as wagmiWaitForReceipt,
} from "@wagmi/core";
import type { Address, Hex } from "viem";
import { ethers } from "ethers";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { CHAIN_REGISTRY, SUPPORTED_CHAINS } from "../../../utils/chains";
import { simulateAssetMovements } from "../../../utils/transaction-simulation/simulateAssetMovements";
import type { AssetMovementResult } from "../../../utils/transaction-simulation/simulateAssetMovements";
import { getCachedTokenMetadata, fetchTokenMetadata } from "../../../utils/tokenMovements";
import { networkConfigManager } from "../../../config/networkConfig";
import { TokenIcon } from "./TokenIcon";
import { useWithdrawQuote } from "./hooks/useWithdrawQuote";
import { useTokenAllowance } from "./hooks/useTokenAllowance";
import { useTokenBalance } from "./hooks/useTokenBalance";
import { WithdrawIntentRouteStep, type WithdrawIntentRouteStage } from "./WithdrawIntentRouteStep";
import {
  executeWithdrawComposerRoute,
  type WithdrawComposerRouteState,
} from "./withdrawComposerRoute";
import {
  destinationTokenKey,
  getDestinationTokenOptions,
  pickDefaultDestinationToken,
} from "./destinationTokenOptions";
import { formatTxError, isNativeToken, safeApproveErc20, shortAddress } from "./txUtils";
import type { EarnPosition, EarnVault, EarnToken } from "./types";
import EdbBadge from "../../EdbBadge";

type WithdrawState =
  | "idle"
  | "redeem-quoting"
  | "redeem-approving"
  | "simulating"
  | "redeeming"
  | "redeemed"
  | "route-quoting"
  | "intent-quoted"
  | "composer-quoted"
  | "intent-open"
  | "composer-sending"
  | "composer-settling"
  | "intent-delivered"
  | "done"
  | "error";

type RouteMode = "intent" | "composer";
type RouteOutcome = "redeemed-only" | "kept-underlying" | "intent" | "composer" | null;

interface WithdrawFlowProps {
  position: EarnPosition;
  vault: EarnVault;
  onComplete?: () => void;
  onClose?: () => void;
}

const ERC20_READ_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

export function WithdrawFlow({ position, vault, onComplete, onClose }: WithdrawFlowProps) {
  const { address, chain: walletChain } = useAccount();
  const wagmiConfig = useConfig();
  const { switchChainAsync } = useSwitchChain();

  const [amount, setAmount] = useState("");
  const [flowState, setFlowState] = useState<WithdrawState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [simulateFirst, setSimulateFirst] = useState(false);
  const [simResult, setSimResult] = useState<AssetMovementResult | null>(null);
  const [shareDecimals, setShareDecimals] = useState(position.asset.decimals);
  // On-chain vault share balance — authoritative source of "what the user
  // can actually redeem". `position.balanceNative` from Earn may be denoted
  // in underlying terms which doesn't translate 1:1 to shares for vaults
  // whose share value has appreciated (Morpho-style).
  const [shareBalanceRaw, setShareBalanceRaw] = useState<ethers.BigNumber | null>(null);
  // Tracks the lifecycle of the on-chain share-balance read so the form can
  // disable + warn when we don't have authoritative knowledge of the user's
  // redeemable shares. Without this, a failed read would silently fall back
  // to position.balanceNative (often underlying-denominated) and the amount
  // would be parsed in share-decimals — risking a wrong-sized redeem on
  // appreciated-share vaults.
  const [shareBalanceLoad, setShareBalanceLoad] = useState<
    "loading" | "loaded" | "failed"
  >("loading");
  // Bump to re-trigger the on-chain share-balance read when the user clicks
  // retry after a failed load.
  const [shareBalanceReloadKey, setShareBalanceReloadKey] = useState(0);

  const underlyingToken = useMemo<EarnToken>(
    () => ({
      address: position.asset.address,
      symbol: position.asset.symbol,
      name: position.asset.name,
      decimals: position.asset.decimals,
      chainId: position.chainId,
    }),
    [
      position.asset.address,
      position.asset.decimals,
      position.asset.name,
      position.asset.symbol,
      position.chainId,
    ],
  );

  const [destinationChainId, setDestinationChainId] = useState(position.chainId);
  const [destinationToken, setDestinationToken] = useState<EarnToken>(underlyingToken);
  const [redeemTxHash, setRedeemTxHash] = useState<string | null>(null);
  const [routeTxHash, setRouteTxHash] = useState<string | null>(null);
  const [routeTxChainId, setRouteTxChainId] = useState<number | null>(null);
  const [redeemedAmountRaw, setRedeemedAmountRaw] = useState<string | null>(null);
  const [routeMode, setRouteMode] = useState<RouteMode>("intent");
  const [routeOutcome, setRouteOutcome] = useState<RouteOutcome>(null);
  const [composerRouteState, setComposerRouteState] =
    useState<WithdrawComposerRouteState>({ phase: "idle" });

  const supportedChain = SUPPORTED_CHAINS.find((c) => c.id === position.chainId);

  useEffect(() => {
    let cancelled = false;
    setShareDecimals(position.asset.decimals);
    setShareBalanceRaw(null);

    (async () => {
      // Native-token "vaults" have no ERC-20 share to read — treat as
      // already-loaded so the form CTAs aren't permanently disabled. The UI
      // falls back to position.balanceNative which is correct for native.
      if (isNativeToken(vault.address)) {
        if (!cancelled) setShareBalanceLoad("loaded");
        return;
      }
      try {
        const decimals = await readTokenDecimalsOnChain(
          vault.address,
          position.chainId,
        );
        if (!cancelled && decimals != null) {
          setShareDecimals(decimals);
        }
      } catch {
        // Fall back to the Earn position asset decimals. Most redeemable
        // share tokens mirror the underlying, but we read decimals when the
        // RPC is available so the Composer redeem amount uses share units.
      }

      // Read on-chain share balance so MAX + the displayed available figure
      // reflect actual redeemable shares, not the Earn API's underlying-
      // denominated balanceNative (which mis-sizes for appreciated vaults).
      if (!address) {
        if (!cancelled) setShareBalanceLoad("loading");
        return;
      }
      if (!cancelled) setShareBalanceLoad("loading");
      try {
        const bal = await readTokenBalanceOnChain(
          vault.address,
          address,
          position.chainId,
        );
        if (!cancelled) {
          setShareBalanceRaw(bal);
          setShareBalanceLoad("loaded");
        }
      } catch {
        if (!cancelled) setShareBalanceLoad("failed");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    position.asset.decimals,
    position.chainId,
    vault.address,
    address,
    shareBalanceReloadKey,
  ]);

  useEffect(() => {
    setDestinationChainId(position.chainId);
    setDestinationToken(underlyingToken);
    setTxHash(null);
    setRedeemTxHash(null);
    setRouteTxHash(null);
    setRouteTxChainId(null);
    setRedeemedAmountRaw(null);
    setRouteMode("intent");
    setRouteOutcome(null);
    setComposerRouteState({ phase: "idle" });
  }, [position.chainId, underlyingToken]);

  const positionTotal = useMemo(() => {
    try {
      const n = parseFloat(position.balanceNative);
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, [position.balanceNative]);

  // Composer's redeem flow uses `fromToken = vault.share`, so it expects
  // `fromAmount` in SHARE-token decimals. We parse with shareDecimals to
  // match that wire format. Note: the UI label still shows the underlying
  // symbol (position.asset.symbol) because Earn surfaces position size in
  // underlying terms; for vaults where 1 share ≈ 1 underlying (most stables)
  // this is harmless, but for appreciated-share vaults the user's number
  // will be interpreted as shares-not-underlying. Honest follow-up: convert
  // via the live exchange rate, or relabel the input "shares".
  const fromAmountForQuote = useMemo(() => {
    if (!amount) return null;
    try {
      const parsed = ethers.utils.parseUnits(amount, shareDecimals);
      if (parsed.isZero()) return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }, [amount, shareDecimals]);

  const insufficientBalance = useMemo(() => {
    if (!amount) return false;
    // Prefer the on-chain share balance check when we have it — that's the
    // value Composer will actually try to redeem against. Fall back to the
    // Earn API's positionTotal (which may be in underlying units) only when
    // the on-chain read hasn't completed.
    if (shareBalanceRaw) {
      try {
        const parsed = ethers.utils.parseUnits(amount, shareDecimals);
        return parsed.gt(shareBalanceRaw);
      } catch {
        return false;
      }
    }
    if (!positionTotal) return false;
    const n = parseFloat(amount);
    return Number.isFinite(n) && n > positionTotal;
  }, [amount, positionTotal, shareBalanceRaw, shareDecimals]);

  const destinationChainOptions = useMemo(
    () =>
      SUPPORTED_CHAINS.filter(
        (chain) => getDestinationTokenOptions(chain.id).length > 0,
      ),
    [],
  );

  const destinationTokenOptions = useMemo(
    () =>
      mergeDestinationTokens(
        destinationChainId === position.chainId ? [underlyingToken] : [],
        getDestinationTokenOptions(destinationChainId),
      ),
    [destinationChainId, position.chainId, underlyingToken],
  );

  const routeRequired = useMemo(
    () =>
      destinationChainId !== position.chainId ||
      !sameTokenAddress(destinationToken.address, underlyingToken.address),
    [
      destinationChainId,
      destinationToken.address,
      position.chainId,
      underlyingToken.address,
    ],
  );

  useEffect(() => {
    if (
      destinationTokenOptions.some(
        (token) => destinationTokenKey(token) === destinationTokenKey(destinationToken),
      )
    ) {
      return;
    }
    if (destinationTokenOptions[0]) {
      setDestinationToken(destinationTokenOptions[0]);
    }
  }, [destinationToken, destinationTokenOptions]);

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

  // `inShareMode` is the authoritative "we read share balance successfully"
  // signal — use this, not `shareBalanceDisplay`, as the gate for share-mode
  // UI. A zero share balance still means we're in share mode (we just have
  // nothing to redeem); a null shareBalanceRaw means the read is pending or
  // failed and we should fall back to underlying-mode rendering.
  const inShareMode = shareBalanceRaw !== null;

  // Authoritative display of redeemable shares from the on-chain balanceOf.
  // Returns null when the value would be sub-display, but DO NOT use this
  // as the share-mode sentinel (use `inShareMode` instead).
  const shareBalanceDisplay = useMemo(() => {
    if (!shareBalanceRaw) return null;
    try {
      const formatted = parseFloat(
        ethers.utils.formatUnits(shareBalanceRaw, shareDecimals),
      );
      if (!Number.isFinite(formatted) || formatted <= 0) return null;
      if (formatted < 0.0001) return "<0.0001";
      return formatted.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 6,
      });
    } catch {
      return null;
    }
  }, [shareBalanceRaw, shareDecimals]);

  // String form of the share balance for MAX — must use the same decimals
  // we'll parse with so MAX → parseUnits(_, shareDecimals) round-trips.
  const shareBalanceForMax = useMemo(() => {
    if (!shareBalanceRaw) return null;
    try {
      return ethers.utils.formatUnits(shareBalanceRaw, shareDecimals);
    } catch {
      return null;
    }
  }, [shareBalanceRaw, shareDecimals]);

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
      decimals: shareDecimals,
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
  }, [vault, position, quote, shareDecimals]);

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
          decimals: shareDecimals,
        });
      } catch {
        /* non-fatal */
      }
    }

    return [...perToken.values()]
      .filter((e) => e.delta !== 0n)
      .sort((a, b) => (a.delta > b.delta ? -1 : 1));
  }, [simResult, address, vault, fromAmountForQuote, position, resolveMovementToken, shareDecimals]);

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

  function resetRouteState(nextState: WithdrawState = "idle") {
    setFlowState(nextState);
    setErrorMsg(null);
    setSimResult(null);
    setTxHash(null);
    setRedeemTxHash(null);
    setRouteTxHash(null);
    setRouteTxChainId(null);
    setRedeemedAmountRaw(null);
    setRouteOutcome(null);
    setComposerRouteState({ phase: "idle" });
  }

  function handleDestinationChainChange(value: string) {
    const nextChainId = Number(value);
    if (!Number.isFinite(nextChainId)) return;
    const sameChainToken =
      nextChainId === position.chainId ? underlyingToken : undefined;
    setDestinationChainId(nextChainId);
    setDestinationToken(
      pickDefaultDestinationToken({
        chainId: nextChainId,
        sourceSymbol: position.asset.symbol,
        sameChainToken,
      }),
    );
    setRouteMode("intent");
    resetRouteState();
  }

  function handleDestinationTokenChange(value: string) {
    const next = destinationTokenOptions.find(
      (token) => destinationTokenKey(token) === value,
    );
    if (!next) return;
    setDestinationToken(next);
    setRouteMode("intent");
    resetRouteState();
  }

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
    if (!quote || !address || !fromAmountForQuote) return;

    setFlowState("redeem-approving");
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

      await safeApproveErc20({
        wagmiConfig,
        walletClient,
        token: tokenAddr,
        spender,
        amount: BigInt(fromAmountForQuote),
        owner: address as Address,
        chainId: position.chainId,
      });

      await refetchAllowance();
      setFlowState("idle");
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setFlowState("error");
    }
  }

  async function handleExecute() {
    if (!quote || !address) return;

    setFlowState("redeeming");
    setErrorMsg(null);

    let preRedeemUnderlyingBalance: ethers.BigNumber | null = null;

    try {
      if (routeRequired) {
        preRedeemUnderlyingBalance = await readTokenBalanceOnChain(
          underlyingToken.address,
          address,
          position.chainId,
        );
      }

      if (walletChain?.id !== position.chainId) {
        await switchChainAsync({ chainId: position.chainId });
      }

      const walletClient = await getWagmiWalletClient(wagmiConfig, {
        chainId: position.chainId,
      });

      if (!walletClient) {
        throw new Error("No wallet client available. Please connect your wallet.");
      }

      const hash = await walletClient.sendTransaction({
        to: quote.transactionRequest.to as `0x${string}`,
        data: quote.transactionRequest.data as `0x${string}`,
        value: quote.transactionRequest.value
          ? BigInt(quote.transactionRequest.value)
          : undefined,
        gas: quote.transactionRequest.gasLimit
          ? BigInt(quote.transactionRequest.gasLimit)
          : undefined,
        chain: { id: position.chainId } as any,
      });

      setTxHash(hash);
      setRedeemTxHash(hash);

      const receipt = await wagmiWaitForReceipt(wagmiConfig, {
        hash,
        chainId: position.chainId,
        timeout: 120_000,
      });

      if (receipt.status === "reverted") {
        throw new Error("Withdraw transaction reverted onchain");
      }

      if (!routeRequired) {
        setRouteOutcome("redeemed-only");
        setFlowState("done");
        onComplete?.();
        return;
      }
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setFlowState("error");
      return;
    }

    try {
      if (!preRedeemUnderlyingBalance) {
        throw new Error("Missing pre-redeem balance snapshot");
      }
      const postRedeemUnderlyingBalance = await readTokenBalanceOnChain(
        underlyingToken.address,
        address,
        position.chainId,
      );
      const delta = postRedeemUnderlyingBalance.sub(preRedeemUnderlyingBalance);
      if (delta.lte(0)) {
        throw new Error(
          "Withdrawal confirmed, but the redeemed balance delta is not visible yet. Keep the underlying or retry after the wallet balance updates.",
        );
      }

      setRedeemedAmountRaw(delta.toString());
      setRouteMode("intent");
      setComposerRouteState({ phase: "idle" });
      setFlowState("redeemed");
    } catch (err: unknown) {
      setErrorMsg(formatTxError(err));
      setFlowState("redeemed");
    }
  }

  async function handleComposerRoute() {
    if (!address || !redeemedAmountRaw) return;

    setRouteMode("composer");
    setErrorMsg(null);

    const lastFailedStateRef: {
      current: Extract<WithdrawComposerRouteState, { phase: "failed" }> | null;
    } = { current: null };

    try {
      await executeWithdrawComposerRoute({
        wagmiConfig,
        sourceChainId: position.chainId,
        sourceToken: underlyingToken,
        sourceAmountRaw: redeemedAmountRaw,
        destinationChainId,
        destinationToken,
        userAddress: address as Address,
        onStateChange: (state) => {
          if (state.phase === "failed") {
            lastFailedStateRef.current = state;
          }
          setComposerRouteState(state);
          if ("routeTxHash" in state && state.routeTxHash) {
            setRouteTxHash(state.routeTxHash);
            setRouteTxChainId(position.chainId);
            setTxHash(state.routeTxHash);
          }
          switch (state.phase) {
            case "route-quoting":
              setFlowState("route-quoting");
              break;
            case "composer-quoted":
            case "composer-approving":
              setFlowState("composer-quoted");
              break;
            case "composer-sending":
              setFlowState("composer-sending");
              break;
            case "composer-settling":
              setFlowState("composer-settling");
              break;
            case "done":
              setFlowState("done");
              setRouteOutcome("composer");
              break;
            case "failed":
              setFlowState(state.failedAfterBroadcast ? "error" : "redeemed");
              break;
            case "idle":
              break;
          }
        },
        switchChain: async (chainId) => {
          const current = wagmiGetAccount(wagmiConfig).chainId;
          if (current !== chainId) {
            await switchChainAsync({ chainId });
          }
        },
      });

      setRouteOutcome("composer");
      setFlowState("done");
      onComplete?.();
    } catch (err: unknown) {
      const failedState = lastFailedStateRef.current;
      if (failedState) {
        setErrorMsg(
          failedState.failedAfterBroadcast ? failedState.message : null,
        );
        setFlowState(
          failedState.failedAfterBroadcast ? "error" : "redeemed",
        );
      } else {
        setErrorMsg(formatTxError(err));
        setFlowState("redeemed");
      }
    }
  }

  const handleIntentStageChange = useCallback((stage: WithdrawIntentRouteStage) => {
    switch (stage) {
      case "quoting":
        setFlowState("route-quoting");
        break;
      case "quoted":
        setFlowState("intent-quoted");
        break;
      case "approving":
      case "signing":
      case "open":
      case "refunding":
        setFlowState("intent-open");
        break;
      case "delivered":
        setFlowState("intent-delivered");
        break;
      case "failed":
      case "refunded":
      case "idle":
        setFlowState("redeemed");
        break;
    }
  }, []);

  const handleIntentDelivered = useCallback(
    (details: { openTxHash?: Hex; destinationTxHash?: Hex }) => {
      setRouteTxHash(details.destinationTxHash ?? null);
      setRouteTxChainId(details.destinationTxHash ? destinationChainId : null);
      setRouteOutcome("intent");
      setFlowState("done");
      onComplete?.();
    },
    [destinationChainId, onComplete],
  );

  const handleKeepUnderlying = useCallback(() => {
    setRouteOutcome("kept-underlying");
    setFlowState("done");
    onComplete?.();
  }, [onComplete]);

  const isBusy =
    flowState === "redeem-approving" ||
    flowState === "redeeming" ||
    flowState === "simulating" ||
    flowState === "route-quoting" ||
    flowState === "composer-quoted" ||
    flowState === "composer-sending" ||
    flowState === "composer-settling" ||
    flowState === "intent-open";
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

      {flowState === "done" ? (
        <div className="space-y-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-2.5 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-emerald-500">
            <CheckCircle className="h-3.5 w-3.5" />
            {routeOutcome === "intent"
              ? "Withdrawal delivered"
              : routeOutcome === "composer"
                ? "Withdrawal routed"
                : routeOutcome === "kept-underlying"
                  ? "Underlying kept in wallet"
                  : "Withdrawal confirmed"}
          </div>
          {redeemTxHash && explorerUrl && (
            <a
              href={`${explorerUrl}/tx/${redeemTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              View redeem tx
            </a>
          )}
          {routeTxHash && routeOutcome !== "redeemed-only" && (
            <a
              href={`${chainExplorerUrl(routeTxChainId ?? destinationChainId) ?? explorerUrl}/tx/${routeTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-muted-foreground underline hover:text-foreground"
            >
              View route tx
            </a>
          )}
        </div>
      ) : (
        <>
          {shareBalanceLoad === "failed" && !isNativeToken(vault.address) && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-[11px] text-amber-400">
              <Warning className="mt-0.5 h-3 w-3 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <p>
                  Couldn’t read your on-chain vault share balance. Withdraw is
                  blocked — without it we can’t safely size the redeem on
                  appreciated-share vaults.
                </p>
                <button
                  type="button"
                  onClick={() => setShareBalanceReloadKey((k) => k + 1)}
                  className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-500/20"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-muted-foreground">
                Amount{" "}
                {inShareMode && (
                  <span className="text-muted-foreground/60">(in vault shares)</span>
                )}
              </label>
              {(inShareMode || balanceDisplay) && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>Available:</span>
                  <>
                    <span className="font-mono tabular-nums text-foreground/80">
                      {inShareMode
                        ? `${shareBalanceDisplay ?? "0"} shares`
                        : `${balanceDisplay} ${position.asset.symbol}`}
                    </span>
                    {balanceDisplay && inShareMode && (
                      <span className="text-muted-foreground/60">
                        ≈ {balanceDisplay} {position.asset.symbol}
                      </span>
                    )}
                    <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setAmount(shareBalanceForMax ?? position.balanceNative);
                          resetRouteState();
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
                className={`h-9 text-sm pr-20 ${
                  insufficientBalance
                    ? "border-destructive/60 focus-visible:ring-destructive/30"
                    : ""
                }`}
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  resetRouteState();
                }}
                disabled={isBusy}
                type="number"
                min="0"
                step="any"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                {inShareMode ? "shares" : position.asset.symbol}
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
                      // Prefer share-honest percentages — bps math against
                      // the on-chain share balance avoids float drift.
                      if (shareBalanceRaw) {
                        const bps = ethers.BigNumber.from(pct * 100);
                        const part = shareBalanceRaw.mul(bps).div(10_000);
                        setAmount(ethers.utils.formatUnits(part, shareDecimals));
                      } else {
                        const val = ((positionTotal ?? 0) * pct) / 100;
                        const decimals = position.asset.decimals;
                        const display = decimals > 6 ? 6 : decimals;
                        setAmount(val.toFixed(display));
                      }
                      resetRouteState();
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
                    setAmount(shareBalanceForMax ?? position.balanceNative);
                    resetRouteState();
                  }}
                  className="flex-1 rounded border border-border/40 bg-muted/30 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
                >
                  MAX
                </button>
              </div>
            )}
          </div>

          <div className="space-y-1 rounded-md border border-border/40 bg-background/30 p-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-muted-foreground">Receive</label>
              <span className="text-[10px] text-muted-foreground/70">
                {routeRequired ? "Route after redeem" : "Same-chain redeem"}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select
                value={String(destinationChainId)}
                onValueChange={handleDestinationChainChange}
                disabled={isBusy || !!redeemedAmountRaw}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinationChainOptions.map((chain) => (
                    <SelectItem key={chain.id} value={String(chain.id)}>
                      {chain.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={destinationTokenKey(destinationToken)}
                onValueChange={handleDestinationTokenChange}
                disabled={isBusy || !!redeemedAmountRaw}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {destinationTokenOptions.map((token) => (
                    <SelectItem
                      key={destinationTokenKey(token)}
                      value={destinationTokenKey(token)}
                    >
                      <DestinationTokenSelectRow
                        token={token}
                        chainId={destinationChainId}
                        ownerAddress={address ?? null}
                      />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {amount && fromAmountForQuote && (
            <div className="text-xs space-y-1">
              {quoteLoading && (
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <CircleNotch className="h-3 w-3 animate-spin" />
                  Fetching redeem quote…
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
                        {routeRequired ? "Redeem receives" : "You receive"}
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

          {routeRequired && (redeemedAmountRaw || flowState === "redeemed") && (
            <div className="space-y-2 rounded-md border border-border/40 bg-background/30 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-medium text-foreground">Redeem confirmed</p>
                  <p className="text-muted-foreground">
                    Route the actual redeemed balance delta to{" "}
                    {destinationToken.symbol} on {chainName(destinationChainId)}.
                  </p>
                </div>
                {redeemedAmountRaw && (
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[11px] text-emerald-400">
                    {formatRawAmount(redeemedAmountRaw, underlyingToken.decimals)}{" "}
                    {underlyingToken.symbol}
                  </span>
                )}
              </div>

              {!redeemedAmountRaw ? (
                <div className="space-y-2 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-2 text-xs text-yellow-500">
                  <p>
                    The redeem transaction succeeded, but the post-redeem
                    balance delta could not be measured safely.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={handleKeepUnderlying}
                  >
                    Keep underlying
                  </Button>
                </div>
              ) : routeMode === "intent" ? (
                <WithdrawIntentRouteStep
                  sourceChainId={position.chainId}
                  sourceToken={underlyingToken}
                  sourceAmountRaw={redeemedAmountRaw}
                  destinationChainId={destinationChainId}
                  destinationToken={destinationToken}
                  recipient={address as Address | undefined}
                  onStageChange={handleIntentStageChange}
                  onDelivered={handleIntentDelivered}
                  onFallbackToComposer={() => {
                    setRouteMode("composer");
                    setFlowState("redeemed");
                    setComposerRouteState({ phase: "idle" });
                  }}
                  onKeepUnderlying={handleKeepUnderlying}
                  onRefunded={() => setFlowState("redeemed")}
                />
              ) : (
                <ComposerWithdrawRoutePanel
                  state={composerRouteState}
                  sourceChainId={position.chainId}
                  destinationChainId={destinationChainId}
                  sourceToken={underlyingToken}
                  destinationToken={destinationToken}
                  onStart={handleComposerRoute}
                  onTryIntent={() => {
                    setRouteMode("intent");
                    setComposerRouteState({ phase: "idle" });
                    setFlowState("redeemed");
                  }}
                  onKeepUnderlying={handleKeepUnderlying}
                />
              )}
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <XCircle className="h-3 w-3 shrink-0" />
              {errorMsg}
            </div>
          )}

          {!(routeRequired && (redeemedAmountRaw || flowState === "redeemed")) && (
          <div className="flex flex-col items-center gap-2">
            {!simResult?.success && (
              <div className="flex items-center gap-3 rounded-md border border-border/40 bg-background/30 px-3 py-1.5">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground select-none">
                  <Switch
                    checked={simulateFirst}
                    onCheckedChange={setSimulateFirst}
                    disabled={isBusy}
                  />
                  Simulate first
                </label>
                <span className="text-muted-foreground/30 text-xs">·</span>
                <EdbBadge className="opacity-70 transition-opacity hover:opacity-100" />
              </div>
            )}

            {needsApproval ? (
              <Button
                variant="outline"
                className="h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20"
                disabled={
                  isBusy ||
                  !quote ||
                  quoteLoading ||
                  quoteError ||
                  insufficientBalance ||
                  !fromAmountForQuote ||
                  shareBalanceLoad !== "loaded"
                }
                onClick={handleApprove}
              >
                {flowState === "redeem-approving" ? (
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
                  !fromAmountForQuote ||
                  shareBalanceLoad !== "loaded"
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
                variant="outline"
                className="h-8 w-full border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20"
                disabled={
                  isBusy ||
                  !quote ||
                  quoteLoading ||
                  quoteError ||
                  insufficientBalance ||
                  !fromAmountForQuote ||
                  shareBalanceLoad !== "loaded"
                }
                onClick={handleExecute}
              >
                {flowState === "redeeming" ? (
                  <span className="flex items-center gap-1.5">
                    <CircleNotch className="h-3 w-3 animate-spin" />
                    Withdrawing…
                  </span>
                ) : (
                  routeRequired ? "Withdraw, then route" : "Withdraw"
                )}
              </Button>
            )}
          </div>
          )}
        </>
      )}
    </div>
  );
}

function mergeDestinationTokens(...groups: EarnToken[][]): EarnToken[] {
  const seen = new Set<string>();
  const merged: EarnToken[] = [];
  for (const group of groups) {
    for (const token of group) {
      const key = destinationTokenKey(token);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(token);
    }
  }
  return merged;
}

function sameTokenAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function chainName(chainId: number): string {
  return (
    SUPPORTED_CHAINS.find((c) => c.id === chainId)?.name ??
    CHAIN_REGISTRY.find((c) => c.id === chainId)?.name ??
    `chain ${chainId}`
  );
}

function chainExplorerUrl(chainId: number): string | null {
  return (
    SUPPORTED_CHAINS.find((c) => c.id === chainId)?.explorerUrl ??
    CHAIN_REGISTRY.find((c) => c.id === chainId)?.explorerUrl ??
    null
  );
}

function rpcProviderForChain(
  chainId: number,
): ethers.providers.StaticJsonRpcProvider | null {
  const chain = SUPPORTED_CHAINS.find((c) => c.id === chainId);
  if (!chain) return null;
  const resolution = networkConfigManager.resolveRpcUrl(chainId, chain.rpcUrl);
  if (!resolution.url) return null;
  return new ethers.providers.StaticJsonRpcProvider(resolution.url, chainId);
}

async function readTokenBalanceOnChain(
  tokenAddress: string,
  owner: string,
  chainId: number,
): Promise<ethers.BigNumber> {
  const provider = rpcProviderForChain(chainId);
  if (!provider) {
    throw new Error(`No RPC available for ${chainName(chainId)}`);
  }
  if (isNativeToken(tokenAddress)) {
    return provider.getBalance(owner);
  }
  const token = new ethers.Contract(tokenAddress, ERC20_READ_ABI, provider);
  return token.balanceOf(owner);
}

async function readTokenDecimalsOnChain(
  tokenAddress: string,
  chainId: number,
): Promise<number | null> {
  if (isNativeToken(tokenAddress)) {
    return (
      CHAIN_REGISTRY.find((c) => c.id === chainId)?.nativeCurrency?.decimals ??
      18
    );
  }
  const provider = rpcProviderForChain(chainId);
  if (!provider) return null;
  const token = new ethers.Contract(tokenAddress, ERC20_READ_ABI, provider);
  const decimals = await token.decimals();
  return Number(decimals);
}

function formatRawAmount(raw: string, decimals: number): string {
  try {
    const num = parseFloat(ethers.utils.formatUnits(raw, decimals));
    if (!Number.isFinite(num)) return raw;
    if (num > 0 && num < 0.0001) return "<0.0001";
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 6,
    });
  } catch {
    return raw;
  }
}

function DestinationTokenSelectRow({
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

  let displayBalance: string | null = null;
  if (rawBalance) {
    const n = parseFloat(ethers.utils.formatUnits(rawBalance, token.decimals));
    if (Number.isFinite(n) && n > 0) {
      displayBalance =
        n < 0.0001
          ? "<0.0001"
          : n < 1
            ? n.toPrecision(4)
            : n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
  }

  return (
    <span className="flex w-full items-center gap-2">
      <TokenIcon
        token={{
          address: token.address,
          symbol: token.symbol,
          logoURI: token.logoURI,
        }}
        chainId={chainId}
        className="h-4 w-4 shrink-0 rounded-full"
      />
      <span className="flex-1 truncate">
        {token.symbol}
        <span className="ml-1 text-[10px] text-muted-foreground/70">
          on {chainName(chainId)}
        </span>
      </span>
      {displayBalance && (
        <span className="text-[10px] text-muted-foreground">{displayBalance}</span>
      )}
    </span>
  );
}

function ComposerWithdrawRoutePanel({
  state,
  sourceChainId,
  destinationChainId,
  sourceToken,
  destinationToken,
  onStart,
  onTryIntent,
  onKeepUnderlying,
}: {
  state: WithdrawComposerRouteState;
  sourceChainId: number;
  destinationChainId: number;
  sourceToken: EarnToken;
  destinationToken: EarnToken;
  onStart: () => void;
  onTryIntent: () => void;
  onKeepUnderlying: () => void;
}) {
  const inFlight =
    state.phase !== "idle" &&
    state.phase !== "done" &&
    state.phase !== "failed";
  const routeTxHash = "routeTxHash" in state ? state.routeTxHash : undefined;
  const destinationTxHash =
    state.phase === "done" ? state.destinationTxHash : undefined;
  const sourceExplorer = chainExplorerUrl(sourceChainId);
  const destinationExplorer = chainExplorerUrl(destinationChainId);

  return (
    <div className="space-y-2 rounded-md border border-border/40 bg-background/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">Composer route</span>
        <span className="text-muted-foreground">
          {sourceToken.symbol} on {chainName(sourceChainId)} →{" "}
          {destinationToken.symbol} on {chainName(destinationChainId)}
        </span>
      </div>

      {state.phase !== "idle" && (
        <div className="rounded-md border border-border/30 bg-muted/10 p-2 text-xs">
          <div className="flex items-center gap-1.5">
            {state.phase === "done" ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            ) : state.phase === "failed" ? (
              <XCircle className="h-3.5 w-3.5 text-destructive" />
            ) : (
              <CircleNotch className="h-3.5 w-3.5 animate-spin text-emerald-500" />
            )}
            <span className="font-medium">
              {composerRoutePhaseLabel(state)}
            </span>
          </div>
          {state.phase === "composer-settling" && state.lifiStatus && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              LI.FI status: {state.lifiStatus}
              {state.lifiSubstatus ? ` · ${state.lifiSubstatus}` : ""}
            </p>
          )}
          {routeTxHash && sourceExplorer && (
            <a
              href={`${sourceExplorer}/tx/${routeTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Source tx {shortAddress(routeTxHash)}
            </a>
          )}
          {destinationTxHash && destinationExplorer && destinationTxHash !== routeTxHash && (
            <a
              href={`${destinationExplorer}/tx/${destinationTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-2 mt-1 inline-block text-[11px] text-muted-foreground underline hover:text-foreground"
            >
              Destination tx {shortAddress(destinationTxHash)}
            </a>
          )}
        </div>
      )}

      {state.phase === "failed" && (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
          <p className="flex items-start gap-1.5 text-destructive">
            <XCircle className="h-3 w-3 shrink-0 translate-y-[1px]" />
            <span className="break-words">
              {state.message}
              {(state.lifiStatus || state.lifiSubstatus) && (
                <span className="mt-1 block text-muted-foreground">
                  LI.FI status: {state.lifiStatus ?? "unknown"}
                  {state.lifiSubstatus ? ` · ${state.lifiSubstatus}` : ""}
                </span>
              )}
              {state.failedAfterBroadcast ? (
                <span className="mt-1 block text-muted-foreground">
                  The route was broadcast. Review the LI.FI status and explorer
                  link before retrying manually.
                </span>
              ) : (
                <span className="mt-1 block text-muted-foreground">
                  The route was not broadcast; the redeemed underlying remains
                  in your wallet.
                </span>
              )}
            </span>
          </p>
          {!state.failedAfterBroadcast && (
            <div className="grid gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20"
                onClick={onStart}
              >
                Retry route
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onTryIntent}
              >
                Try Intent route
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onKeepUnderlying}
              >
                Keep underlying
              </Button>
            </div>
          )}
        </div>
      )}

      {(state.phase === "idle" || state.phase === "done") && (
        <div className="grid gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/20"
            disabled={state.phase === "done"}
            onClick={onStart}
          >
            {state.phase === "done" ? "Route complete" : "Route via Composer"}
          </Button>
          {state.phase === "idle" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onKeepUnderlying}
            >
              Keep underlying
            </Button>
          )}
        </div>
      )}

      {inFlight && (
        <Button variant="outline" size="sm" disabled className="h-8 w-full text-xs">
          <CircleNotch className="mr-1.5 h-3 w-3 animate-spin" />
          {composerRoutePhaseLabel(state)}
        </Button>
      )}
    </div>
  );
}

function composerRoutePhaseLabel(state: WithdrawComposerRouteState): string {
  switch (state.phase) {
    case "route-quoting":
      return "Fetching route quote…";
    case "composer-quoted":
      return "Route quoted";
    case "composer-approving":
      return "Approving route…";
    case "composer-sending":
      return "Confirm route in wallet…";
    case "composer-settling":
      return "Waiting for LI.FI delivery…";
    case "done":
      return "Route delivered";
    case "failed":
      return "Route failed";
    case "idle":
      return "Ready";
  }
}
