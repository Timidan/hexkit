// EarnAdapter port: SDK-neutral contract between the Earn shell and
// family-specific drivers. Shells see prepared steps and execution
// results; they never hold wallet-library objects.
import type {
  ChainDescriptor,
  ChainFamily,
  EvmChainDescriptor,
  SvmChainDescriptor,
} from "../../../chains/types";
import type {
  Address as EvmAddress,
  Calldata as EvmCalldata,
  EvmChainId,
  Hex as EvmHex,
} from "../../../chains/types/evm";
import type {
  PublicKey as SvmPublicKey,
  TransactionSignature as SvmTransactionSignature,
} from "../../../chains/types/svm";
import type { EarnVault } from "../../../components/integrations/lifi-earn/types";

/** A vault guaranteed to carry the chainKey of the descriptor it's scoped to. */
export type EarnVaultFor<T extends ChainDescriptor> = EarnVault & {
  chainKey: T["key"];
};

export type WalletAddressFor<T extends ChainDescriptor> =
  T extends EvmChainDescriptor ? EvmAddress :
  T extends SvmChainDescriptor ? SvmPublicKey :
  never;

/**
 * A family-typed token reference. EVM tokens carry a contract address;
 * Solana tokens carry a mint + optional ATA. Deliberately *not* unified —
 * pretending EVM and SPL tokens share a model hides real differences.
 */
export type EarnAssetRef<T extends ChainDescriptor> =
  T extends EvmChainDescriptor ? {
    kind: "native" | "erc20";
    chainKey: T["key"];
    address: EvmAddress;
    symbol: string;
    decimals: number;
    logoURI?: string;
  } :
  T extends SvmChainDescriptor ? {
    kind: "native" | "spl";
    chainKey: T["key"];
    mint: SvmPublicKey;
    symbol: string;
    decimals: number;
    logoURI?: string;
    ata?: SvmPublicKey | null;
  } :
  never;

export interface IdleAsset<T extends ChainDescriptor> {
  chain: T;
  owner: WalletAddressFor<T>;
  token: EarnAssetRef<T>;
  amountRaw: bigint;
  amountDecimal: string;
  amountUsd: number | null;
}

export type TxIdFor<T extends ChainDescriptor> =
  T extends EvmChainDescriptor ? EvmHex :
  T extends SvmChainDescriptor ? SvmTransactionSignature :
  never;

/**
 * Serializable transaction envelope. `submitTx` accepts it, so the shell
 * never holds wallet-SDK objects. EVM carries the raw tx fields; SVM
 * carries a base64-serialized transaction + version flag, which is how
 * `@solana/wallet-adapter` accepts pre-signed payloads.
 */
export type PreparedTxEnvelope<T extends ChainDescriptor> =
  T extends EvmChainDescriptor ? {
    family: "evm";
    chainId: EvmChainId;
    to: EvmAddress;
    data?: EvmCalldata;
    value?: bigint;
    gasLimit?: bigint;
  } :
  T extends SvmChainDescriptor ? {
    family: "svm";
    cluster: T["cluster"];
    serializedTransactionBase64: string;
    version: "legacy" | "v0";
  } :
  never;

export interface PreparedTx<T extends ChainDescriptor> {
  /** Unique id within a PreparedEarnAction — for UI keying and progress. */
  id: string;
  chain: T;
  kind:
    | "approval"
    | "swap"
    | "bridge"
    | "deposit"
    | "withdraw"
    | "ata-create"
    | "other";
  title: string;
  summary?: string;
  request: PreparedTxEnvelope<T>;
}

export interface ExecutionResult<T extends ChainDescriptor> {
  chain: T;
  txId: TxIdFor<T>;
  status: "submitted" | "confirmed" | "failed";
  explorerUrl: string | null;
  rawReceipt?: unknown;
}

/**
 * A prepared user action — e.g. a deposit consisting of (approval, deposit).
 * The shell renders `steps` sequentially, letting the adapter decide the
 * multi-tx choreography without exposing SDK primitives.
 */
