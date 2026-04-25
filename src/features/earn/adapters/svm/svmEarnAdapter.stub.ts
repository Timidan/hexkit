// Stub until LI.FI's Composer returns SVM vault routes. Replace this file
// with a real implementation; keep the module path so the provider wiring
// doesn't change.
import type { SvmChainDescriptor } from "../../../../chains/types";
import type {
  EarnAdapter,
  ExecutionResult,
  FetchIdleBalancesArgs,
  FetchTokenBalanceArgs,
  IdleAsset,
  PreparedEarnAction,
  PreparedTx,
  PrepareDepositArgs,
  PrepareWithdrawArgs,
  NoApprovalEarnAdapter,
} from "../../adapter/types";

const STUB_REASON =
  "Solana vault support isn't shipping yet. LI.FI Earn currently indexes EVM pools only; this surface will light up when Solana routes land.";

const notSupported = (method: string): Error =>
  new Error(`[SvmEarnAdapter.${method}] ${STUB_REASON}`);

export function buildSvmEarnAdapterStub(): EarnAdapter<SvmChainDescriptor> {
  const adapter: NoApprovalEarnAdapter<SvmChainDescriptor> = {
    family: "svm",
    supported: false,
    unsupportedReason: STUB_REASON,
    approvalModel: "none",

    async fetchIdleBalances(
      _args: FetchIdleBalancesArgs<SvmChainDescriptor>,
    ): Promise<IdleAsset<SvmChainDescriptor>[]> {
      throw notSupported("fetchIdleBalances");
    },

    async fetchTokenBalance(
      _args: FetchTokenBalanceArgs<SvmChainDescriptor>,
    ): Promise<bigint> {
      throw notSupported("fetchTokenBalance");
    },

    async prepareDeposit(
      _args: PrepareDepositArgs<SvmChainDescriptor>,
    ): Promise<PreparedEarnAction<SvmChainDescriptor>> {
      throw notSupported("prepareDeposit");
    },

    async prepareWithdraw(
      _args: PrepareWithdrawArgs<SvmChainDescriptor>,
    ): Promise<PreparedEarnAction<SvmChainDescriptor>> {
      throw notSupported("prepareWithdraw");
    },

    async submitTx(
      _tx: PreparedTx<SvmChainDescriptor>,
    ): Promise<ExecutionResult<SvmChainDescriptor>> {
      throw notSupported("submitTx");
    },

    async waitForTx(
      result: ExecutionResult<SvmChainDescriptor>,
    ): Promise<ExecutionResult<SvmChainDescriptor>> {
      return result;
    },

    explorerTxUrl() {
      return null;
    },
  };

  return adapter;
}
