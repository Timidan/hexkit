import { ethers } from "ethers";

/**
 * Check if a single type string is a valid Solidity ABI type.
 */
export function isValidSolidityType(t: string): boolean {
  // Strip trailing array brackets e.g. [] or [5]
  const base = t.replace(/(\[\d*\])+$/, "");

  // Tuple: (type1,type2,...)
  if (base.startsWith("(") && base.endsWith(")")) {
    const inner = base.slice(1, -1);
    return inner.length > 0 && areValidSolidityParams(inner);
  }

  if (["address", "bool", "string", "bytes"].includes(base)) return true;

  // uint / int  (optionally sized: 8-256 in steps of 8)
  const intMatch = base.match(/^(u?int)(\d+)?$/);
  if (intMatch) {
    if (!intMatch[2]) return true;
    const n = Number(intMatch[2]);
    return n >= 8 && n <= 256 && n % 8 === 0;
  }

  // bytesN  (1-32)
  const bytesMatch = base.match(/^bytes(\d+)$/);
  if (bytesMatch) {
    const n = Number(bytesMatch[1]);
    return n >= 1 && n <= 32;
  }

  return false;
}

/**
 * Split a comma-separated param string respecting nested parentheses,
 * then validate each type.
 */
export function areValidSolidityParams(params: string): boolean {
  const types: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of params) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      types.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) types.push(current.trim());
  return types.length > 0 && types.every(isValidSolidityType);
}

/**
 * Yield to the main thread to prevent long tasks from blocking the UI.
 */
export const yieldToMain = () =>
  new Promise<void>((resolve) => {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (
        window as typeof window & {
          requestIdleCallback: (
            callback: () => void,
            options?: { timeout: number },
          ) => number;
        }
      ).requestIdleCallback(() => resolve(), { timeout: 200 });
      return;
    }
    setTimeout(resolve, 0);
  });

/**
 * Compute a 4-byte function selector or full keccak256 hash from a signature string.
 */
export function generateSignatureHash(
  signature: string,
  type: "function" | "event" = "function",
): string {
  try {
    const hash = ethers.utils.id(signature);
    return type === "function" ? hash.slice(0, 10) : hash;
  } catch {
    return "Invalid signature";
  }
}
