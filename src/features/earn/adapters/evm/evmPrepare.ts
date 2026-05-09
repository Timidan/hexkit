// Prepares a deposit/withdraw into a PreparedEarnAction: [optional ERC20
// approve, Composer tx]. ERC20 gets an approve step prepended when the live
// allowance for `estimate.approvalAddress` is below amountIn. Native tokens
// never approve. The swap-then-deposit two-step DepositFlow uses for
// non-underlying tokens is not modelled here — it stays shell-local.
import { ethers } from "ethers";
import type { EvmChainDescriptor } from "../../../../chains/types";
import {
  parseEvmChainId,
  parseAddress,
  parseCalldata,
} from "../../../../chains/types/evm";
import type { Address } from "../../../../chains/types/evm";
import type {
  EarnAssetRef,
  EarnVaultFor,
  PreparedEarnAction,
  PreparedTx,
  PreparedTxEnvelope,
  PrepareDepositArgs,
  PrepareWithdrawArgs,
} from "../../adapter/types";
import { fetchComposerQuote } from "../../../../components/integrations/lifi-earn/earnApi";
import { fetchEvmTokenAllowance } from "./evmReads";
import { isNativeToken } from "../../../../utils/addressConstants";

const ERC20_APPROVE_IFACE = new ethers.utils.Interface([
  "function approve(address spender, uint256 amount) returns (bool)",
]);

function buildApprovalTx(
  chain: EvmChainDescriptor,
  tokenAddress: Address,
  spender: Address,
): PreparedTx<EvmChainDescriptor> {
  const data = ERC20_APPROVE_IFACE.encodeFunctionData("approve", [
    spender,
    ethers.constants.MaxUint256,
  ]) as `0x${string}`;

  const envelope: PreparedTxEnvelope<EvmChainDescriptor> = {
    family: "evm",
    chainId: parseEvmChainId(chain.chainId as number),
    to: tokenAddress,
    data: parseCalldata(data),
  };

  return {
    id: "approval",
    chain,
    kind: "approval",
    title: "Approve token",
    summary: "ERC20 approve for the LI.FI Composer spender",
    request: envelope,
  };
}

function composerToEnvelope(
  chain: EvmChainDescriptor,
  req: { to: string; data: string; value?: string; gasLimit?: string },
): PreparedTxEnvelope<EvmChainDescriptor> {
  return {
    family: "evm",
    chainId: parseEvmChainId(chain.chainId as number),
    to: parseAddress(req.to),
    data: parseCalldata(req.data),
    value: req.value ? BigInt(req.value) : undefined,
    gasLimit: req.gasLimit ? BigInt(req.gasLimit) : undefined,
  };
}

/**
 * Fetch a Composer quote and (optionally) prepend an approval step, yielding
 * a PreparedEarnAction ready for the shell to walk with submitTx.
 */
