import { useCallback, useEffect, useRef, useState } from "react";
import {
  getWalletClient as getWagmiWalletClient,
  readContract as wagmiReadContract,
  waitForTransactionReceipt as wagmiWaitForReceipt,
  switchChain as wagmiSwitchChain,
  getAccount as wagmiGetAccount,
} from "@wagmi/core";
import {
  encodeFunctionData,
  parseAbi,
  type Address,
  type Hex,
} from "viem";
import { useConfig } from "wagmi";
import {
  requestIntentQuote,
  readQuoteOutputAmount,
  type IntentQuote,
} from "../../intentsApi";
import { fetchComposerQuote } from "../../earnApi";
import { encodeEip7930EvmAddress } from "../../../../../lib/intents/eip7930";
import {
  buildDeadlinePlan,
  assertFillWindowOpen,
} from "../../../../../lib/intents/deadlines";
import { nextOrderNonce } from "../../../../../lib/intents/nonce";
import {
  buildStandardOrder,
  orderForAbi,
  type StandardOrder,
} from "../../../../../lib/intents/standardOrder";
import {
  INPUT_SETTLER_ESCROW,
  extractOpenOrderId,
  inputSettlerEscrowAbi,
} from "../../../../../lib/intents/contracts";
import { safeApproveErc20, formatTxError } from "../../txUtils";
import type { IntentLegSpec } from "./intentLegs";

// Quote requests fan out in parallel; on-chain open() runs sequentially —
// concurrent wallet prompts are unusable.
//
// `deposit-*` states cover the post-delivery same-chain Composer deposit
// that lands the underlying into the vault — Intents deliver an ERC-20 to
// the user's wallet, the deposit is a separate signature.
export type LegRunStatus =
  | "planned"
  | "degraded"
  | "quoting"
  | "quoted"
  | "approving"
  | "signing"
  | "open"
  | "deposit-quoting"
  | "deposit-approving"
  | "deposit-signing"
  | "deposit-done"
  | "deposit-failed"
  | "failed"
  | "refunding"
  | "refunded";

export interface IntentLegRun {
  spec: IntentLegSpec;
  status: LegRunStatus;
  quote?: IntentQuote;
  order?: StandardOrder;
  /** `Open(orderId)` event topic[1] from the open() receipt. */
  orderId?: Hex;
  openTxHash?: Hex;
  refundTxHash?: Hex;
  /** On-chain destination underlying balance captured right before open(). */
  predeliveryBalance?: bigint;
  /** Solver-delivered amount, measured as post-delivery balance delta. */
  deliveredAmount?: bigint;
  depositTxHash?: Hex;
  depositError?: string;
  error?: string;
}

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
]);

interface UseIntentLegPipelineReturn {
  runs: IntentLegRun[];
  quoteAll: (specs: IntentLegSpec[]) => Promise<void>;
  openAll: () => Promise<void>;
  retryLeg: (id: string) => Promise<void>;
  refundLeg: (id: string) => Promise<void>;
  depositLeg: (id: string) => Promise<void>;
  /** Lets RebalancePlanCard mark a leg as delivered once the timeline says so. */
  markLegDelivered: (id: string, deliveredAmount: bigint) => void;
  reset: () => void;
}

