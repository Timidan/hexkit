import { OPCODE_MNEMONICS } from "./constants";

export function parseRawTraceObject(rawTrace: unknown): any {
  if (rawTrace === null || rawTrace === undefined) return null;
  if (typeof rawTrace !== "string") return rawTrace;
  try {
    return JSON.parse(rawTrace);
  } catch {
    return rawTrace;
  }
}

export const getOpcodeName = (opcode?: number | null) => {
  if (typeof opcode !== "number") return "OP";
  return OPCODE_MNEMONICS[opcode] || `OP 0x${opcode.toString(16)}`;
};

export const snapshotFrameKey = (frameId: unknown): string | undefined => {
  if (!frameId && frameId !== 0) return undefined;
  if (Array.isArray(frameId)) {
    return frameId.join(":");
  }
  if (typeof frameId === "object" && frameId !== null && "join" in (frameId as any)) {
    try {
      return Array.from(frameId as Iterable<any>).join(":");
    } catch {
      return undefined;
    }
  }
  return String(frameId);
};

export const formatTimestamp = (value?: number | null) => {
  if (!value) return "—";

  try {
    const date = new Date(value * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let relativeTime = "";
    if (days > 0) {
      relativeTime = `${days} day${days !== 1 ? "s" : ""} ago`;
    } else if (hours > 0) {
      relativeTime = `${hours} hour${hours !== 1 ? "s" : ""} ago`;
    } else if (minutes > 0) {
      relativeTime = `${minutes} minute${minutes !== 1 ? "s" : ""} ago`;
    } else {
      relativeTime = "Just now";
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hour = String(date.getHours()).padStart(2, "0");
    const minute = String(date.getMinutes()).padStart(2, "0");
    const second = String(date.getSeconds()).padStart(2, "0");
    const absoluteTime = `${day}/${month}/${year} ${hour}:${minute}:${second}`;

    return `${relativeTime} (${absoluteTime})`;
  } catch {
    return "—";
  }
};

/** BigInt-safe formatting: avoids Number() precision loss for values > 2^53 */
function formatBigIntUnits(wei: bigint, decimals: number, displayDecimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const intPart = wei / divisor;
  const fracPart = wei % divisor;
  const fracStr = fracPart.toString().padStart(decimals, '0').slice(0, displayDecimals);
  return `${intPart}.${fracStr}`;
}

export const formatGwei = (weiValue?: string | null) => {
  if (!weiValue) return "—";
  try {
    const wei = BigInt(weiValue);
    return `${formatBigIntUnits(wei, 9, 2)} Gwei`;
  } catch {
    return "—";
  }
};

export const formatEth = (weiValue?: string | null) => {
  if (!weiValue) return "—";
  try {
    const wei = BigInt(weiValue);
    const isSmall = wei < 10n ** 14n;
    const displayDecimals = isSmall ? 6 : 4;
    return `${formatBigIntUnits(wei, 18, displayDecimals)} ETH`;
  } catch {
    return "—";
  }
};

export const calculateIntrinsicGas = (calldata?: string | null): number => {
  const INTRINSIC_BASE = 21000;
  if (!calldata || calldata === "0x") return INTRINSIC_BASE;

  const data = calldata.startsWith("0x") ? calldata.slice(2) : calldata;
  let calldataGas = 0;

  for (let i = 0; i < data.length; i += 2) {
    const byte = data.slice(i, i + 2);
    if (byte === "00") {
      calldataGas += 4;
    } else {
      calldataGas += 16;
    }
  }

  return INTRINSIC_BASE + calldataGas;
};

export const formatTxType = (type?: number | null) => {
  if (type === null || type === undefined) return "—";
  switch (type) {
    case 0:
      return "Legacy (0)";
    case 1:
      return "EIP-2930 (1)";
    case 2:
      return "EIP-1559 (2)";
    default:
      return `Type ${type}`;
  }
};

export const getOpcodeToneClass = (name?: string) => {
  if (!name) return "";
  if (name.startsWith("SLOAD") || name.startsWith("SSTORE")) return "sim-opcode-badge--storage";
  if (name.startsWith("STOP")) return "sim-opcode-badge--stop";
  if (name.startsWith("JUMP") || name.startsWith("CALL")) return "sim-opcode-badge--flow";
  return "";
};

export const parseGasSafe = (value: string | number | null | undefined): number => {
  if (!value) return 0;
  const num = typeof value === 'string' ? parseInt(value, 10) : value;
  const MAX_REASONABLE_GAS = 100_000_000;
  return (Number.isFinite(num) && num > 0 && num < MAX_REASONABLE_GAS) ? num : 0;
};
