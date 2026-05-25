import { writeContract, type Config } from "@wagmi/core";
import type { Address, Hex } from "viem";
import { MEZO_ABIS } from "../abi";
import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import { MEZO_TESTNET_CHAIN_ID } from "../constants";
import type { MezoLegSpec } from "./mezoLegs";

/**
 * Dispatch a single write leg via wagmi `writeContract`. Throws on v2
 * variants.
 */
export async function executeLeg(
  config: Config,
  account: Address,
  leg: MezoLegSpec,
): Promise<Hex> {
  switch (leg.type) {
    case "openTrove":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.BorrowerOperations,
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "openTrove",
        args: [leg.debtAmount, leg.upperHint, leg.lowerHint],
        value: leg.collateralWei,
        account,
      });

    case "troveAdjust":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.BorrowerOperations,
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "adjustTrove",
        args: [
          leg.collWithdrawal,
          leg.debtChange,
          leg.isDebtIncrease,
          leg.upperHint,
          leg.lowerHint,
        ],
        value: leg.collDeposit > 0n ? leg.collDeposit : 0n,
        account,
      });

    case "approveErc20":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: leg.token,
        abi: MEZO_ABIS.MUSD,
        functionName: "approve",
        args: [leg.spender, leg.amount],
        account,
      });

    case "sMusdDeposit":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.sMUSD,
        abi: MEZO_ABIS.sMUSD,
        functionName: "deposit",
        args: [leg.amount],
        account,
      });

    case "gaugeDeposit":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: leg.gauge,
        abi: MEZO_ABIS.Gauge,
        functionName: "deposit",
        args: [leg.amount],
        account,
      });

    case "veMezoCreateLock":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.veMEZO,
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "createLock",
        args: [leg.amount, leg.lockDuration],
        account,
      });

    case "veMezoIncreaseAmount":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.veMEZO,
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "increaseAmount",
        args: [leg.tokenId, leg.amount],
        account,
      });

    case "veMezoIncreaseUnlockTime":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.veMEZO,
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "increaseUnlockTime",
        args: [leg.tokenId, leg.lockDuration],
        account,
      });

    case "routerSwap":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.Router,
        abi: MEZO_ABIS.Router,
        functionName: "swapExactTokensForTokens",
        // wagmi infers a strict tuple shape from the ABI's `as const`;
        // our runtime route shape matches but TS can't prove it through
        // the discriminated-union indirection.
        args: [
          leg.amountIn,
          leg.amountOutMin,
          leg.routes as never,
          leg.to,
          leg.deadline,
        ],
        account,
      });

    case "routerAddLiquidity":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.Router,
        abi: MEZO_ABIS.Router,
        functionName: "addLiquidity",
        args: [
          leg.tokenA,
          leg.tokenB,
          leg.stable,
          leg.amountADesired,
          leg.amountBDesired,
          leg.amountAMin,
          leg.amountBMin,
          leg.to,
          leg.deadline,
        ],
        account,
      });

    case "routerRemoveLiquidity":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.Router,
        abi: MEZO_ABIS.Router,
        functionName: "removeLiquidity",
        args: [
          leg.tokenA,
          leg.tokenB,
          leg.stable,
          leg.liquidity,
          leg.amountAMin,
          leg.amountBMin,
          leg.to,
          leg.deadline,
        ],
        account,
      });

    case "repayMUSD":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.BorrowerOperations,
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "repayMUSD",
        args: [leg.amount, leg.upperHint, leg.lowerHint],
        account,
      });

    case "closeTrove":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.BorrowerOperations,
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "closeTrove",
        args: [],
        account,
      });

    case "sMusdWithdraw":
      return writeContract(config, {
        chainId: MEZO_TESTNET_CHAIN_ID,
        address: MEZO_CONTRACTS.sMUSD,
        abi: MEZO_ABIS.sMUSD,
        functionName: "withdraw",
        args: [leg.amount],
        account,
      });

    case "gaugeWithdraw":
    case "gaugeClaim":
    case "redeemCollateral":
      throw new Error(`executeLeg: ${leg.type} is a v2 leg, not implemented`);
  }
}