export function useIntentLegPipeline(): UseIntentLegPipelineReturn {
  const config = useConfig();
  const [runs, setRuns] = useState<IntentLegRun[]>([]);

  // Mirror state into a ref so async sequences (quoteAll / openAll) can read
  // the latest snapshot without re-binding callbacks on every render.
  const runsRef = useRef<IntentLegRun[]>(runs);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  const patch = useCallback(
    (id: string, patch: Partial<IntentLegRun>) =>
      setRuns((prev) =>
        prev.map((r) => (r.spec.id === id ? { ...r, ...patch } : r)),
      ),
    [],
  );

  const quoteOne = useCallback(
    async (run: IntentLegRun, walletAddress: Address): Promise<IntentLegRun> => {
      if (run.status === "degraded") return run;
      const { spec } = run;
      try {
        const userEip7930 = encodeEip7930EvmAddress(
          spec.source.chainId,
          walletAddress,
        );
        const fromAssetEip7930 = encodeEip7930EvmAddress(
          spec.source.chainId,
          spec.source.token as Address,
        );
        const toAssetEip7930 = encodeEip7930EvmAddress(
          spec.destination.chainId,
          spec.destination.outputToken,
        );
        const receiverEip7930 = encodeEip7930EvmAddress(
          spec.destination.chainId,
          spec.destination.recipient,
        );

        const quoteRes = await requestIntentQuote({
          user: userEip7930,
          intent: {
            intentType: "oif-swap",
            inputs: [
              {
                user: userEip7930,
                asset: fromAssetEip7930,
                amount: spec.source.amountRaw,
              },
            ],
            outputs: [
              { receiver: receiverEip7930, asset: toAssetEip7930, amount: null },
            ],
            swapType: "exact-input",
          },
          supportedTypes: ["oif-escrow-v0"],
        });

        const quote = quoteRes.quotes?.[0];
        if (!quote) {
          return { ...run, status: "failed", error: "No quote returned" };
        }

        const previewAmount = readQuoteOutputAmount(quote);
        if (previewAmount === null) {
          return {
            ...run,
            status: "failed",
            error: "Quote returned no usable output amount",
          };
        }

        const deadlines = buildDeadlinePlan({
          quoteValidUntil: quote.validUntil ?? null,
        });

        const order = buildStandardOrder({
          user: walletAddress,
          nonce: nextOrderNonce(),
          originChainId: spec.source.chainId,
          inputToken: spec.source.token as Address,
          inputAmount: BigInt(spec.source.amountRaw),
          targetChainId: spec.destination.chainId,
          outputToken: spec.destination.outputToken,
          outputAmount: previewAmount,
          recipient: spec.destination.recipient,
          expires: deadlines.expires,
          fillDeadline: deadlines.fillDeadline,
          context: (quote.context as Hex | undefined) ?? "0x",
        });

        return { ...run, status: "quoted", quote, order };
      } catch (err) {
        return {
          ...run,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    [],
  );

  const quoteAll = useCallback(
    async (specs: IntentLegSpec[]) => {
      const seeded: IntentLegRun[] = specs.map((spec) => ({
        spec,
        status: spec.status === "degraded" ? "degraded" : "quoting",
      }));
      setRuns(seeded);

      const account = wagmiGetAccount(config);
      const walletAddress = account.address as Address | undefined;
      if (!walletAddress) {
        setRuns(
          seeded.map((r) =>
            r.status === "quoting"
              ? { ...r, status: "failed", error: "Wallet not connected" }
              : r,
          ),
        );
        return;
      }

      const next = await Promise.all(
        seeded.map((r) =>
          r.status === "quoting"
            ? quoteOne(r, walletAddress)
            : Promise.resolve(r),
        ),
      );
      setRuns(next);
    },
    [config, quoteOne],
  );

  const openOne = useCallback(
    async (run: IntentLegRun): Promise<IntentLegRun> => {
      if (!run.order) return run;
      const chainId = run.spec.source.chainId;
      // Held outside the try so a receipt-wait timeout still reports the
      // broadcast hash instead of losing the escrow.
      let broadcastHash: Hex | undefined;

      try {
        const currentChain = wagmiGetAccount(config).chainId;
        if (currentChain !== chainId) {
          await wagmiSwitchChain(config, { chainId });
        }

        const walletClient = await getWagmiWalletClient(config, { chainId });
        if (!walletClient) throw new Error("No wallet client for source chain");
        const walletAddress = walletClient.account.address as Address;

        // open() collects from msg.sender but delivers and refunds to
        // order.user. If they diverge, the signer funds someone else's order.
        if (walletAddress.toLowerCase() !== run.order.user.toLowerCase()) {
          throw new Error(
            "The connected account changed after this quote was built — re-quote this leg before opening it.",
          );
        }

        assertFillWindowOpen(run.order.fillDeadline);

        // Snapshot destination-chain balance of the underlying so the
        // post-delivery deposit step can use the actual delta. CRITICAL:
        // a failed read must HARD-FAIL — otherwise the post-fill delta
        // calculation can't distinguish solver-delivered tokens from the
        // user's pre-existing balance, and we'd deposit unrelated funds.
        let predeliveryBalance: bigint;
        try {
          predeliveryBalance = (await wagmiReadContract(config, {
            address: run.spec.destination.outputToken,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [run.spec.destination.recipient],
            chainId: run.spec.destination.chainId,
          })) as bigint;
        } catch {
          throw new Error(
            "Couldn't read destination balance before opening the order — refusing to proceed (would risk depositing unrelated funds). Try again in a moment.",
          );
        }

        const tokenAddr = run.spec.source.token as Address;
        const amount = BigInt(run.spec.source.amountRaw);

        patch(run.spec.id, { status: "approving" });
        await safeApproveErc20({
          wagmiConfig: config,
          walletClient,
          token: tokenAddr,
          spender: INPUT_SETTLER_ESCROW,
          amount,
          owner: walletAddress,
          chainId,
        });

        patch(run.spec.id, { status: "signing" });
        const openData = encodeFunctionData({
          abi: inputSettlerEscrowAbi,
          functionName: "open",
          args: [orderForAbi(run.order)],
        });
        const openHash = await walletClient.sendTransaction({
          to: INPUT_SETTLER_ESCROW,
          data: openData,
        });
        broadcastHash = openHash;
        const receipt = await wagmiWaitForReceipt(config, {
          hash: openHash,
          chainId,
          timeout: 120_000,
        });
        if (receipt.status === "reverted") {
          throw new Error("open() reverted on-chain");
        }

        const orderId = extractOpenOrderId(receipt.logs);
        if (!orderId) {
          // Without an orderId we can't poll status; fail loudly so the user
          // sees the open tx landed but tracking is broken.
          return {
            ...run,
            status: "failed",
            openTxHash: openHash,
            error:
              "open() succeeded but Open(orderId) event could not be decoded — escrow ABI may have changed",
          };
        }

        return {
          ...run,
          status: "open",
          openTxHash: openHash,
          orderId,
          predeliveryBalance,
        };
      } catch (err) {
        return {
          ...run,
          status: "failed",
          openTxHash: broadcastHash ?? run.openTxHash,
          error: formatTxError(err),
        };
      }
    },
    [config, patch],
  );

  const openAll = useCallback(async () => {
    const ids = runs.filter((r) => r.status === "quoted").map((r) => r.spec.id);
    for (const id of ids) {
      const current = runsRef.current.find((r) => r.spec.id === id);
      if (!current) continue;
      const next = await openOne(current);
      setRuns((prev) =>
        prev.map((r) => (r.spec.id === id ? next : r)),
      );
    }
  }, [openOne, runs]);

  const retryLeg = useCallback(
    async (id: string) => {
      const account = wagmiGetAccount(config);
      const walletAddress = account.address as Address | undefined;
      if (!walletAddress) return;
      const current = runsRef.current.find((r) => r.spec.id === id);
      if (!current) return;
      // A broadcast open() may still mine after its receipt wait timed out.
      // Re-quoting mints a fresh nonce, so both orders could fill.
      if (current.openTxHash) {
        patch(id, {
          error:
            "An order was already broadcast for this leg. Check that transaction before retrying — opening again could escrow your funds twice.",
        });
        return;
      }
      patch(id, { status: "quoting", error: undefined });
      const next = await quoteOne(
        { ...current, status: "quoting" },
        walletAddress,
      );
      setRuns((prev) => prev.map((r) => (r.spec.id === id ? next : r)));
    },
    [config, patch, quoteOne],
  );

  const refundLeg = useCallback(
    async (id: string) => {
      const current = runsRef.current.find((r) => r.spec.id === id);
      if (!current?.order) return;
      const chainId = current.spec.source.chainId;
      try {
        patch(id, { status: "refunding" });
        const currentChain = wagmiGetAccount(config).chainId;
        if (currentChain !== chainId) {
          await wagmiSwitchChain(config, { chainId });
        }
        const walletClient = await getWagmiWalletClient(config, { chainId });
        if (!walletClient) throw new Error("No wallet client for source chain");
        const data = encodeFunctionData({
          abi: inputSettlerEscrowAbi,
          functionName: "refund",
          args: [orderForAbi(current.order)],
        });
        const hash = await walletClient.sendTransaction({
          to: INPUT_SETTLER_ESCROW,
          data,
        });
        const receipt = await wagmiWaitForReceipt(config, {
          hash,
          chainId,
          timeout: 120_000,
        });
        // wagmiWaitForReceipt resolves on reverted txs — without this check
        // the rebalance plan would mark the leg refunded even though the
        // escrow is still open.
        if (receipt.status === "reverted") {
          throw new Error(`refund() reverted: ${hash}`);
        }
        patch(id, { status: "refunded", refundTxHash: hash });
      } catch (err) {
        patch(id, {
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [config, patch],
  );

  // Called by RebalancePlanCard once it observes Delivered/Settled on the
  // status poll. We read the on-chain balance delta here (not the quote
  // preview) because solver fill quality varies.
  const markLegDelivered = useCallback(
    (id: string, deliveredAmount: bigint) => {
      setRuns((prev) =>
        prev.map((r) =>
          r.spec.id === id && r.status === "open"
            ? { ...r, deliveredAmount }
            : r,
        ),
      );
    },
    [],
  );

  // Cross-callback gate: prevent two clicks (or a stale React re-render
  // letting two buttons stay enabled briefly) from kicking off two
  // simultaneous wallet prompts for the same leg or two different legs.
  const depositInFlight = useRef<Set<string>>(new Set());

  const depositLeg = useCallback(
    async (id: string) => {
      if (depositInFlight.current.size > 0) return;
      const current = runsRef.current.find((r) => r.spec.id === id);
      if (!current) return;
      if (
        current.status !== "open" &&
        current.status !== "deposit-failed"
      ) {
        return;
      }
      depositInFlight.current.add(id);
      // Outer try/finally covers EVERY exit path below — including the silent
      // early returns during balance-delta validation (`predeliveryBalance`
      // missing, zero delta, post-balance read failure, etc). Without it,
      // those returns leave the lock set forever and depositInFlight.size>0
      // permanently blocks all future deposit attempts (the global gate at
      // the top of this callback).
      try {
        const chainId = current.spec.destination.chainId;
        const outputToken = current.spec.destination.outputToken;
        const vault = current.spec.destination.vault;
        const recipient = current.spec.destination.recipient;

        // Re-read the post-delivery balance now in case the user fired this
        // before `markLegDelivered` landed. CRITICAL: never fall back to
        // quote preview or `post` (without delta) — that risks depositing
        // pre-existing balance the user holds on the destination chain.
        let amount = current.deliveredAmount;
        if (amount === undefined || amount === 0n) {
          if (current.predeliveryBalance === undefined) {
            patch(id, {
              status: "deposit-failed",
              depositError:
                "Pre-delivery balance was never captured — open the vault drawer to deposit manually.",
            });
            return;
          }
          try {
            const post = (await wagmiReadContract(config, {
              address: outputToken,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [recipient],
              chainId,
            })) as bigint;
            const delta = post > current.predeliveryBalance
              ? post - current.predeliveryBalance
              : 0n;
            if (delta === 0n) {
              patch(id, {
                status: "deposit-failed",
                depositError:
                  "Solver fill not yet visible on-chain (RPC may be lagging). Retry in a moment.",
              });
              return;
            }
            amount = delta;
          } catch {
            patch(id, {
              status: "deposit-failed",
              depositError:
                "Couldn't read destination balance after delivery — retry the deposit step.",
            });
            return;
          }
        }

        if (!amount || amount === 0n) {
          patch(id, {
            status: "deposit-failed",
            depositError:
              "Delivered amount not yet visible on-chain — wait and retry.",
          });
          return;
        }

        try {
          patch(id, { status: "deposit-quoting", depositError: undefined });

          const composer = await fetchComposerQuote({
            fromChain: chainId,
            toChain: chainId,
            fromToken: outputToken,
            toToken: vault.address,
            fromAddress: recipient,
            toAddress: recipient,
            fromAmount: amount.toString(),
            underlyingSymbols: current.spec.destination.outputSymbol
              ? [current.spec.destination.outputSymbol]
              : undefined,
          });

          const currentChain = wagmiGetAccount(config).chainId;
          if (currentChain !== chainId) {
            await wagmiSwitchChain(config, { chainId });
          }
          const walletClient = await getWagmiWalletClient(config, { chainId });
          if (!walletClient) {
            throw new Error("No wallet client for destination chain");
          }

          const spender = composer.estimate.approvalAddress as Address;
          patch(id, { status: "deposit-approving" });
          await safeApproveErc20({
            wagmiConfig: config,
            walletClient,
            token: outputToken,
            spender,
            amount,
            owner: recipient,
            chainId,
          });

          patch(id, { status: "deposit-signing" });
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
          const receipt = await wagmiWaitForReceipt(config, {
            hash: depositHash,
            chainId,
            timeout: 120_000,
          });
          if (receipt.status === "reverted") {
            throw new Error("Deposit transaction reverted on-chain");
          }
          patch(id, {
            status: "deposit-done",
            depositTxHash: depositHash,
            deliveredAmount: amount,
          });
        } catch (err) {
          patch(id, {
            status: "deposit-failed",
            depositError: err instanceof Error ? err.message : String(err),
          });
        }
      } finally {
        // Outer finally: releases the global in-flight lock for every code
        // path above (validation early returns AND the deposit try/catch).
        depositInFlight.current.delete(id);
      }
    },
    [config, patch],
  );

  const reset = useCallback(() => setRuns([]), []);

  return {
    runs,
    quoteAll,
    openAll,
    retryLeg,
    refundLeg,
    depositLeg,
    markLegDelivered,
    reset,
  };
}

