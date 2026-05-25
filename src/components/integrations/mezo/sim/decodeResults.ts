import {
  decodeErrorResult,
  decodeFunctionResult,
  formatUnits,
  type Hex,
} from "viem";
import { MEZO_ABIS } from "../abi";
import type { SimulatedBlock } from "./ethSimulateV1";
import type {
  DecodedLeg,
  DecodedView,
  SimLog,
  ViewCallSpec,
} from "./types";
import type { MezoLegSpec } from "../pipeline/mezoLegs";

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function decodeBundle(
  result: SimulatedBlock,
  legs: MezoLegSpec[],
  views: ViewCallSpec[],
): { legs: DecodedLeg[]; views: DecodedView[] } {
  const decodedLegs: DecodedLeg[] = [];
  const decodedViews: DecodedView[] = [];
  const beforeViews = views.filter((v) => viewPosition(v) === "before");
  const afterViews = views.filter((v) => viewPosition(v) === "after");

  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const call = result.calls[beforeViews.length + i];
    if (!call) throw new Error(`missing simulation result for leg ${i}`);

    const status: "success" | "reverted" =
      call.status === "0x1" ? "success" : "reverted";

    decodedLegs.push({
      spec: leg,
      status,
      gasUsed: BigInt(call.gasUsed),
      returnData: call.returnData,
      logs: call.logs,
      revertReason:
        status === "reverted" ? decodeRevertReason(call.returnData) : undefined,
      decodedSummary: summarizeLeg(leg),
    });
  }

  for (let i = 0; i < views.length; i++) {
    const view = views[i];
    const viewCallIdx =
      viewPosition(view) === "before"
        ? beforeViews.indexOf(view)
        : beforeViews.length + legs.length + afterViews.indexOf(view);
    const call = result.calls[viewCallIdx];
    if (!call) throw new Error(`missing simulation result for view ${i}`);

    let decoded: unknown = call.returnData;
    try {
      decoded = decodeViewByKind(view, call.returnData);
    } catch {
      // Leave raw; UI surfaces as "decode error" for that view tile.
    }
    decodedViews.push({ spec: view, returnData: call.returnData, decoded });
  }

  return { legs: decodedLegs, views: decodedViews };
}

function viewPosition(view: ViewCallSpec): "before" | "after" {
  return view.position ?? "after";
}

/**
 * Standard EVM revert reason format:
 *   selector (4 bytes) + offset (32) + length (32) + bytes (variable)
 *   selector for Error(string) = 0x08c379a0
 *   selector for Panic(uint256) = 0x4e487b71
 *
 * For custom errors we walk every ABI in MEZO_ABIS + a built-in OZ v5 ERC20
 * error set; viem's `decodeErrorResult` finds the matching item by selector
 * and decodes the args.
 */
function decodeRevertReason(returnData: Hex): string | undefined {
  if (returnData === "0x" || returnData === "0x0" || returnData.length < 10) {
    return "execution reverted (no reason)";
  }

  // 1. Standard Error(string)
  if (returnData.toLowerCase().startsWith("0x08c379a0")) {
    try {
      const lengthHex = returnData.slice(74, 138);
      const length = parseInt(lengthHex, 16);
      const dataHex = returnData.slice(138, 138 + length * 2);
      const bytes = new Uint8Array(
        dataHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
      );
      return new TextDecoder().decode(bytes);
    } catch {
      return "execution reverted (decode failed)";
    }
  }

  // 2. Panic(uint256)
  if (returnData.toLowerCase().startsWith("0x4e487b71")) {
    const codeHex = returnData.slice(10).padStart(64, "0");
    const code = parseInt(codeHex, 16);
    return `Panic(0x${code.toString(16)}) — ${PANIC_CODES[code] ?? "unknown panic"}`;
  }

  // 3. Custom errors — try every ABI we know about.
  for (const abi of ERROR_ABIS) {
    try {
      const decoded = decodeErrorResult({ abi, data: returnData });
      const args = decoded.args ?? [];
      const formatted = args.map((a) => formatArg(a)).join(", ");
      return `${decoded.errorName}(${formatted})`;
    } catch {
      // Selector not in this ABI; keep trying.
    }
  }

  return `execution reverted (selector: ${returnData.slice(0, 10)})`;
}

/**
 * OpenZeppelin v5 ERC20 custom errors — sMUSD vault wraps an OZ v5 MUSD
 * token, so reverts on the savings vault commonly surface as these. Adding
 * them to the decoder turns "(selector: 0xe450d38c)" into
 * "ERC20InsufficientBalance(sender=0x…, balance=0, needed=100e18)".
 */
