import { encodeFunctionData, type Address } from "viem";
import { MEZO_ABIS } from "../abi";
import { MEZO_CONTRACTS } from "../../../../../data/mezoContracts";
import type { SimCall } from "./ethSimulateV1";
import type { ViewCallSpec } from "./types";

export type { ViewCallSpec } from "./types";

/**
 * Encode a view spec as a SimCall. Previous-leg variants must be resolved
 * to literals by the runner first (see useMezoBundleSimulation.ts).
 */
export function encodeView(account: Address, v: ViewCallSpec): SimCall {
  switch (v.kind) {
    case "musdBalanceOf":
    case "erc20BalanceOf":
      return {
        from: account,
        to: v.kind === "erc20BalanceOf" ? v.token : MEZO_CONTRACTS.MUSD,
        input: encodeFunctionData({
          abi: MEZO_ABIS.MUSD,
          functionName: "balanceOf",
          args: [v.account],
        }),
      };

    case "sMusdBalanceOf":
      return {
        from: account,
        to: MEZO_CONTRACTS.sMUSD,
        input: encodeFunctionData({
          abi: MEZO_ABIS.sMUSD,
          functionName: "balanceOf",
          args: [v.account],
        }),
      };

    case "mezoBalanceOf":
      return {
        from: account,
        to: MEZO_CONTRACTS.MEZO,
        input: encodeFunctionData({
          abi: MEZO_ABIS.MEZO,
          functionName: "balanceOf",
          args: [v.account],
        }),
      };

    case "troveDebtCollateral":
      return {
        from: account,
        to: MEZO_CONTRACTS.TroveManager,
        input: encodeFunctionData({
          abi: MEZO_ABIS.TroveManager,
          functionName: "Troves",
          args: [v.account],
        }),
      };

    case "currentIcr":
      // getCurrentICR(address, uint256 price) — caller passes live
      // PriceFeed.fetchPrice() into v.priceWei.
      return {
        from: account,
        to: MEZO_CONTRACTS.TroveManager,
        input: encodeFunctionData({
          abi: MEZO_ABIS.TroveManager,
          functionName: "getCurrentICR",
          args: [v.account, v.priceWei],
        }),
      };

    case "priceFeedFetch":
      return {
        from: account,
        to: MEZO_CONTRACTS.PriceFeed,
        input: encodeFunctionData({
          abi: MEZO_ABIS.PriceFeed,
          functionName: "fetchPrice",
          args: [],
        }),
      };

    case "routerGetAmountsOut":
      return {
        from: account,
        to: MEZO_CONTRACTS.Router,
        input: encodeFunctionData({
          abi: MEZO_ABIS.Router,
          functionName: "getAmountsOut",
          args: [v.amountIn, v.routes],
        }),
      };

    case "poolFactoryGetPool":
      return {
        from: account,
        to: MEZO_CONTRACTS.PoolFactory,
        input: encodeFunctionData({
          abi: MEZO_ABIS.PoolFactory,
          functionName: "getPool",
          args: [v.tokenA, v.tokenB, v.stable],
        }),
      };

    case "veMezoBalanceOfNFTLiteral":
      return {
        from: account,
        to: MEZO_CONTRACTS.veMEZO,
        input: encodeFunctionData({
          abi: MEZO_ABIS.VotingEscrow,
          functionName: "balanceOfNFT",
          args: [v.tokenId],
        }),
      };

    case "veMezoLockedLiteral":
      return {
        from: account,
        to: MEZO_CONTRACTS.veMEZO,
        input: encodeFunctionData({
          abi: MEZO_ABIS.VotingEscrow,
          functionName: "locked",
          args: [v.tokenId],
        }),
      };

    case "veMezoBalanceOfNFTFromPreviousLeg":
    case "veMezoLockedFromPreviousLeg":
      throw new Error(
        `encodeView: unresolved previous-leg reference (${v.kind})`,
      );

    case "lpBalanceOf":
      return {
        from: account,
        to: v.lp,
        input: encodeFunctionData({
          abi: MEZO_ABIS.MezoPool,
          functionName: "balanceOf",
          args: [v.account],
        }),
      };

    case "lpTotalSupply":
      return {
        from: account,
        to: v.lp,
        input: encodeFunctionData({
          abi: MEZO_ABIS.MezoPool,
          functionName: "totalSupply",
          args: [],
        }),
      };

    case "gaugeBalanceOf":
      return {
        from: account,
        to: v.gauge,
        input: encodeFunctionData({
          abi: MEZO_ABIS.Gauge,
          functionName: "balanceOf",
          args: [v.account],
        }),
      };

    case "poolReserves":
      return {
        from: account,
        to: v.pool,
        input: encodeFunctionData({
          abi: MEZO_ABIS.MezoPool,
          functionName: "getReserves",
          args: [],
        }),
      };

    case "poolReservesForPair":
    case "lpBalanceOfForPair":
    case "lpTotalSupplyForPair":
      throw new Error(`encodeView: unresolved pool reference (${v.kind})`);
  }
}
