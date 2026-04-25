export type TypedDataField = { name: string; type: string };
export type TypedDataTypes = Record<string, TypedDataField[]>;

export type TypedDataDomain = {
  name?: string;
  version?: string;
  chainId?: number | string;
  verifyingContract?: string;
  salt?: string;
};

export type TypedDataPayload = {
  domain: TypedDataDomain;
  types: TypedDataTypes;
  primaryType: string;
  message: Record<string, unknown>;
};

export type ClassifiedTag =
  | 'erc2612'
  | 'dai-permit'
  | 'permit2-single'
  | 'permit2-batch'
  | 'permit2-transfer-from'
  | 'safe-tx'
  | 'seaport'
  | 'uniswapx'
  | 'cow-order'
  | 'erc7683'
  | 'unknown';

export type ClassifiedPayload = {
  kind: ClassifiedTag;
  payload: TypedDataPayload;
  /** Expected canonical verifyingContract for this kind, if any. */
  canonicalVerifyingContract?: string;
};

export type RiskLevel = 'ok' | 'warn' | 'danger';

export type RiskSignal = {
  level: RiskLevel;
  code: string;
  message: string;
  field?: string;
};

export type RenderRowKind =
  | 'address'
  | 'amount'
  | 'timestamp'
  | 'bool'
  | 'bytes'
  | 'text';

export type RenderRow = {
  label: string;
  value: string;
  raw?: unknown;
  kind?: RenderRowKind;
  annotation?: string;
};

export type SchemaRender = {
  title: string;
  summary: string;
  rows: RenderRow[];
  signals: RiskSignal[];
};

export type RenderContext = {
  chainId: number;
  nowSec?: number;
  tokenInfo?: Map<string, { symbol?: string; decimals?: number }>;
  contractInfo?: Map<string, { name?: string }>;
};
