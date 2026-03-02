import { ethers } from "ethers";
import type { TraceRow } from "../simulation-results/types";
import { shortenAddress } from "../shared/AddressDisplay";

export interface StackTraceProps {
  traceRows: TraceRow[];
  isDecoding?: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  filters: TraceFilters;
  onFilterChange: (key: keyof TraceFilters) => void;
  onGoToRevert?: () => void;
  hasRevert?: boolean;
  selectedInput?: string | null;
  selectedOutput?: string | null;
  sourceLines?: string[];
  /** Source texts per file for multi-file source mapping */
  sourceTexts?: Record<string, string>;
  traceDiagnostics?: {
    hasRawTrace: boolean;
    hasSnapshots: boolean;
    rowsCount: number;
    artifactWarning?: string | null;
    isDecoding?: boolean;
  };
  /** Raw event logs for token movement detection */
  traceEvents?: Array<{ address?: string; topics?: string[]; data?: string }>;
  /** Sender address for labeling in token movements */
  senderAddress?: string;
  /** External highlight value for cross-component highlighting */
  highlightedValue?: string | null;
  /** Callback when highlight value changes */
  onHighlightChange?: (value: string | null) => void;
  /** Address to name resolution map (can be passed from parent) */
  addressToNameMap?: Map<string, string>;
  /** Map of implementation/facet addresses to proxy addresses for Diamond patterns */
  implementationToProxy?: Map<string, string>;
  /** Pre-computed asset changes (native token) from simulation artifacts */
  assetChanges?: Array<{
    address: string;
    symbol: string;
    amount: string;
    rawAmount?: string;
    direction?: 'in' | 'out';
  }>;
}

export interface DecodedLogData {
  name: string;
  args: { name: string | number; value: string }[];
  source?: string;
  truncated?: boolean;
}

// Re-exported from the canonical location (simulation-results/types.ts)
export type { TraceRow } from "../simulation-results/types";

export type SearchCategory = 'all' | 'opcode' | 'from' | 'to' | 'function' | 'file' | 'contract' | 'state';

export const SEARCH_CATEGORIES: { value: SearchCategory; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'opcode', label: 'OpCode' },
  { value: 'from', label: 'From' },
  { value: 'to', label: 'To' },
  { value: 'function', label: 'Function' },
  { value: 'file', label: 'File' },
  { value: 'contract', label: 'Contract' },
  { value: 'state', label: 'State' },
];

export interface TraceFilters {
  gas: boolean;
  full: boolean;
  storage: boolean;
  events: boolean;
}

export interface FrameHierarchyEntry {
  parentId: string | null;
  isEntry: boolean;
  isCollapsible: boolean;
  functionDepth: number;
  callDepth: number;
  frameKey: string | null;
  decoderDepth: number;
}

export interface SelectedEvent {
  name: string;
  args: Array<{ name: string | number; value: string }>;
  contractName?: string;
  mode?: "popover" | "modal";
}

export interface TraceValueDetail {
  title: string;
  value: string;
  mode: "popover" | "modal";
  format?: "text" | "json";
}

export interface SignatureDecodedInput {
  name: string;
  params: Array<{ name: string; type: string; value: string }>;
  signature: string;
}

/** Parse parameter types from a signature string, handling nested tuples */
export const parseSignatureTypes = (paramString: string): string[] => {
  if (!paramString || paramString.trim() === "") return [];

  const types: string[] = [];
  let current = "";
  let depth = 0;

  for (const char of paramString) {
    if (char === "(") {
      depth++;
      current += char;
    } else if (char === ")") {
      depth--;
      current += char;
    } else if (char === "," && depth === 0) {
      if (current.trim()) types.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) types.push(current.trim());
  return types;
};

/** Format decoded values for display */
export const formatDecodedValue = (value: any): string => {
  if (value === null || value === undefined) return "";
  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return "[" + value.map(formatDecodedValue).join(", ") + "]";
  }
  if (typeof value === "object" && value._isBigNumber) {
    return value.toString();
  }
  return String(value);
};

/** Decode calldata using a function signature string (e.g., "transfer(address,uint256)") */
export const decodeCalldataWithSignature = (
  calldata: string,
  signature: string
): { name: string; params: Array<{ name: string; type: string; value: string }> } | null => {
  try {
    if (!calldata || calldata.length < 10 || !signature) return null;

    const match = signature.match(/^(\w+)\((.*)\)$/);
    if (!match) return null;

    const [, functionName, paramString] = match;
    const paramTypes = parseSignatureTypes(paramString);

    const encodedParams = "0x" + calldata.slice(10);

    if (paramTypes.length === 0) {
      return { name: functionName, params: [] };
    }

    const abiCoder = new ethers.utils.AbiCoder();
    const decoded = abiCoder.decode(paramTypes, encodedParams);

    const params = paramTypes.map((type, idx) => ({
      name: `param${idx}`,
      type,
      value: formatDecodedValue(decoded[idx]),
    }));

    return { name: functionName, params };
  } catch {
    return null;
  }
};

const isTupleType = (type?: string) => typeof type === "string" && type.startsWith("tuple");

const isTupleArrayType = (type?: string) =>
  typeof type === "string" && type.startsWith("tuple[");

const formatTupleValue = (
  value: any,
  components?: any[]
): string => {
  if (!Array.isArray(components) || components.length === 0) {
    return Array.isArray(value)
      ? `[${value.map((v) => formatParamValue(v)).join(", ")}]`
      : String(value);
  }

  const fields = components.map((component: any, idx: number) => {
    const key = component?.name || `field${idx}`;
    const componentValue = Array.isArray(value)
      ? value[idx]
      : value?.[component?.name] ?? value?.[idx] ?? value?.[String(idx)];
    return `${key}: ${formatParamValue(componentValue, component?.type, component?.components)}`;
  });
  return `{ ${fields.join(", ")} }`;
};

/** Format decoded parameter value */
export const formatParamValue = (value: any, type?: string, components?: any[]): string => {
  if (value === null || value === undefined) {
    return "null";
  }
  if (ethers.BigNumber.isBigNumber(value)) {
    return value.toString();
  }
  if (isTupleType(type) && !isTupleArrayType(type)) {
    return formatTupleValue(value, components);
  }
  if (Array.isArray(value)) {
    if (isTupleArrayType(type) && Array.isArray(components) && components.length > 0) {
      return `[${value
        .map((entry) => formatTupleValue(entry, components))
        .join(", ")}]`;
    }
    return `[${value.map((v) => formatParamValue(v)).join(", ")}]`;
  }
  if (
    typeof value === "string" &&
    value.startsWith("0x") &&
    value.length === 42
  ) {
    return value;
  }
  if (typeof value === "string" && value.startsWith("0x")) {
    return value;
  }
  if (typeof value === "boolean") {
    return value.toString();
  }
  if (typeof value === "number" || typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    return `"${value}"`;
  }
  return JSON.stringify(value);
};

/** @deprecated Use `shortenAddress` from `shared/AddressDisplay` directly */
export const shortAddress = shortenAddress;

/** Format contract name with address */
export const formatContractDisplay = (address?: string, name?: string) => {
  if (!address) return "\u2014";
  const short = shortenAddress(address);
  if (name && name !== address) {
    return `${name}(${short})`;
  }
  return short;
};
