import { encodeFunctionData, type Address, type Hex } from "viem";
import { MEZO_ABIS } from "../abi";
import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import type { SimCall } from "./ethSimulateV1";
import type { MezoLegSpec } from "../pipeline/mezoLegs";

/**
 * Encode a write-leg spec as an `eth_simulateV1` SimCall. Throws on v2
 * variants that have no v1 implementation.
 */
export function encodeWrite(account: Address, leg: MezoLegSpec): SimCall {
  switch (leg.type) {
    case "openTrove": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "openTrove",
        args: [leg.debtAmount, leg.upperHint, leg.lowerHint],
      });
      // openTrove walks SortedTroves from upperHint to find the insertion
      // point. With ~200 existing troves on testnet a real-fork walk can
      // consume ~4M gas — well above the simulateBundle default split.
      return {
        from: account,
        to: MEZO_CONTRACTS.BorrowerOperations,
        input,
        value: bigintToHex(leg.collateralWei),
        gas: "0x4c4b40" as `0x${string}`, // 5,000,000
      };
    }

    case "troveAdjust": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "adjustTrove",
        args: [
          leg.collWithdrawal,
          leg.debtChange,
          leg.isDebtIncrease,
          leg.upperHint,
          leg.lowerHint,
        ],
      });
      return {
        from: account,
        to: MEZO_CONTRACTS.BorrowerOperations,
        input,
        value: leg.collDeposit > 0n ? bigintToHex(leg.collDeposit) : undefined,
      };
    }

    case "approveErc20": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.MUSD,
        functionName: "approve",
        args: [leg.spender, leg.amount],
      });
      return { from: account, to: leg.token, input };
    }

    case "sMusdDeposit": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.sMUSD,
        functionName: "deposit",
        args: [leg.amount],
      });
      return { from: account, to: MEZO_CONTRACTS.sMUSD, input };
    }

    case "sMusdWithdraw": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.sMUSD,
        functionName: "withdraw",
        args: [leg.amount],
      });
      return { from: account, to: MEZO_CONTRACTS.sMUSD, input };
    }

    case "gaugeDeposit": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.Gauge,
        functionName: "deposit",
        args: [leg.amount],
      });
      return { from: account, to: leg.gauge, input };
    }

    case "veMezoCreateLock": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "createLock",
        args: [leg.amount, leg.lockDuration],
      });
      // createLock mints an NFT, writes locked-amount + checkpoint storage,
      // and pulls MEZO via safeTransferFrom — real-fork usage is ~1M gas.
      return {
        from: account,
        to: MEZO_CONTRACTS.veMEZO,
        input,
        gas: "0x1e8480" as `0x${string}`, // 2,000,000
      };
    }

    case "veMezoIncreaseAmount": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "increaseAmount",
        args: [leg.tokenId, leg.amount],
      });
      return { from: account, to: MEZO_CONTRACTS.veMEZO, input };
    }

    case "veMezoIncreaseUnlockTime": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "increaseUnlockTime",
        args: [leg.tokenId, leg.lockDuration],
      });
      return { from: account, to: MEZO_CONTRACTS.veMEZO, input };
    }

    case "routerSwap": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.Router,
        functionName: "swapExactTokensForTokens",
        args: [
          leg.amountIn,
          leg.amountOutMin,
          leg.routes,
          leg.to,
          leg.deadline,
        ],
      });
      return { from: account, to: MEZO_CONTRACTS.Router, input };
    }

    case "routerAddLiquidity": {
      const input = encodeFunctionData({
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
      });
      // addLiquidity mints LP, transfers both tokens, updates reserves —
      // real-fork usage is ~1.5M; the default bundle split (≈500k once
      // openTrove reserves its 5M) isn't enough.
      return {
        from: account,
        to: MEZO_CONTRACTS.Router,
        input,
        gas: "0x1e8480" as `0x${string}`, // 2,000,000
      };
    }

    case "routerRemoveLiquidity": {
      const input = encodeFunctionData({
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
      });
      return {
        from: account,
        to: MEZO_CONTRACTS.Router,
        input,
        gas: "0x1e8480" as `0x${string}`, // 2,000,000
      };
    }

    case "repayMUSD": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "repayMUSD",
        args: [leg.amount, leg.upperHint, leg.lowerHint],
      });
      return { from: account, to: MEZO_CONTRACTS.BorrowerOperations, input };
    }

    case "closeTrove": {
      const input = encodeFunctionData({
        abi: MEZO_ABIS.BorrowerOperations,
        functionName: "closeTrove",
        args: [],
      });
      return { from: account, to: MEZO_CONTRACTS.BorrowerOperations, input };
    }

    case "gaugeWithdraw":
    case "gaugeClaim":
    case "redeemCollateral":
      throw new Error(`encodeWrite: ${leg.type} is a v2 leg, not implemented`);
  }
}

function bigintToHex(value: bigint): Hex {
  return `0x${value.toString(16)}` as Hex;
}