export interface PreparedEarnAction<T extends ChainDescriptor> {
  type: "deposit" | "withdraw";
  chain: T;
  vault: EarnVaultFor<T>;
  assetIn: EarnAssetRef<T>;
  assetOut?: EarnAssetRef<T>;
  amountInRaw: bigint;
  amountOutRaw?: bigint | null;
  amountOutMinRaw?: bigint | null;
  amountInUsd?: number | null;
  amountOutUsd?: number | null;
  priceImpactBps?: number | null;
  steps: PreparedTx<T>[];
}

export interface FetchIdleBalancesArgs<T extends ChainDescriptor> {
  owner: WalletAddressFor<T>;
  vaults: readonly EarnVaultFor<T>[];
  signal?: AbortSignal;
}

export interface FetchTokenBalanceArgs<T extends ChainDescriptor> {
  chain: T;
  owner: WalletAddressFor<T>;
  token: EarnAssetRef<T>;
  signal?: AbortSignal;
}

export interface FetchTokenAllowanceArgs<T extends ChainDescriptor> {
  chain: T;
  owner: WalletAddressFor<T>;
  token: EarnAssetRef<T>;
  spender: WalletAddressFor<T>;
  signal?: AbortSignal;
}

export interface PrepareDepositArgs<T extends ChainDescriptor> {
  owner: WalletAddressFor<T>;
  receiver?: WalletAddressFor<T>;
  vault: EarnVaultFor<T>;
  tokenIn: EarnAssetRef<T>;
  amountInRaw: bigint;
  simulate?: boolean;
}

export interface PrepareWithdrawArgs<T extends ChainDescriptor> {
  owner: WalletAddressFor<T>;
  receiver?: WalletAddressFor<T>;
  vault: EarnVaultFor<T>;
  shareToken: EarnAssetRef<T>;
  tokenOut: EarnAssetRef<T>;
  amountInRaw: bigint;
  simulate?: boolean;
}

interface BaseEarnAdapter<T extends ChainDescriptor> {
  readonly family: T["chainFamily"];
  readonly supported: boolean;
  readonly unsupportedReason?: string;

  fetchIdleBalances(args: FetchIdleBalancesArgs<T>): Promise<IdleAsset<T>[]>;
  fetchTokenBalance(args: FetchTokenBalanceArgs<T>): Promise<bigint>;

  prepareDeposit(args: PrepareDepositArgs<T>): Promise<PreparedEarnAction<T>>;
  prepareWithdraw(args: PrepareWithdrawArgs<T>): Promise<PreparedEarnAction<T>>;

  submitTx(tx: PreparedTx<T>): Promise<ExecutionResult<T>>;
  waitForTx(
    tx: ExecutionResult<T>,
    options?: { timeoutMs?: number },
  ): Promise<ExecutionResult<T>>;

  explorerTxUrl(chain: T, txId: TxIdFor<T>): string | null;
}

/**
 * EVM-shaped adapter — requires explicit allowance checking for ERC20
 * spending. The shell renders an approval step before deposit when needed.
 */
export interface AllowanceEarnAdapter<T extends ChainDescriptor>
  extends BaseEarnAdapter<T> {
  readonly approvalModel: "allowance";
  fetchTokenAllowance(args: FetchTokenAllowanceArgs<T>): Promise<bigint>;
}

/**
 * SVM-shaped adapter — no allowance step; ATA creation is rolled into
 * `prepareDeposit`. Shell code that branches on approval skips the step
 * entirely for this family.
 */
export interface NoApprovalEarnAdapter<T extends ChainDescriptor>
  extends BaseEarnAdapter<T> {
  readonly approvalModel: "none";
  fetchTokenAllowance?: never;
}

export type EarnAdapter<T extends ChainDescriptor> =
  | AllowanceEarnAdapter<T>
  | NoApprovalEarnAdapter<T>;

export type AnyEarnAdapter = EarnAdapter<ChainDescriptor>;

/**
 * Registry shape per family. Null = adapter not registered / not supported.
 * Phase 5a exposes only EVM; Phase 5d adds an SVM stub; Phase 5e fills it in.
 */
export interface EarnAdapterRegistry {
  readonly evm: EarnAdapter<EvmChainDescriptor> | null;
  readonly starknet: null;
  readonly svm: EarnAdapter<SvmChainDescriptor> | null;
}

export function adapterFamilyLabel(family: ChainFamily): string {
  switch (family) {
    case "evm":
      return "EVM";
    case "starknet":
      return "Starknet";
    case "svm":
      return "Solana";
  }
}