const OZ_V5_ERC20_ERRORS_ABI = [
  {
    type: "error",
    name: "ERC20InsufficientBalance",
    inputs: [
      { name: "sender", type: "address" },
      { name: "balance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC20InsufficientAllowance",
    inputs: [
      { name: "spender", type: "address" },
      { name: "allowance", type: "uint256" },
      { name: "needed", type: "uint256" },
    ],
  },
  { type: "error", name: "ERC20InvalidSender", inputs: [{ name: "sender", type: "address" }] },
  { type: "error", name: "ERC20InvalidReceiver", inputs: [{ name: "receiver", type: "address" }] },
  { type: "error", name: "ERC20InvalidApprover", inputs: [{ name: "approver", type: "address" }] },
  { type: "error", name: "ERC20InvalidSpender", inputs: [{ name: "spender", type: "address" }] },
  // ERC-4626 vault errors (OZ v5)
  {
    type: "error",
    name: "ERC4626ExceededMaxDeposit",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "assets", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC4626ExceededMaxMint",
    inputs: [
      { name: "receiver", type: "address" },
      { name: "shares", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC4626ExceededMaxWithdraw",
    inputs: [
      { name: "owner", type: "address" },
      { name: "assets", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
  {
    type: "error",
    name: "ERC4626ExceededMaxRedeem",
    inputs: [
      { name: "owner", type: "address" },
      { name: "shares", type: "uint256" },
      { name: "max", type: "uint256" },
    ],
  },
] as const;

/** Tried in order — first match wins. */
const ERROR_ABIS = [
  OZ_V5_ERC20_ERRORS_ABI,
  ...Object.values(MEZO_ABIS),
];

/** EIP standard panic codes — relevant subset. */
const PANIC_CODES: Record<number, string> = {
  0x01: "assertion failed",
  0x11: "arithmetic overflow/underflow",
  0x12: "division by zero",
  0x21: "invalid enum",
  0x22: "storage slice access out-of-bounds",
  0x31: "pop on empty array",
  0x32: "array index out of bounds",
  0x41: "out-of-memory allocation",
  0x51: "uninitialised function pointer",
};

/** Format a decoded error arg for inline display. */
function formatArg(arg: unknown): string {
  if (typeof arg === "bigint") {
    // Heuristic: large bigints likely represent 18-decimals; show both raw and scaled.
    if (arg > 10n ** 15n) {
      const scaled = Number(formatUnits(arg, 18));
      const display =
        scaled >= 0.0001 ? scaled.toFixed(4).replace(/\.?0+$/, "") : arg.toString();
      return display;
    }
    return arg.toString();
  }
  if (typeof arg === "string") {
    // Shorten addresses
    if (arg.startsWith("0x") && arg.length === 42) {
      return `${arg.slice(0, 6)}…${arg.slice(-4)}`;
    }
    return arg;
  }
  if (typeof arg === "boolean") return String(arg);
  if (Array.isArray(arg)) return `[${arg.map(formatArg).join(", ")}]`;
  return JSON.stringify(arg);
}

function summarizeLeg(leg: MezoLegSpec): string {
  switch (leg.type) {
    case "openTrove":
      return `Open trove · ${formatBn(leg.collateralWei)} BTC collateral · borrow ${formatBn(leg.debtAmount)} MUSD`;
    case "troveAdjust": {
      const dir = leg.isDebtIncrease ? "Borrow more" : "Repay";
      return `Adjust trove · ${dir} ${formatBn(leg.debtChange)} MUSD`;
    }
    case "repayMUSD":
      return `Repay ${formatBn(leg.amount)} MUSD`;
    case "closeTrove":
      return `Close trove`;
    case "approveErc20":
      return `Approve ${leg.tokenLabel} → spender`;
    case "sMusdDeposit":
      return `Deposit ${formatBn(leg.amount)} MUSD into sMUSD savings`;
    case "sMusdWithdraw":
      return `Withdraw ${formatBn(leg.amount)} MUSD from sMUSD`;
    case "gaugeDeposit":
      return `Stake into ${leg.gaugeLabel} gauge`;
    case "gaugeWithdraw":
      return `Unstake from gauge`;
    case "gaugeClaim":
      return `Claim gauge rewards`;
    case "routerSwap":
      return `Swap ${formatBn(leg.amountIn)} (min out ${formatBn(leg.amountOutMin)})`;
    case "routerAddLiquidity":
      return `Add liquidity to ${leg.stable ? "stable" : "volatile"} pool`;
    case "routerRemoveLiquidity":
      return `Remove ${formatBn(leg.liquidity)} LP from ${leg.stable ? "stable" : "volatile"} pool`;
    case "redeemCollateral":
      return `Redeem ${formatBn(leg.musdAmount)} MUSD for BTC`;
    case "veMezoCreateLock": {
      const days = Number(leg.lockDuration) / 86400;
      return `Lock ${formatBn(leg.amount)} MEZO for ${days.toFixed(0)}d into veMEZO`;
    }
    case "veMezoIncreaseAmount":
      return `Top up veMEZO lock · +${formatBn(leg.amount)} MEZO`;
    case "veMezoIncreaseUnlockTime": {
      const days = Number(leg.lockDuration) / 86400;
      return `Extend veMEZO unlock by ${days.toFixed(0)}d`;
    }
  }
}

function formatBn(value: bigint, decimals = 18, precision = 4): string {
  const n = Number(formatUnits(value, decimals));
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(precision);
}

function decodeViewByKind(view: ViewCallSpec, data: Hex): unknown {
  switch (view.kind) {
    case "musdBalanceOf":
    case "sMusdBalanceOf":
    case "mezoBalanceOf":
    case "erc20BalanceOf":
      return decodeFunctionResult({
        abi: MEZO_ABIS.MUSD,
        functionName: "balanceOf",
        data,
      });
    case "routerGetAmountsOut":
      return decodeFunctionResult({
        abi: MEZO_ABIS.Router,
        functionName: "getAmountsOut",
        data,
      });
    case "poolFactoryGetPool":
      return decodeFunctionResult({
        abi: MEZO_ABIS.PoolFactory,
        functionName: "getPool",
        data,
      });
    case "lpBalanceOf":
      return decodeFunctionResult({
        abi: MEZO_ABIS.MezoPool,
        functionName: "balanceOf",
        data,
      });
    case "lpTotalSupply":
      return decodeFunctionResult({
        abi: MEZO_ABIS.MezoPool,
        functionName: "totalSupply",
        data,
      });
    case "gaugeBalanceOf":
      return decodeFunctionResult({
        abi: MEZO_ABIS.Gauge,
        functionName: "balanceOf",
        data,
      });
    case "veMezoBalanceOfNFTLiteral":
      return decodeFunctionResult({
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "balanceOfNFT",
        data,
      });
    case "veMezoLockedLiteral":
      return decodeFunctionResult({
        abi: MEZO_ABIS.VotingEscrow,
        functionName: "locked",
        data,
      });
    case "priceFeedFetch":
      return decodeFunctionResult({
        abi: MEZO_ABIS.PriceFeed,
        functionName: "fetchPrice",
        data,
      });
    case "currentIcr":
      return decodeFunctionResult({
        abi: MEZO_ABIS.TroveManager,
        functionName: "getCurrentICR",
        data,
      });
    case "troveDebtCollateral":
      return decodeFunctionResult({
        abi: MEZO_ABIS.TroveManager,
        functionName: "Troves",
        data,
      });
    case "poolReserves":
      return decodeFunctionResult({
        abi: MEZO_ABIS.MezoPool,
        functionName: "getReserves",
        data,
      });
    case "poolReservesForPair":
    case "lpBalanceOfForPair":
    case "lpTotalSupplyForPair":
      return data;
    case "veMezoBalanceOfNFTFromPreviousLeg":
    case "veMezoLockedFromPreviousLeg":
      // Shouldn't be reachable post-resolution; if it is, return raw.
      return data;
  }
}

export interface WatchedToken {
  address: string;
  symbol: string;
  decimals: number;
}

export interface AssetMovement {
  token: string;
  from: string;
  to: string;
  amount: bigint;
}

export function extractAssetMovements(
  logs: SimLog[],
  watchedTokens: WatchedToken[],
): AssetMovement[] {
  const movements: AssetMovement[] = [];
  for (const log of logs) {
    if (log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    const tokenMeta = watchedTokens.find(
      (t) => t.address.toLowerCase() === log.address.toLowerCase(),
    );
    if (!tokenMeta) continue;
    if (log.topics.length < 3) continue;
    movements.push({
      token: tokenMeta.symbol,
      from: `0x${log.topics[1].slice(26)}`,
      to: `0x${log.topics[2].slice(26)}`,
      amount: BigInt(log.data),
    });
  }
  return movements;
}
