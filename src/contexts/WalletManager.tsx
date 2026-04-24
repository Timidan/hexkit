/**
 * Global wallet manager — state-only, no SDK imports. Each family's Bridge
 * component forwards connection changes here via `updateConnection` and
 * registers imperative handles so the top-bar picker can drive the SDK
 * without importing it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { ChainFamily } from "../chains/types";

export interface FamilyConnection {
  address: string;
  chainId?: string | number | null;
  connectorId?: string | null;
  connectorName?: string | null;
}

export interface FamilyBridgeHandles {
  /** Open the family's wallet picker UI (wagmi's RainbowKit modal, or our
   *  custom list). The bridge decides how to render it. */
  openPicker: () => void;
  /** Disconnect the currently-connected wallet for this family. */
  disconnect: () => void;
}

interface WalletManagerState {
  activeFamilies: ReadonlySet<ChainFamily>;
  connections: Readonly<Record<ChainFamily, FamilyConnection | null>>;
}

interface WalletManagerContextValue extends WalletManagerState {
  /** Ensures the family's provider is mounted. Called by the picker before
   *  triggering connect so the bridge exists to receive the request. */
  activateFamily: (family: ChainFamily) => void;
  /** Connect a family's wallet. Activates the family first, then opens the
   *  picker (bridge-side) on next tick so the SDK provider has mounted. */
  connect: (family: ChainFamily) => void;
  disconnect: (family: ChainFamily) => void;
  /** Used by Bridge components only. */
  registerBridge: (family: ChainFamily, handles: FamilyBridgeHandles) => void;
  unregisterBridge: (family: ChainFamily) => void;
  /** Used by Bridge components only. */
  updateConnection: (
    family: ChainFamily,
    connection: FamilyConnection | null,
  ) => void;
}

const WalletManagerContext = createContext<WalletManagerContextValue | null>(
  null,
);

const STORAGE_KEY = "hexkit.wallet.activeFamilies";
const FAMILIES: readonly ChainFamily[] = ["evm", "starknet", "svm"];

function readPersistedFamilies(): Set<ChainFamily> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((f): f is ChainFamily =>
      FAMILIES.includes(f as ChainFamily),
    ));
  } catch {
    return new Set();
  }
}

function writePersistedFamilies(families: ReadonlySet<ChainFamily>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...families]));
  } catch {
    // quota/private-mode — non-fatal
  }
}

const emptyConnections: Record<ChainFamily, FamilyConnection | null> = {
  evm: null,
  starknet: null,
  svm: null,
};

export function WalletManagerProvider({ children }: { children: ReactNode }) {
  const [activeFamilies, setActiveFamilies] = useState<Set<ChainFamily>>(() =>
    readPersistedFamilies(),
  );
  const [connections, setConnections] =
    useState<Record<ChainFamily, FamilyConnection | null>>(emptyConnections);

  const bridgesRef = useRef<Partial<Record<ChainFamily, FamilyBridgeHandles>>>(
    {},
  );
  // Connect intents that arrive before the bridge has lazy-loaded. Flushed
  // when registerBridge fires.
  const pendingConnectRef = useRef<Set<ChainFamily>>(new Set());

  const activateFamily = useCallback((family: ChainFamily) => {
    setActiveFamilies((prev) => {
      if (prev.has(family)) return prev;
      const next = new Set(prev);
      next.add(family);
      writePersistedFamilies(next);
      return next;
    });
  }, []);

  const connect = useCallback(
    (family: ChainFamily) => {
      activateFamily(family);
      const bridge = bridgesRef.current[family];
      if (bridge) {
        bridge.openPicker();
      } else {
        pendingConnectRef.current.add(family);
      }
    },
    [activateFamily],
  );

  const disconnect = useCallback((family: ChainFamily) => {
    const bridge = bridgesRef.current[family];
    if (bridge) bridge.disconnect();
  }, []);

  const registerBridge = useCallback(
    (family: ChainFamily, handles: FamilyBridgeHandles) => {
      bridgesRef.current[family] = handles;
      if (pendingConnectRef.current.has(family)) {
        pendingConnectRef.current.delete(family);
        handles.openPicker();
      }
    },
    [],
  );

  const unregisterBridge = useCallback((family: ChainFamily) => {
    delete bridgesRef.current[family];
  }, []);

  const updateConnection = useCallback(
    (family: ChainFamily, connection: FamilyConnection | null) => {
      setConnections((prev) => {
        // Shallow compare — SDKs re-emit identical state on focus/visibility.
        const existing = prev[family];
        if (
          existing?.address === connection?.address &&
          existing?.chainId === connection?.chainId &&
          existing?.connectorId === connection?.connectorId &&
          existing?.connectorName === connection?.connectorName
        ) {
          return prev;
        }
        return { ...prev, [family]: connection };
      });
    },
    [],
  );

  const value = useMemo<WalletManagerContextValue>(
    () => ({
      activeFamilies,
      connections,
      activateFamily,
      connect,
      disconnect,
      registerBridge,
      unregisterBridge,
      updateConnection,
    }),
    [
      activeFamilies,
      connections,
      activateFamily,
      connect,
      disconnect,
      registerBridge,
      unregisterBridge,
      updateConnection,
    ],
  );

  return (
    <WalletManagerContext.Provider value={value}>
      {children}
    </WalletManagerContext.Provider>
  );
}

export function useWalletManager(): WalletManagerContextValue {
  const ctx = useContext(WalletManagerContext);
  if (!ctx) {
    throw new Error(
      "useWalletManager must be used inside <WalletManagerProvider>",
    );
  }
  return ctx;
}