export async function prepareEvmDeposit(
  args: PrepareDepositArgs<EvmChainDescriptor>,
): Promise<PreparedEarnAction<EvmChainDescriptor>> {
  const { vault, tokenIn, amountInRaw, owner, receiver } = args;
  const chain = args.vault.chainKey.startsWith("evm:")
    ? ({
        chainFamily: "evm",
        key: vault.chainKey,
        chainId: parseEvmChainId(vault.chainId),
        name: vault.network,
      } as EvmChainDescriptor)
    : null;
  if (!chain) throw new Error(`prepareEvmDeposit: non-EVM vault chainKey ${vault.chainKey}`);

  const toAddress = receiver ?? owner;

  const quote = await fetchComposerQuote({
    fromChain: vault.chainId,
    toChain: vault.chainId,
    fromToken: tokenIn.kind === "native" ? tokenIn.address : tokenIn.address,
    toToken: vault.address,
    fromAddress: owner,
    toAddress,
    fromAmount: amountInRaw.toString(),
    underlyingSymbols: vault.underlyingTokens?.map((t) => t.symbol),
  });

  const steps: PreparedTx<EvmChainDescriptor>[] = [];

  // ERC20s need an allowance check against the composer-supplied spender.
  // Native-token inputs skip this entirely.
  if (!isNativeToken(tokenIn.address)) {
    const spenderStr = quote.estimate.approvalAddress;
    const spender = parseAddress(spenderStr);

    const currentAllowance = await fetchEvmTokenAllowance(
      vault.chainId,
      tokenIn.address,
      owner,
      spenderStr,
    );

    if (currentAllowance < amountInRaw) {
      steps.push(buildApprovalTx(chain, parseAddress(tokenIn.address), spender));
    }
  }

  steps.push({
    id: "deposit",
    chain,
    kind: "deposit",
    title: `Deposit ${tokenIn.symbol} into ${vault.name ?? "vault"}`,
    summary: "LI.FI Composer transaction",
    request: composerToEnvelope(chain, quote.transactionRequest),
  });

  return {
    type: "deposit",
    chain,
    vault: vault as EarnVaultFor<EvmChainDescriptor>,
    assetIn: tokenIn as EarnAssetRef<EvmChainDescriptor>,
    amountInRaw,
    amountOutRaw: quote.estimate.toAmount ? BigInt(quote.estimate.toAmount) : null,
    amountOutMinRaw: quote.estimate.toAmountMin
      ? BigInt(quote.estimate.toAmountMin)
      : null,
    steps,
  };
}

export async function prepareEvmWithdraw(
  args: PrepareWithdrawArgs<EvmChainDescriptor>,
): Promise<PreparedEarnAction<EvmChainDescriptor>> {
  const { vault, shareToken, tokenOut, amountInRaw, owner, receiver } = args;
  const chain = vault.chainKey.startsWith("evm:")
    ? ({
        chainFamily: "evm",
        key: vault.chainKey,
        chainId: parseEvmChainId(vault.chainId),
        name: vault.network,
      } as EvmChainDescriptor)
    : null;
  if (!chain) throw new Error(`prepareEvmWithdraw: non-EVM vault chainKey ${vault.chainKey}`);

  const toAddress = receiver ?? owner;

  const quote = await fetchComposerQuote({
    fromChain: vault.chainId,
    toChain: vault.chainId,
    // shares become the input; the underlying token is the output
    fromToken: shareToken.address,
    toToken: tokenOut.address,
    fromAddress: owner,
    toAddress,
    fromAmount: amountInRaw.toString(),
    underlyingSymbols: vault.underlyingTokens?.map((t) => t.symbol),
  });

  const steps: PreparedTx<EvmChainDescriptor>[] = [];

  // Some vaults require approving the share token to the composer before
  // withdrawing. Always check; skip if unnecessary.
  const spenderStr = quote.estimate.approvalAddress;
  const spender = parseAddress(spenderStr);
  const currentAllowance = await fetchEvmTokenAllowance(
    vault.chainId,
    shareToken.address,
    owner,
    spenderStr,
  );
  if (currentAllowance < amountInRaw) {
    steps.push(buildApprovalTx(chain, parseAddress(shareToken.address), spender));
  }

  steps.push({
    id: "withdraw",
    chain,
    kind: "withdraw",
    title: `Withdraw to ${tokenOut.symbol}`,
    summary: "LI.FI Composer withdraw transaction",
    request: composerToEnvelope(chain, quote.transactionRequest),
  });

  return {
    type: "withdraw",
    chain,
    vault: vault as EarnVaultFor<EvmChainDescriptor>,
    assetIn: shareToken as EarnAssetRef<EvmChainDescriptor>,
    assetOut: tokenOut as EarnAssetRef<EvmChainDescriptor>,
    amountInRaw,
    amountOutRaw: quote.estimate.toAmount ? BigInt(quote.estimate.toAmount) : null,
    amountOutMinRaw: quote.estimate.toAmountMin
      ? BigInt(quote.estimate.toAmountMin)
      : null,
    steps,
  };
}
