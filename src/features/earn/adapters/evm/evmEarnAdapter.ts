// Adapter closure captures the wagmi config the provider injects. Safe
// because wagmi config is stable for a mount lifetime; a family switch
// re-mounts the provider which builds a fresh adapter.
import type { Config } from "wagmi";
import type { EvmChainDescriptor } from "../../../../chains/types";
import type {
  AllowanceEarnAdapter,
  EarnAdapter,
  ExecutionResult,
  FetchIdleBalancesArgs,
  FetchTokenAllowanceArgs,
  FetchTokenBalanceArgs,
  IdleAsset,
  PreparedEarnAction,
  PreparedTx,
  PrepareDepositArgs,
  PrepareWithdrawArgs,
} from "../../adapter/types";
import type { Hex } from "../../../../chains/types/evm";
import { fetchEvmTokenAllowance, fetchEvmTokenBalance } from "./evmReads";
import { evmExplorerTxUrl } from "./evmExplorer";
import { prepareEvmDeposit, prepareEvmWithdraw } from "./evmPrepare";
import { submitEvmTx, waitForEvmTxReceipt } from "./evmSubmit";

export interface EvmEarnAdapterDeps {
  /** Connected wallet address, if any. Null when disconnected. */
  connectedAddress: string | null;
  /** wagmi config used for sendTransaction / waitForTransactionReceipt.
   *  Null means the provider was mounted outside a WagmiProvider — only
   *  the read methods remain functional. */
  config: Config | null;
}

export function buildEvmEarnAdapter(
  deps: EvmEarnAdapterDeps,
): EarnAdapter<EvmChainDescriptor> {
  const { config } = deps;

  const requireConfig = (method: string): Config => {
    if (!config) {
      throw new Error(
        `[EvmEarnAdapter.${method}] wagmi config unavailable — did the family provider mount outside a WagmiProvider?`,
      );
    }
    return config;
  };

  const adapter: AllowanceEarnAdapter<EvmChainDescriptor> = {
    family: "evm",
    supported: true,
    approvalModel: "allowance",

    async fetchIdleBalances(
      _args: FetchIdleBalancesArgs<EvmChainDescriptor>,
    ): Promise<IdleAsset<EvmChainDescriptor>[]> {
      // Today the shell calls adapters/evm/idleScan.ts directly via the
      // concierge hook. When shell files move into src/features/earn/shell,
      // this method becomes the entry point and returns the family-typed
      // IdleAsset<T>. Explicitly not-yet wired to avoid a type-shape split
      // while the legacy shape is still in use.
      throw new Error(
        "[EvmEarnAdapter.fetchIdleBalances] not wired — the concierge hook still calls scanEvmChainBalances directly. Route through here once IdleAsset<T> replaces the legacy shape.",
      );
    },

    async fetchTokenBalance(
      args: FetchTokenBalanceArgs<EvmChainDescriptor>,
    ): Promise<bigint> {
      return fetchEvmTokenBalance(
        args.chain.chainId as number,
        args.token.address,
        args.owner,
      );
    },

    async fetchTokenAllowance(
      args: FetchTokenAllowanceArgs<EvmChainDescriptor>,
    ): Promise<bigint> {
      return fetchEvmTokenAllowance(
        args.chain.chainId as number,
        args.token.address,
        args.owner,
        args.spender,
      );
    },

    prepareDeposit(
      args: PrepareDepositArgs<EvmChainDescriptor>,
    ): Promise<PreparedEarnAction<EvmChainDescriptor>> {
      return prepareEvmDeposit(args);
    },

    prepareWithdraw(
      args: PrepareWithdrawArgs<EvmChainDescriptor>,
    ): Promise<PreparedEarnAction<EvmChainDescriptor>> {
      return prepareEvmWithdraw(args);
    },

    async submitTx(
      tx: PreparedTx<EvmChainDescriptor>,
    ): Promise<ExecutionResult<EvmChainDescriptor>> {
      const cfg = requireConfig("submitTx");
      return submitEvmTx({ config: cfg }, tx);
    },

    async waitForTx(
      result: ExecutionResult<EvmChainDescriptor>,
      options,
    ): Promise<ExecutionResult<EvmChainDescriptor>> {
      const cfg = requireConfig("waitForTx");
      return waitForEvmTxReceipt({ config: cfg }, result, options);
    },

    explorerTxUrl(chain, txId) {
      return evmExplorerTxUrl(chain, txId as Hex);
    },
  };

  return adapter;
}
