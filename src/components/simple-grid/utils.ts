/**
 * Pure utility functions extracted from SimpleGridUI.tsx.
 * No React state or side effects -- purely functional.
 */
import { ethers } from "ethers";
import type { ComplexValueMetadata } from "../../utils/complexValueBuilder";
import { shortenAddress } from "../shared/AddressDisplay";

export const stringifyResultData = (value: any): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  const replacer = (_key: string, val: any) => {
    if (ethers.BigNumber.isBigNumber(val)) {
      return val.toString();
    }
    if (typeof val === "bigint") {
      return val.toString();
    }
    if (val && typeof val === "object") {
      if (val._isBigNumber && val._hex) {
        try {
          return ethers.BigNumber.from(val._hex).toString();
        } catch {
          return val.toString?.() ?? val;
        }
      }
      if (val.type === "BigNumber" && val.hex) {
        try {
          return ethers.BigNumber.from(val.hex).toString();
        } catch {
          return val.toString?.() ?? val;
        }
      }
    }
    return val;
  };

  try {
    return JSON.stringify(value, replacer, 2);
  } catch (error) {
    try {
      return String(value);
    } catch {
      return "";
    }
  }
};

export const normalizeResultString = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return stringifyResultData(value);
};

export const fetchChainIdFromRpc = async (
  url: string,
  timeoutMs = 8000
): Promise<number | null> => {
  if (typeof fetch === "undefined") {
    return null;
  }

  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
      }),
      signal: controller?.signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    if (!data) return null;
    const result = data.result ?? data.chainId ?? data.chain_id;
    if (typeof result === "string") {
      const parsed = Number.parseInt(result, 16);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof result === "number") {
      return result;
    }
    return null;
  } catch {
    return null;
  } finally {
    if (typeof timer !== "undefined") {
      clearTimeout(timer);
    }
  }
};

export const validateGenericRpcEndpoint = async (
  url: string,
  expectedChainId: number
): Promise<boolean> => {
  const chainId = await fetchChainIdFromRpc(url);
  if (chainId === null || typeof chainId === "undefined") {
    return false;
  }
  return Number(chainId) === Number(expectedChainId);
};

export const mapOutputToMetadata = (
  output: any,
  index: number
): ComplexValueMetadata => ({
  label: output?.name || `field_${index}`,
  name: output?.name,
  type: output?.type,
  components: Array.isArray(output?.components)
    ? output.components.map((component: any, componentIndex: number) =>
        mapOutputToMetadata(component, componentIndex)
      )
    : undefined,
});

export const deriveResultMetadata = (
  functionABI?: { outputs?: any[] }
): ComplexValueMetadata | undefined => {
  if (!functionABI?.outputs || functionABI.outputs.length === 0) {
    return undefined;
  }

  if (functionABI.outputs.length === 1) {
    const output = functionABI.outputs[0];
    return {
      label: output?.name || "result",
      name: output?.name,
      type: output?.type,
      components: Array.isArray(output?.components)
        ? output.components.map((component: any, componentIndex: number) =>
            mapOutputToMetadata(component, componentIndex)
          )
        : undefined,
    };
  }

  return {
    label: "Result",
    type: "tuple",
    components: functionABI.outputs.map((output: any, idx: number) =>
      mapOutputToMetadata(output, idx)
    ),
  };
};

export const abbreviateFacet = (address: string) =>
  address ? shortenAddress(address) : "";

export const decodeFunctionSelector = (input?: string): string => {
  if (!input || input === "0x") return "Fallback";
  return input.slice(0, 10);
};

export const safeBigNumberToString = (obj: any): any => {
  if (obj && typeof obj === "object") {
    if (obj._hex && obj._isBigNumber) {
      return obj.toString();
    }
    if (Array.isArray(obj)) {
      return obj.map(safeBigNumberToString);
    }
    const result: any = {};
    for (const key in obj) {
      result[key] = safeBigNumberToString(obj[key]);
    }
    return result;
  }
  return obj;
};

export const sanitizeAbiEntries = (abiItems: any[]): any[] => {
  if (!Array.isArray(abiItems)) {
    return [];
  }

  const sanitized: any[] = [];

  abiItems.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }

    if ((item as any).type !== "function") {
      sanitized.push(item);
      return;
    }

    const func = item as {
      name?: string;
      stateMutability?: string;
      constant?: boolean;
      payable?: boolean;
    };

    if (typeof func.stateMutability === "string" && func.stateMutability) {
      sanitized.push(item);
      return;
    }

    if (!func.name) {
      return;
    }

    const inferredStateMutability =
      func.constant === true
        ? "view"
        : func.payable === true
          ? "payable"
          : "nonpayable";

    sanitized.push({
      ...item,
      stateMutability: inferredStateMutability,
    });
  });

  return sanitized;
};

export const FALLBACK_RPCS: Record<number, string> = {
  1: "https://ethereum-rpc.publicnode.com",
  8453: "https://mainnet.base.org",
  137: "https://polygon.drpc.org",
  42161: "https://arbitrum.drpc.org",
  10: "https://mainnet.optimism.io",
  56: "https://bsc-mainnet.drpc.org",
  43114: "https://api.avax.network/ext/bc/C/rpc",
  100: "https://rpc.gnosischain.com",
  11155111: "https://sepolia.drpc.org",
  17000: "https://holesky.drpc.org",
  80002: "https://polygon-amoy.gateway.tenderly.co",
  421614: "https://arbitrum-sepolia.drpc.org",
  11155420: "https://sepolia.optimism.io",
  84532: "https://sepolia.base.org",
  4202: "https://rpc.sepolia-api.lisk.com",
  97: "https://bsc-testnet.drpc.org",
};
