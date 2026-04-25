/**
 * Starkzap-backed Starknet wallet client. One SDK instance handles Cartridge
 * natively via `sdk.connectCartridge()`; Argent X / Braavos browser
 * extensions are wrapped in a `WalletInterface` adapter so both flows share
 * the same pipeline. Pattern mirrors market-zap (onlyoneAlexia/market-zap).
 * Singleton; the StarknetBridge subscribes for state changes.
 */
import { StarkZap, type WalletInterface } from "starkzap";
import type { Account, Call, Signature } from "starknet";
import { RpcProvider } from "starknet";
import { networkConfigManager } from "@/config/networkConfig";

export type StarknetNetwork = "mainnet" | "sepolia";
export type StarknetProviderId = "argentX" | "braavos" | "cartridge";

export interface StarknetConnectionState {
  address: string | null;
  provider: StarknetProviderId | null;
  connecting: boolean;
  network: StarknetNetwork;
}

interface StarknetWindowWallet {
  account?: Account;
  selectedAddress?: string;
  enable: (options?: { starknetVersion?: string }) => Promise<string[]>;
}

const STORAGE_KEY = "hexkit.starknet.lastProvider";

const WINDOW_KEYS: Record<"argentX" | "braavos", string> = {
  argentX: "starknet_argentX",
  braavos: "starknet_braavos",
};

const DISPLAY_NAMES: Record<"argentX" | "braavos", string> = {
  argentX: "Argent X",
  braavos: "Braavos",
};

function getInjected(providerId: "argentX" | "braavos"): StarknetWindowWallet | null {
  const obj = (window as unknown as Record<string, unknown>)[WINDOW_KEYS[providerId]];
  if (obj && typeof obj === "object" && typeof (obj as StarknetWindowWallet).enable === "function") {
    return obj as StarknetWindowWallet;
  }
  return null;
}

async function waitForInjected(
  providerId: "argentX" | "braavos",
  { timeoutMs = 3000, intervalMs = 200 } = {},
): Promise<StarknetWindowWallet | null> {
  const existing = getInjected(providerId);
  if (existing) return existing;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const w = getInjected(providerId);
      if (w || Date.now() >= deadline) {
        clearInterval(timer);
        resolve(w);
      }
    }, intervalMs);
  });
}

function adaptInjectedAccount(account: Account, rpc: RpcProvider): WalletInterface {
  // Minimal WalletInterface adapter around a raw starknet.js Account.
  // Starkzap expects this shape; browser wallets handle fee estimation
  // themselves so we forward calls as-is without resourceBounds.
  return {
    address: account.address,
    getAccount: () => account,
    getProvider: () => rpc,
    execute: async (calls: Call[]) => {
      const result: any = await account.execute(calls as any);
      const txHash =
        result.hash ??
        result.transactionHash ??
        result.transaction_hash ??
        (typeof result === "string" ? result : "");
      if (!txHash) throw new Error("No transaction hash returned from wallet");
      return {
        transactionHash: txHash,
        wait: async () => {
          const receipt: any = await rpc.waitForTransaction(txHash);
          if (receipt.finality_status === "REJECTED" || receipt.finalityStatus === "REJECTED") {
            throw new Error("Transaction rejected before block inclusion");
          }
          const execStatus = receipt.execution_status ?? receipt.executionStatus;
          if (execStatus === "REVERTED") {
            throw new Error(receipt.revert_reason ?? receipt.revertReason ?? "Transaction reverted");
          }
        },
      } as any;
    },
    signMessage: async (typedData: any): Promise<Signature> => account.signMessage(typedData) as any,
    preflight: async () => ({ ok: true }) as any,
    ensureReady: async () => {},
    disconnect: async () => {},
  } as unknown as WalletInterface;
}

class StarkzapClient {
  private sdk: StarkZap | null = null;
  private sdkRpcUrl: string | null = null;
  private wallet: WalletInterface | null = null;
  private state: StarknetConnectionState = {
    address: null,
    provider: null,
    connecting: false,
    network: "mainnet",
  };
  private listeners = new Set<(s: StarknetConnectionState) => void>();

  constructor(network: StarknetNetwork = "mainnet") {
    this.state.network = network;
  }

  /** Rebuild the SDK when the resolved RPC URL changes. */
  private getSdk(): StarkZap {
    const { url } = networkConfigManager.resolveStarknetRpc(this.state.network);
    if (!this.sdk || this.sdkRpcUrl !== url) {
      this.sdk = new StarkZap({ network: this.state.network, rpcUrl: url });
      this.sdkRpcUrl = url;
    }
    return this.sdk;
  }

  currentRpcUrl(): string {
    return networkConfigManager.resolveStarknetRpc(this.state.network).url;
  }

  /** Drop the current SDK + wallet so the next connect uses a fresh RPC URL. */
  async reset(): Promise<void> {
    await this.disconnect();
    this.sdk = null;
    this.sdkRpcUrl = null;
  }

  subscribe(fn: (s: StarknetConnectionState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    this.listeners.forEach((fn) => fn({ ...this.state }));
  }

  private setState(patch: Partial<StarknetConnectionState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private rememberProvider(id: StarknetProviderId) {
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }

  private forgetProvider() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }

  /** Connect via Cartridge Controller (Starkzap native path). */
  async connectCartridge(options?: {
    policies?: Array<{ target: string; method: string }>;
    preset?: string;
    url?: string;
  }): Promise<void> {
    this.setState({ connecting: true });
    try {
      const sdk = this.getSdk();
      const w = await sdk.connectCartridge({
        ...(options ?? {}),
        // Cartridge handles fees via its own controller session.
        feeMode: "user_pays",
      });
      this.wallet = w;
      this.rememberProvider("cartridge");
      this.setState({
        address: w.address.toString(),
        provider: "cartridge",
        connecting: false,
      });
    } catch (err) {
      this.setState({ connecting: false });
      throw err;
    }
  }

  /** Connect via an injected browser wallet (Argent X or Braavos). */
  async connectBrowserWallet(providerId: "argentX" | "braavos"): Promise<void> {
    this.setState({ connecting: true });
    try {
      const injected = await waitForInjected(providerId);
      if (!injected) {
        throw new Error(
          `${DISPLAY_NAMES[providerId]} extension not detected. Install it and refresh the page.`,
        );
      }
      if (!injected.account || !injected.selectedAddress) {
        await injected.enable();
      }
      if (!injected.account || !injected.selectedAddress) {
        throw new Error("Wallet connection was rejected or failed");
      }
      const sdk = this.getSdk();
      const rpc = sdk.getProvider() as unknown as RpcProvider;
      // Network check deferred to the tool layer — connecting the wallet
      // shouldn't fail just because the user is on a chain we haven't
      // primed for yet. Tools that need a specific chain can read
      // `wallet.getProvider().getChainId()` and prompt to switch.
      this.wallet = adaptInjectedAccount(injected.account, rpc);
      this.rememberProvider(providerId);
      this.setState({
        address: injected.selectedAddress,
        provider: providerId,
        connecting: false,
      });
    } catch (err) {
      this.setState({ connecting: false });
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.wallet) {
      try {
        await this.wallet.disconnect();
      } catch {}
    }
    this.wallet = null;
    this.forgetProvider();
    this.setState({ address: null, provider: null, connecting: false });
  }

}

let singleton: StarkzapClient | null = null;

export function getStarkzapClient(): StarkzapClient {
  if (!singleton) {
    singleton = new StarkzapClient();
  }
  return singleton;
}

export type { StarkzapClient };
