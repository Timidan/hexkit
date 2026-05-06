import type {
  SignatureResponse,
  SearchResponse,
  SearchProgress,
  CustomSignature,
} from "../../utils/signatureDatabase";

// ---- Public types (re-exported from SignatureDatabase.tsx) ----

export type TabType = "lookup" | "search" | "tools" | "custom" | "cache";
export type ToolSubTab = "selector" | "decoder" | "encoder" | "hash";

// ---- Internal types ----

export interface SignatureDatabaseProps {
  initialTab?: TabType;
  initialToolSubTab?: ToolSubTab;
}

export type FlattenedSignature = {
  hash: string;
  name: string;
  filtered?: boolean;
  type: "function" | "event";
};

export type CachedSignature = {
  hash: string;
  name: string;
  timestamp: number;
};

export interface ParsedContract {
  abi: any[];
  functions: string[];
  events: string[];
  fileName: string;
}

export type ParsedContracts = Record<string, ParsedContract>;

// ---- Constants ----

export const SIGNATURE_TABS: TabType[] = [
  "lookup",
  "search",
  "tools",
  "custom",
  "cache",
];

export const TOOL_SUB_TABS: ToolSubTab[] = [
  "selector",
  "decoder",
  "encoder",
  "hash",
];

// ---- Type guards ----

export function isTabType(value: string | null): value is TabType {
  return value !== null && SIGNATURE_TABS.includes(value as TabType);
}

export function isToolSubTab(value: string | null): value is ToolSubTab {
  return value !== null && TOOL_SUB_TABS.includes(value as ToolSubTab);
}

// ---- Re-export service types consumers need ----
export type {
  SignatureResponse,
  SearchResponse,
  SearchProgress,
  CustomSignature,
};
