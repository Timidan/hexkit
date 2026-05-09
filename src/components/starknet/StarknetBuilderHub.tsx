/**
 * Starknet Builder Hub. Mirrors EVM's TransactionBuilderHub chrome while
 * routing live wallet invokes and bridge-driven simulations through Starknet
 * clients.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Label } from "../ui/label";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  StarknetTypedInputs,
  buildInitialParamValues,
  formatFeltsForTextarea,
  type ParamValueMap,
} from "./StarknetTypedInputs";
import {
  NETWORK_STORAGE_KEYS,
  STARKNET_DEFAULT_NETWORK,
  STARKNET_NETWORKS,
  STARKNET_SEPOLIA_SYNTHETIC_ID,
  type ExtendedChain,
} from "../shared/NetworkSelector";
import { renderModeToggle } from "../transaction-builder/renderModeToggle";
import { LayoutTransitionWrapper } from "../ui/animated-tabs";
import type { SimulationViewMode } from "../transaction-builder/types";
import { useWalletManager } from "../../contexts/WalletManager";
import { getStarkzapClient } from "@/chains/starknet/starkzapClient";
import { StarknetSimulator } from "@/chains/starknet/simulatorClient";
import type { SimulatePrepareStatus, SimulateResponse } from "@/chains/starknet/simulatorTypes";
import type { StarknetNetwork } from "@/config/networkConfig";
import { useStarknetSimulation } from "@/contexts/StarknetSimulationContext";
import { generateStarknetSimulationId } from "@/services/StarknetSimulationHistoryService";
import {
  fetchClassInfo,
  type ClassInfo,
} from "@/components/starknet-simulation-results/CallTreeTab";
import { ClockCountdown } from "@phosphor-icons/react";
import TxTraceView from "./TxTraceView";
import BridgeErrorAlert from "./BridgeErrorAlert";
import StarknetContractColumn from "./StarknetContractColumn";
import StarknetSimulationOverridesSidebar from "./StarknetSimulationOverridesSidebar";
import {
  buildInvokeRequest,
  DEFAULT_INVOKE_FORM,
  type InvokeFormState,
} from "./invokeRequestBuilder";
import { hash as starknetHash, RpcProvider, CallData } from "starknet";
import { networkConfigManager } from "@/config/networkConfig";
import { mapWalletError, type MappedWalletError } from "@/chains/starknet/walletErrorMap";
import {
  detectStarknetTokenType,
  fetchStarknetErc20Meta,
  type StarknetTokenType,
  type StarknetErc20Meta,
} from "@/chains/starknet/tokenDetection";
import {
  Field,
  FunctionRawToggle,
  formatDecodedReturn,
  shortenAddress,
  type FunctionMode,
} from "./StarknetBuilderHubShared";

// URL contract — mirrors EVM's TransactionBuilderHub exactly:
//   ?mode=live       → wallet form
//   ?mode=simulation → simulation, default sub-mode = builder (Manual/Project)
//   ?mode=replay     → simulation, sub-mode = replay (alias used by /starknet/simulations
//                      redirect and by deep-link entry from "Re-Trace" recents)
//
// The Live | Simulation pill is rendered by Navigation.tsx (the family-aware
// pill row's `subTabs` for the `builder` tool); this hub no longer renders
// its own mode toggle inside the body. The internal Manual/Project · Transaction
// Replay strip is the literal EVM `renderModeToggle` so the chrome is byte-
// identical across families.
type IntentMode = "live" | "simulation" | "replay";
const VALID_INTENT_MODES: IntentMode[] = ["live", "simulation", "replay"];
function parseIntentMode(value: string | null | undefined): IntentMode | null {
  return VALID_INTENT_MODES.includes(value as IntentMode) ? (value as IntentMode) : null;
}

function isNeutralSender(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return BigInt(raw.trim()) === 1n;
  } catch {
    return false;
  }
}

function readPersistedNetwork(): ExtendedChain {
  if (typeof window === "undefined") return STARKNET_DEFAULT_NETWORK;
  try {
    const raw = window.localStorage.getItem(NETWORK_STORAGE_KEYS.starknet);
    if (!raw) return STARKNET_DEFAULT_NETWORK;
    const parsed = JSON.parse(raw) as { id?: number };
    const found = STARKNET_NETWORKS.find((n) => n.id === parsed.id);
    return found ?? STARKNET_DEFAULT_NETWORK;
  } catch {
    return STARKNET_DEFAULT_NETWORK;
  }
}

function persistNetwork(network: ExtendedChain) {
  try {
    window.localStorage.setItem(
      NETWORK_STORAGE_KEYS.starknet,
      JSON.stringify({ id: network.id, name: network.name }),
    );
  } catch {
    /* private mode / quota — non-fatal */
  }
}

const StarknetBuilderHub: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { connections, connect } = useWalletManager();
  const starknetConnection = connections.starknet;

  const params = useMemo(
    () => new URLSearchParams(location.search),
    [location.search],
  );

  // URL → top-level + sub-mode resolution (EVM contract):
  //   ?mode=live       → top="live"
  //   ?mode=simulation → top="simulation", view="builder" (Manual/Project)
  //   ?mode=replay     → top="simulation", view="replay"
  //   anything else / missing → top="simulation", view="replay" (preserves
  //     the legacy /starknet/simulations landing experience for redirected users).
  const intent = parseIntentMode(params.get("mode"));
  const isLive = intent === "live";
  const initialViewMode: SimulationViewMode =
    intent === "simulation" && params.get("sim") !== "replay"
      ? "builder"
      : "replay";
  const [viewMode, setViewMode] = useState<SimulationViewMode>(initialViewMode);

  // Manual sim form state — lifted to the hub so the new
  // <StarknetSimulationOverridesSidebar> on the right column can drive the
  // same form the Manual sub-tab on the left renders. Survives
  // ?mode=live ↔ ?mode=simulation toggling so users don't lose work.
  const [manualForm, setManualForm] =
    useState<InvokeFormState>(DEFAULT_INVOKE_FORM);

  // Re-sync sub-mode if the URL flips between simulation/replay externally.
  useEffect(() => {
    if (intent === "simulation") {
      setViewMode(params.get("sim") === "replay" ? "replay" : "builder");
    } else if (intent === "replay") setViewMode("replay");
  }, [intent, params]);

  const [selectedNetwork, setSelectedNetwork] =
    useState<ExtendedChain>(readPersistedNetwork);

  const handleNetworkChange = useCallback((network: ExtendedChain) => {
    setSelectedNetwork(network);
    persistNetwork(network);
  }, []);

  // Cross-tab sync: when a sibling tab updates the persisted Starknet
  // network, mirror the choice here so the picker doesn't drift between
  // tabs. The browser only fires `storage` events on tabs other than the
  // one that performed the write, so there's no echo loop with the local
  // `persistNetwork` call above.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: StorageEvent) => {
      if (event.key !== NETWORK_STORAGE_KEYS.starknet) return;
      if (!event.newValue) {
        setSelectedNetwork(STARKNET_DEFAULT_NETWORK);
        return;
      }
      try {
        const parsed = JSON.parse(event.newValue) as { id?: number };
        const found = STARKNET_NETWORKS.find((n) => n.id === parsed.id);
        if (found) setSelectedNetwork(found);
      } catch {
        /* malformed sibling write — ignore */
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Map the picker's synthetic ExtendedChain id back to the
  // bridge-facing network kind. Threaded into both the trace + manual
  // sim call sites so the simulator client sets `X-Starknet-Rpc-Url`
  // from `networkConfigManager.resolveStarknetRpc(network)`. This is
  // what wires the picker into the actual bridge RPC selection.
  const network: StarknetNetwork =
    selectedNetwork.id === STARKNET_SEPOLIA_SYNTHETIC_ID ? "sepolia" : "mainnet";

  // Internal sub-mode toggle — writes back to the `?mode=` URL alias so the
  // browser back-button + bookmarks stay accurate. EVM contract: switching
  // to Manual/Project sets ?mode=simulation, switching to Replay sets
  // ?mode=replay. The Live ↔ Simulation switch itself is owned by the
  // Navigation pill — we don't drive it here.
  const handleViewModeChange = useCallback(
    (next: SimulationViewMode) => {
      setViewMode(next);
      const np = new URLSearchParams(location.search);
      np.set("mode", next === "replay" ? "replay" : "simulation");
      // Clear any stale ?sim= from the legacy URL contract on first nav.
      np.delete("sim");
      navigate(
        { pathname: location.pathname, search: `?${np.toString()}` },
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  // Body composition mirrors EVM's TransactionBuilderHub: NO inline
  // Live | Simulation toggle (the Navigation pill's `subTabs` for the
  // `builder` tool already handles that via `?mode=`). Inside Simulation,
  // the literal EVM `renderModeToggle` carries the Manual/Project ·
  // Transaction Replay strip — same chrome on both families.
  // Match EVM TransactionBuilderHub grid:
  //   Live mode               → single 600px-max column
  //   Simulation / Manual     → 1fr + 380px overrides sidebar, 1100px-max
  //   Simulation / Replay     → single 600px-max column (TxTraceView is its
  //                              own surface; EVM's TransactionReplayView
  //                              doesn't get the sidebar either).
  //
  // The container is centered so the form doesn't hug full-width on the
  // ultrawide-monitor case the user flagged. EVM uses inline styles for
  // these (see simple-grid/buildGridContextValue.ts) — we mirror that
  // exactly rather than inventing new tailwind classes.
  const isSimulationLayout = !isLive && viewMode === "builder";
  // Single max-width-centered shell. For Manual sub-mode the inner stack
  // is a 2-column grid (form + sidebar @ 380px); for Live + Replay it's a
  // single column. `marginInline: auto` is the load-bearing centering rule
  // — `display: flex + justifyContent: center` on a parent was unreliable
  // here because the parent (`PersistentTools`) wraps each panel in a
  // `width: 100%` block, so flex children stretched to full width.
  const shellStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: isSimulationLayout ? "1100px" : "720px",
    marginInline: "auto",
  };
  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isSimulationLayout ? "1fr 380px" : "1fr",
    gap: "20px",
    width: "100%",
  };

  // EVM parity: build the Manual/Project · Transaction Replay strip ONCE here
  // and hand it down as a prop so each form Card renders it as its first
  // child (same y as the sidebar's section header). The hub no longer
  // renders the strip outside the cards.
  const modeToggle = renderModeToggle(viewMode, handleViewModeChange);

  return (
    <div className="transaction-builder-hub px-1 py-2 sm:px-3 sm:py-3 space-y-3">
      {/* Outer transition: Live ↔ Simulation. Mirrors EVM TransactionBuilderHub
          line 130 (`<LayoutTransitionWrapper activeKey={mode}>`). */}
      <LayoutTransitionWrapper activeKey={isLive ? "live" : "simulation"}>
        <div style={shellStyle}>
          <div style={gridStyle}>
            {/* Left column — form */}
            <div className="space-y-3">
              {/* History entry now lives inside the Manual sim card's
                  header (top-right of the mode toggle), matching the
                  EVM ContractColumn placement. The standalone wrapper
                  that used to sit above the card has been removed. */}
              {isLive ? (
                <StarknetLiveForm
                  network={selectedNetwork}
                  onNetworkChange={handleNetworkChange}
                  bridgeNetwork={network}
                  connection={starknetConnection}
                  onConnectClick={() => connect("starknet")}
                />
              ) : (
                /* Inner transition: Manual ↔ Replay. Mirrors EVM
                   TransactionBuilderWagmi line 345. */
                <LayoutTransitionWrapper activeKey={viewMode}>
                  {viewMode === "builder" ? (
                    <StarknetManualSimForm
                      modeToggle={modeToggle}
                      network={network}
                      selectedNetwork={selectedNetwork}
                      onNetworkChange={handleNetworkChange}
                      form={manualForm}
                      onFormChange={setManualForm}
                    />
                  ) : (
                    <TxTraceView
                      modeToggle={modeToggle}
                      network={network}
                      selectedNetwork={selectedNetwork}
                      onNetworkChange={handleNetworkChange}
                      initialTxHash={params.get("txHash")}
                      onTxHashCommit={(hash) => {
                        const np = new URLSearchParams(location.search);
                        np.set("mode", "replay");
                        np.delete("sim");
                        if (hash) np.set("txHash", hash);
                        else np.delete("txHash");
                        navigate(
                          { pathname: location.pathname, search: `?${np.toString()}` },
                          { replace: true },
                        );
                      }}
                    />
                  )}
                </LayoutTransitionWrapper>
              )}
            </div>

            {/* Right column — Simulation Overrides sidebar (sim/builder only) */}
            {isSimulationLayout && (
              <StarknetSimulationOverridesSidebar
                viewMode={viewMode}
                form={manualForm}
                onFormChange={setManualForm}
              />
            )}
          </div>
        </div>
      </LayoutTransitionWrapper>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared address → class resolver for both Live + Manual forms.
// Address → classHash via `RpcProvider.getClassHashAt` (client-side, using
// the same RPC the bridge would). classHash → ABI/contractName via the
// existing `fetchClassInfo` helper, which hits the bridge `/class` endpoint.
// ---------------------------------------------------------------------------

interface ResolvedClass {
  classHash: string;
  contractName?: string;
  abi?: ClassInfo["abi"];
  classInfo: ClassInfo;
  /** Detected EVM-equivalent token-type label, or `null` when the
   *  contract isn't recognised as ERC-20/721/1155. */
  tokenType: StarknetTokenType;
  /** Live `name`/`symbol`/`decimals` snapshot — only populated for
   *  `tokenType === "erc20"`. All fields are optional; partial decodes
   *  surface whatever succeeded. */
  tokenMeta?: StarknetErc20Meta;
}

async function resolveAddressToClass(
  address: string,
  network: StarknetNetwork,
): Promise<ResolvedClass> {
  const trimmed = address.trim();
  if (!trimmed.startsWith("0x")) {
    throw new Error("Contract address must be a 0x-prefixed felt.");
  }
  const { url } = networkConfigManager.resolveStarknetRpc(network);
  const provider = new RpcProvider({ nodeUrl: url });
  const classHash = await provider.getClassHashAt(trimmed);
  const info = await fetchClassInfo(classHash, network);
  // Try to surface a friendly name from the ABI (Cairo 1: `interface` items
  // carry a fully-qualified path). We just take the last `::` segment.
  let contractName: string | undefined;
  if (Array.isArray(info?.abi)) {
    const iface = info.abi.find(
      (i) =>
        (i as { type?: string }).type === "interface" &&
        typeof (i as { name?: string }).name === "string",
    ) as { name?: string } | undefined;
    if (iface?.name) {
      contractName = iface.name.split("::").pop();
    }
  }
  // Token-type detection (pure) + live ERC-20 meta fetch (impure, opt-in).
  // Mirrors EVM's "loaded contract → badge + name/symbol/decimals" gesture.
  const detection = detectStarknetTokenType(info?.abi ?? null);
  let tokenMeta: StarknetErc20Meta | undefined;
  if (detection.type === "erc20" && Array.isArray(info?.abi)) {
    try {
      tokenMeta = await fetchStarknetErc20Meta(provider, trimmed, info.abi);
    } catch {
      tokenMeta = undefined;
    }
  }
  return {
    classHash,
    contractName,
    abi: info?.abi ?? undefined,
    classInfo: info,
    tokenType: detection.type,
    tokenMeta,
  };
}

// Walk a class ABI into a flat list of invoke-able entry points (external/view).
// Mirrors the walker inside StarknetManualSimForm — extracted so Live can use
// the same dropdown after a class resolves.
//
// `stateMutability` is surfaced so the Live form can mirror EVM's "wallet not
// connected" gate, which only renders for write functions. In Cairo 1 ABIs the
// raw field is `state_mutability: "view" | "external"`. In Cairo 0 ABIs the
// item's `type` is literally `"view"` for reads — we capture both signals into
// a single `isView` boolean.
interface ClassEntryPointEntry {
  selector: string;
  name?: string;
  inputs?: { name: string; type: string }[];
  /** Raw `state_mutability` value if present on the ABI item (Cairo 1). */
  stateMutability?: string;
  /** True when the entry point is read-only. Mirrors EVM's
   *  `stateMutability === "view" || "pure"` predicate. */
  isView: boolean;
}

function flattenEntryPoints(info: ClassInfo | null): ClassEntryPointEntry[] {
  if (!info) return [];
  const out: ClassEntryPointEntry[] = [];
  const walk = (items: NonNullable<ClassInfo["abi"]>): void => {
    items.forEach((item) => {
      if (
        item.type === "function" ||
        item.type === "external" ||
        item.type === "view"
      ) {
        let sel = "";
        try {
          sel = starknetHash.getSelectorFromName(
            (item as { name: string }).name,
          );
        } catch {
          sel = "";
        }
        const stateMutability = (item as { state_mutability?: string })
          .state_mutability;
        // A Cairo function is a *view* when either the Cairo 1
        // `state_mutability` field equals "view", or the Cairo 0 item's
        // `type` is literally "view". Anything else (including absent) is
        // treated as a write.
        const isView =
          stateMutability === "view" || item.type === "view";
        out.push({
          selector: sel,
          name: (item as { name: string }).name,
          inputs: (item as { inputs?: { name: string; type: string }[] })
            .inputs,
          stateMutability,
          isView,
        });
      } else if (
        (item.type === "interface" || item.type === "impl") &&
        Array.isArray((item as { items?: unknown[] }).items)
      ) {
        walk((item as { items: NonNullable<ClassInfo["abi"]> }).items);
      }
    });
  };
  if (Array.isArray(info.abi)) walk(info.abi);
  return out;
}

// ---------------------------------------------------------------------------
// Live form — single-call INVOKE through starkzap.execute()
// ---------------------------------------------------------------------------

interface LiveFormProps {
  network: ExtendedChain;
  onNetworkChange: (network: ExtendedChain) => void;
  /** Bridge-facing network kind — drives the RPC URL used to resolve
   *  `address → classHash`. */
  bridgeNetwork: StarknetNetwork;
  connection: ReturnType<typeof useWalletManager>["connections"]["starknet"];
  onConnectClick: () => void;
}

const StarknetLiveForm: React.FC<LiveFormProps> = ({
  network,
  onNetworkChange,
  bridgeNetwork,
  connection,
  onConnectClick,
}) => {
  const client = useMemo(() => getStarkzapClient(), []);
  const [contractAddress, setContractAddress] = useState("");
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [classHash, setClassHash] = useState<string | undefined>(undefined);
  const [contractName, setContractName] = useState<string | undefined>(undefined);
  const [tokenType, setTokenType] = useState<StarknetTokenType>(null);
  const [tokenMeta, setTokenMeta] = useState<StarknetErc20Meta | undefined>(
    undefined,
  );
  const [classError, setClassError] = useState<string | null>(null);
  const [classPending, setClassPending] = useState(false);

  const [functionMode, setFunctionModeState] = useState<FunctionMode>("function");
  const [selectedFunctionType, setSelectedFunctionType] = useState<"read" | "write">("read");
  const [selectedSelector, setSelectedSelector] = useState<string>("");
  const [entryPointName, setEntryPointName] = useState<string>("");
  const [calldataRaw, setCalldataRaw] = useState("");
  const [paramValues, setParamValues] = useState<ParamValueMap>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<MappedWalletError | null>(null);
  const [success, setSuccess] = useState<{ txHash: string } | null>(null);
  // Read-call result — populated when the user clicks "Call" on a view fn.
  // Read fns use `RpcProvider.callContract` (no wallet, no signature, no
  // gas) instead of going through `starkzap.execute()`. We keep the raw
  // felts AND the decoded JS shape (parsed via `new CallData(abi).parse`)
  // so the panel can show both — same Decoded/Raw split EDB uses.
  // Cleared on every address / entry-point change so stale results don't
  // stick. `decodeError` carries a human-readable note when the ABI
  // didn't ship enough info to parse the response.
  const [readResult, setReadResult] = useState<
    | { raw: string[]; decoded?: unknown; decodeError?: string }
    | null
  >(null);
  const [readPending, setReadPending] = useState(false);
  // Tracks whether the user has manually picked a mode — once they have,
  // we stop auto-switching on ABI fetch retries (otherwise a transient
  // failure would yank them back into Raw mode after they intentionally
  // chose Function, and vice versa).
  const userPickedModeRef = React.useRef(false);
  const setFunctionMode = useCallback((next: FunctionMode) => {
    userPickedModeRef.current = true;
    setFunctionModeState(next);
  }, []);

  const setValidationError = useCallback((message: string) => {
    setError({ title: "Check your inputs", message, isUserRejected: false });
  }, []);

  const entryPoints = useMemo(
    () => flattenEntryPoints(classInfo),
    [classInfo],
  );

  // Mirrors EVM's `filteredReadFunctions` / `filteredWriteFunctions` split
  // (FunctionTypeSection.tsx:359-376). Cairo equivalent: state_mutability
  // === "view" || item.type === "view" ⇒ Read.
  const readEntryPoints = useMemo(
    () => entryPoints.filter((ep) => ep.isView),
    [entryPoints],
  );
  const writeEntryPoints = useMemo(
    () => entryPoints.filter((ep) => !ep.isView),
    [entryPoints],
  );

  // EVM parity gates — match the conditional-render rules the EVM
  // SimpleGridUI uses to hide everything below the address column until the
  // ABI loads (or the fetch resolves into an explicit failure that bumps
  // the user into Raw mode).
  const abiAvailable = Boolean(
    classInfo && Array.isArray(classInfo.abi) && entryPoints.length > 0,
  );
  const showFunctionSection = abiAvailable || (classError && !classPending);

  // Default the read/write tab on every fresh class load: prefer Read if any
  // exist, otherwise Write. Also reset whenever the contract address changes
  // so a brand-new class doesn't inherit the prior contract's tab.
  useEffect(() => {
    if (readEntryPoints.length > 0) {
      setSelectedFunctionType("read");
      setSelectedSelector(readEntryPoints[0]?.selector ?? "");
    } else if (writeEntryPoints.length > 0) {
      setSelectedFunctionType("write");
      setSelectedSelector(writeEntryPoints[0]?.selector ?? "");
    }
  }, [classInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the "user picked" flag whenever the address itself changes — a
  // brand-new contract gets fresh defaults.
  useEffect(() => {
    userPickedModeRef.current = false;
  }, [contractAddress]);

  // When the ABI fetch resolves, default to Function (ABI present) or Raw
  // (fetch failed). User overrides via the radio click bypass this.
  useEffect(() => {
    if (userPickedModeRef.current) return;
    if (classError && !classPending) setFunctionModeState("raw");
    else if (abiAvailable) setFunctionModeState("function");
  }, [classError, classPending, abiAvailable]);

  const handleAddressChange = useCallback((next: string) => {
    setContractAddress(next);
    // Invalidate any previously resolved class info if the user edits the
    // address. The fetch button will repopulate.
    setClassInfo(null);
    setClassHash(undefined);
    setContractName(undefined);
    setTokenType(null);
    setTokenMeta(undefined);
    setClassError(null);
    setSelectedSelector("");
    setEntryPointName("");
  }, []);

  const onFetchClass = useCallback(async () => {
    setClassError(null);
    setClassPending(true);
    try {
      const resolved = await resolveAddressToClass(
        contractAddress,
        bridgeNetwork,
      );
      setClassInfo(resolved.classInfo);
      setClassHash(resolved.classHash);
      setContractName(resolved.contractName);
      setTokenType(resolved.tokenType);
      setTokenMeta(resolved.tokenMeta);
    } catch (err) {
      setClassError(err instanceof Error ? err.message : String(err));
      setClassInfo(null);
      setClassHash(undefined);
      setContractName(undefined);
      setTokenType(null);
      setTokenMeta(undefined);
    } finally {
      setClassPending(false);
    }
  }, [contractAddress, bridgeNetwork]);

  const runRead = useCallback(async () => {
    setError(null);
    setReadResult(null);
    if (!contractAddress.trim().startsWith("0x")) {
      setValidationError("Contract address must be a 0x-prefixed felt.");
      return;
    }
    const epName = selectedSelector
      ? entryPoints.find((ep) => ep.selector === selectedSelector)?.name ?? ""
      : entryPointName.trim();
    if (!epName) {
      setValidationError("Entry-point name is required.");
      return;
    }
    const calldata = calldataRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setReadPending(true);
    try {
      const { url } = networkConfigManager.resolveStarknetRpc(bridgeNetwork);
      const provider = new RpcProvider({ nodeUrl: url });
      const raw = await provider.callContract({
        contractAddress: contractAddress.trim(),
        entrypoint: epName,
        calldata,
      });
      // Decode via the loaded ABI when we have it. `CallData.parse` uses
      // the function's `outputs` schema to walk the felt response and
      // emit a typed JS value (string for ByteArray, bigint for u256,
      // nested objects for structs, etc.). When parsing fails (no ABI,
      // or a shape we can't decode) we fall through and surface the
      // raw felts only — never throw at the user.
      let decoded: unknown;
      let decodeError: string | undefined;
      if (classInfo?.abi) {
        try {
          decoded = new CallData(classInfo.abi).parse(epName, raw);
        } catch (err) {
          decodeError = err instanceof Error ? err.message : String(err);
        }
      }
      setReadResult({ raw, decoded, decodeError });
    } catch (err) {
      setError(mapWalletError(err));
    } finally {
      setReadPending(false);
    }
  }, [
    contractAddress,
    selectedSelector,
    entryPoints,
    entryPointName,
    calldataRaw,
    bridgeNetwork,
    classInfo,
    setValidationError,
  ]);

  const submit = useCallback(async () => {
    setError(null);
    setSuccess(null);
    if (!contractAddress.trim().startsWith("0x")) {
      setValidationError("Contract address must be a 0x-prefixed felt.");
      return;
    }
    // Prefer the dropdown selection (if a class was resolved), fall back
    // to the free-text entry-point name input.
    const epName = selectedSelector
      ? entryPoints.find((ep) => ep.selector === selectedSelector)?.name ?? ""
      : entryPointName.trim();
    if (!epName) {
      setValidationError("Entry-point name (e.g. `transfer`) is required.");
      return;
    }
    const calldata = calldataRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let selector: string;
    try {
      selector = starknetHash.getSelectorFromName(epName);
    } catch (err) {
      setValidationError(
        err instanceof Error
          ? `Could not derive selector for "${epName}": ${err.message}`
          : `Invalid entry-point name "${epName}".`,
      );
      return;
    }
    setPending(true);
    try {
      const result = await client.execute([
        {
          contractAddress: contractAddress.trim(),
          entrypoint: epName,
          calldata,
          selector,
        } as unknown as import("starknet").Call,
      ]);
      setSuccess({ txHash: result.transactionHash });
    } catch (err) {
      setError(mapWalletError(err));
    } finally {
      setPending(false);
    }
  }, [
    client,
    contractAddress,
    selectedSelector,
    entryPoints,
    entryPointName,
    calldataRaw,
    setValidationError,
  ]);

  // Clear stale read result whenever the user pivots address or entry point.
  useEffect(() => {
    setReadResult(null);
  }, [contractAddress, selectedSelector, entryPointName]);

  const explorer = network.blockExplorer ?? "https://voyager.online";

  // EVM parity: Live form mirrors `<SimpleGridUI>`'s live-mode chrome — a
  // single bordered container styled inline + a section title above the
  // form body. Replaces the bespoke shadcn `<Card>` / `<CardHeader>` /
  // `<CardTitle>` wrappers that diverged from the EVM look.
  const liveCardStyle: React.CSSProperties = {
    width: "100%",
    padding: "24px",
    background: "transparent",
    border: "1px solid #444",
    borderRadius: "8px",
    boxShadow: "none",
  };
  const liveSectionTitleStyle: React.CSSProperties = {
    fontSize: "15px",
    fontWeight: 600,
    color: "#888",
    marginBottom: "16px",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  };

  // Selected entry-point in Function mode — used to gate the wallet
  // warning and surface typed-input hints.
  const selectedEntry = useMemo(
    () =>
      (selectedFunctionType === "read" ? readEntryPoints : writeEntryPoints)
        .find((ep) => ep.selector === selectedSelector) ?? null,
    [readEntryPoints, selectedFunctionType, selectedSelector, writeEntryPoints],
  );

  // Initialise the typed-input map whenever the selected entry changes. We
  // preserve any prior values keyed by name so the user doesn't lose state
  // when toggling between functions that share parameter names.
  // Always reset `calldataRaw` on function change — otherwise the previous
  // function's encoded felts leak into the next call (e.g. switching from
  // a 1-arg fn to `name()` would send the stale arg, triggering the bridge
  // "Input too long for arguments" revert).
  useEffect(() => {
    setCalldataRaw("");
    if (!selectedEntry) {
      setParamValues({});
      return;
    }
    setParamValues((prev) =>
      buildInitialParamValues(selectedEntry.inputs ?? [], prev),
    );
  }, [selectedEntry]);

  // When the user toggles to Raw mode, drop the encoded felts into the
  // textarea so they can hand-edit. When they toggle back to Function mode,
  // we leave the textarea alone — the typed inputs re-derive their own
  // calldata from `paramValues`.
  const lastModeRef = React.useRef<FunctionMode>(functionMode);
  useEffect(() => {
    if (lastModeRef.current === functionMode) return;
    lastModeRef.current = functionMode;
  }, [functionMode]);

  // EVM parity wallet warning predicate. Mirrors
  // ExecutionSection.tsx:680 — `selectedFunctionType === "write" &&
  // !isSimulationMode && (!isConnected || !walletClient)`. Cairo equivalent
  // is now anchored on the same `selectedFunctionType` state EVM uses (rather
  // than the mutability of the currently-selected entry, which produced the
  // same answer but didn't match EVM's wiring).
  const showWalletWarning =
    abiAvailable &&
    functionMode === "function" &&
    selectedFunctionType === "write" &&
    selectedEntry !== null &&
    !connection;

  return (
    <div style={liveCardStyle}>
      <h3 style={liveSectionTitleStyle}>Live interaction</h3>
      <div className="space-y-4">
        {connection && (
          <p className="text-[11px] text-muted-foreground">
            Connected as <code className="font-mono">{shortenAddress(connection.address)}</code>{" "}
            via {connection.connectorName ?? connection.connectorId ?? "unknown"}.
          </p>
        )}

        <StarknetContractColumn
          contractAddress={contractAddress}
          onAddressChange={handleAddressChange}
          selectedNetwork={network}
          onNetworkChange={onNetworkChange}
          isLoading={classPending}
          error={classError}
          onFetchClass={onFetchClass}
          contractName={contractName}
          classHash={classHash}
          tokenType={tokenType}
          tokenMeta={tokenMeta}
        />

        {/* EVM parity: nothing renders below the address column until either
            an ABI loads OR the fetch fails (in which case Raw mode kicks in). */}
        {showFunctionSection && (
          <>
            <FunctionRawToggle
              value={functionMode}
              onChange={setFunctionMode}
            />

            {classError && !abiAvailable && (
              <p className="text-[10px] text-muted-foreground">
                ABI not available — enter selector + felts manually.
              </p>
            )}

            {/* Read | Write tabs — EVM parity (FunctionTypeSection.tsx:348-380).
                Hidden in Raw mode because we don't have an ABI split there. */}
            {functionMode === "function" && abiAvailable && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">
                  Function Type
                </Label>
                <Tabs
                  value={selectedFunctionType}
                  onValueChange={(v) => {
                    const next = v as "read" | "write";
                    setSelectedFunctionType(next);
                    const nextEntries =
                      next === "read" ? readEntryPoints : writeEntryPoints;
                    setSelectedSelector(nextEntries[0]?.selector ?? "");
                  }}
                  className="w-full"
                >
                  <TabsList className="w-full grid grid-cols-2 h-9 bg-muted/30 p-0.5">
                    {readEntryPoints.length > 0 && (
                      <TabsTrigger
                        value="read"
                        className="gap-1.5 text-xs data-[state=active]:bg-green-500/20 data-[state=active]:text-green-500 data-[state=active]:border data-[state=active]:border-green-500/50"
                      >
                        Read ({readEntryPoints.length})
                      </TabsTrigger>
                    )}
                    {writeEntryPoints.length > 0 && (
                      <TabsTrigger
                        value="write"
                        className="gap-1.5 text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500 data-[state=active]:border data-[state=active]:border-amber-500/50"
                      >
                        Write ({writeEntryPoints.length})
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
              </div>
            )}

            <Field label="Entry point" htmlFor="live-entry">
              {functionMode === "function" && entryPoints.length > 0 ? (
                <Select
                  value={selectedSelector || ""}
                  onValueChange={(v) => setSelectedSelector(v)}
                >
                  <SelectTrigger
                    id="live-entry"
                    className="w-full text-xs font-mono"
                  >
                    <SelectValue placeholder="Choose function…" />
                  </SelectTrigger>
                  <SelectContent
                    position="popper"
                    className="max-h-[280px]"
                  >
                    {(selectedFunctionType === "read"
                      ? readEntryPoints
                      : writeEntryPoints
                    ).map((ep) => (
                      <SelectItem
                        key={ep.selector}
                        value={ep.selector}
                        className="text-xs font-mono"
                      >
                        {ep.name}({(ep.inputs ?? [])
                          .map((i) => i.type)
                          .join(",")})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="live-entry"
                  placeholder="transfer or 0x…"
                  spellCheck={false}
                  className="font-mono text-xs"
                  value={entryPointName}
                  onChange={(e) => setEntryPointName(e.target.value)}
                />
              )}
            </Field>

            {/* Calldata only renders after the user has picked an entry-point
                (Function mode → selectedEntry resolved; Raw mode → user has
                typed a selector). Mirrors EVM where the params section
                doesn't appear until a function is selected. */}
            {functionMode === "function" && selectedEntry && classInfo?.abi && (
              <Field
                label="Function Parameters"
                htmlFor={`typed-${selectedEntry.selector}`}
              >
                <StarknetTypedInputs
                  inputs={selectedEntry.inputs ?? []}
                  values={paramValues}
                  onChange={setParamValues}
                  abi={classInfo.abi}
                  functionName={selectedEntry.name ?? ""}
                  onCalldataChange={(felts) =>
                    setCalldataRaw(formatFeltsForTextarea(felts))
                  }
                />
              </Field>
            )}
            {functionMode === "raw" && entryPointName.trim().length > 0 && (
              <Field label="Calldata felts" htmlFor="live-calldata">
                <Textarea
                  id="live-calldata"
                  placeholder={"0xrecipient…\n0xamount_low\n0xamount_high"}
                  spellCheck={false}
                  className="font-mono text-xs h-32"
                  value={calldataRaw}
                  onChange={(e) => setCalldataRaw(e.target.value)}
                />
              </Field>
            )}

            {/* Wallet-not-connected gate — mirrors EVM's wallet reminder
                placement directly above the action button. Only renders
                when the user has selected a write entry point in Function
                mode (matches EVM's `selectedFunctionType === "write"`
                predicate). */}
            {showWalletWarning && (
              <Alert>
                <AlertTitle>Wallet not connected</AlertTitle>
                <AlertDescription className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs">
                    Connect a Starknet wallet (Argent X / Braavos /
                    Cartridge) to send transactions through this form.
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onConnectClick}
                    data-testid="connect-starknet-wallet"
                  >
                    Connect
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Read fns get a Call button (RpcProvider.callContract — no
                wallet, no gas, no signature). Write fns + Raw mode get the
                Send transaction button (starkzap.execute, wallet required).
                Read result felts render inline below. */}
            {functionMode === "function" && selectedEntry?.isView ? (
              <>
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    onClick={runRead}
                    disabled={readPending}
                    loading={readPending}
                  >
                    Call
                  </Button>
                </div>
                {readResult && (
                  <div className="rounded-md border border-border bg-card/40 p-3 space-y-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Return data
                    </div>
                    {readResult.decoded !== undefined && (
                      <pre className="font-mono text-xs whitespace-pre-wrap break-all text-foreground m-0">
                        {formatDecodedReturn(readResult.decoded)}
                      </pre>
                    )}
                    {readResult.decodeError && (
                      <div className="text-[10px] text-amber-400/90">
                        ABI decode failed: {readResult.decodeError} — showing raw felts only.
                      </div>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground text-[10px] uppercase tracking-wide hover:text-foreground transition-colors">
                        Raw felts ({readResult.raw.length})
                      </summary>
                      <div className="mt-1.5 space-y-0.5">
                        {readResult.raw.length === 0 ? (
                          <div className="text-xs text-muted-foreground">—</div>
                        ) : (
                          readResult.raw.map((felt, i) => (
                            <div
                              key={i}
                              className="font-mono text-xs flex gap-2 break-all"
                            >
                              <span className="text-muted-foreground tabular-nums">
                                {String(i).padStart(2, "0")}
                              </span>
                              <span>{felt}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={submit}
                  disabled={!connection || pending}
                  loading={pending}
                >
                  Send transaction
                </Button>
              </div>
            )}
          </>
        )}

        {error && (
          error.isUserRejected ? (
            <Alert
              variant="default"
              className="border-amber-500/40 bg-amber-500/10 text-amber-200 [&_[data-slot=alert-description]]:text-amber-200/90"
            >
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription className="text-xs">
                {error.message || "Try again when ready."}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertTitle>{error.title}</AlertTitle>
              <AlertDescription className="text-xs">{error.message}</AlertDescription>
            </Alert>
          )
        )}

        {success && (
          <Alert>
            <AlertTitle className="text-success">
              Transaction submitted
            </AlertTitle>
            <AlertDescription className="space-y-1 text-xs">
              <div>
                <code className="font-mono break-all">{success.txHash}</code>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`${explorer}/tx/${success.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-primary"
                >
                  View on Voyager
                </a>
                <span className="text-muted-foreground">·</span>
                {/* Hand the user a one-click pivot to Replay so they can
                    inspect the tx in the EDB-styled trace once it lands. */}
                <Link
                  to={`/starknet/builder?mode=replay&txHash=${success.txHash}`}
                  className="underline text-muted-foreground hover:text-foreground"
                >
                  Trace in Replay
                </Link>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Manual sim form — POST /simulate or /estimate-fee
// ---------------------------------------------------------------------------

interface ManualSimFormProps {
  /** Manual/Project · Transaction Replay strip rendered AT THE TOP of this
   *  Card (EVM parity — see `<SimpleGridUI contractModeToggle={...}>`). The
   *  hub owns the toggle so the same strip can swap between Manual and
   *  Replay without one form having to know about the other. */
  modeToggle?: React.ReactNode;
  /** Threaded through into the simulator client so the bridge picks the
   *  right RPC via `X-Starknet-Rpc-Url`. Drives mainnet ↔ sepolia
   *  switching via the inline NetworkSelector inside the address column. */
  network: StarknetNetwork;
  /** Extended chain — passed through into the address column's inline
   *  NetworkSelector so user picks update both the bridge target and the
   *  hub's persisted network. */
  selectedNetwork: ExtendedChain;
  onNetworkChange: (network: ExtendedChain) => void;
  /** Lifted invoke form state. The hub owns this so the right-column
   *  Simulation Overrides sidebar can drive the same fields (Sender / Nonce
   *  / Block pin) that used to live inline at the bottom of this form. */
  form: InvokeFormState;
  onFormChange: (next: InvokeFormState) => void;
}

const StarknetManualSimForm: React.FC<ManualSimFormProps> = ({
  modeToggle,
  network,
  selectedNetwork,
  onNetworkChange,
  form,
  onFormChange,
}) => {
  const simulator = useMemo(() => new StarknetSimulator(), []);
  const navigate = useNavigate();
  const location = useLocation();
  const { setSimulation } = useStarknetSimulation();
  const [contractAddress, setContractAddress] = useState("");
  const [classHash, setClassHash] = useState<string | undefined>(undefined);
  const [classInfo, setClassInfo] = useState<ClassInfo | null>(null);
  const [contractName, setContractName] = useState<string | undefined>(undefined);
  const [tokenType, setTokenType] = useState<StarknetTokenType>(null);
  const [tokenMeta, setTokenMeta] = useState<StarknetErc20Meta | undefined>(
    undefined,
  );
  const [classError, setClassError] = useState<string | null>(null);
  const [classPending, setClassPending] = useState(false);

  // ?clone=<id> — when present, fetch the stored manual sim and replay its
  // formSnapshot into the lifted form state. The redundant ?clone is then
  // stripped from the URL so a refresh doesn't re-clone. Mirrors EVM
  // TransactionBuilderHub.tsx clone path (sim-id → IndexedDB → form).
  const cloneIdFromUrl = useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get("clone");
  }, [location.search]);
  // No de-dupe ref: the clone effect strips ?clone from the URL after
  // running, so a stable URL with clone=X only triggers the effect once
  // per nav. If the user navigates Builder → History → Builder with the
  // same id, that's a fresh clone gesture and SHOULD re-prefill the form.
  useEffect(() => {
    if (!cloneIdFromUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const { starknetSimulationHistoryService } = await import(
          "@/services/StarknetSimulationHistoryService"
        );
        const stored = await starknetSimulationHistoryService.getSimulation(
          cloneIdFromUrl,
        );
        if (cancelled) return;
        if (stored?.formSnapshot) {
          onFormChange(stored.formSnapshot);
          // Carry the contract address from the stored response so the
          // address column auto-populates too. Address is the inner-call
          // contract (set during extractCairoFields at save time).
          if (stored.contractAddress) {
            setContractAddress(stored.contractAddress);
          }
        }
        // Strip ?clone from the URL so a refresh doesn't re-clone.
        const sp = new URLSearchParams(location.search);
        sp.delete("clone");
        navigate(
          { pathname: location.pathname, search: sp.toString() ? `?${sp}` : "" },
          { replace: true },
        );
      } catch (err) {
        console.warn("[StarknetManualSimForm] Clone hydrate failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cloneIdFromUrl, location.pathname, location.search, navigate, onFormChange]);
  const [functionMode, setFunctionModeState] = useState<FunctionMode>("function");
  const userPickedModeRef = React.useRef(false);
  const setFunctionMode = useCallback((next: FunctionMode) => {
    userPickedModeRef.current = true;
    setFunctionModeState(next);
  }, []);
  const [selectedFunctionType, setSelectedFunctionType] = useState<"read" | "write">("read");
  const [selectedSelector, setSelectedSelector] = useState<string>("");
  const [paramValues, setParamValues] = useState<ParamValueMap>({});
  const [pending, setPending] = useState<"sim" | null>(null);
  const [simStage, setSimStage] = useState<SimulatePrepareStatus | null>(null);
  const [readResult, setReadResult] = useState<
    | { raw: string[]; decoded?: unknown; decodeError?: string }
    | null
  >(null);
  const [readPending, setReadPending] = useState(false);
  const [error, setError] = useState<string | Error | null>(null);

  const handleAddressChange = useCallback((next: string) => {
    setContractAddress(next);
    setClassInfo(null);
    setClassHash(undefined);
    setContractName(undefined);
    setTokenType(null);
    setTokenMeta(undefined);
    setClassError(null);
    setSelectedSelector("");
  }, []);

  const onFetchClass = useCallback(async () => {
    setClassError(null);
    setClassPending(true);
    try {
      const resolved = await resolveAddressToClass(contractAddress, network);
      setClassInfo(resolved.classInfo);
      setClassHash(resolved.classHash);
      setContractName(resolved.contractName);
      setTokenType(resolved.tokenType);
      setTokenMeta(resolved.tokenMeta);
    } catch (err) {
      setClassError(err instanceof Error ? err.message : String(err));
      setClassInfo(null);
      setClassHash(undefined);
      setContractName(undefined);
      setTokenType(null);
      setTokenMeta(undefined);
    } finally {
      setClassPending(false);
    }
  }, [contractAddress, network]);

  // Flatten the class ABI into a list of selectable entry-points (external/view).
  const entryPoints: ClassEntryPointEntry[] = useMemo(
    () => flattenEntryPoints(classInfo),
    [classInfo],
  );

  const readEntryPoints = useMemo(
    () => entryPoints.filter((ep) => ep.isView),
    [entryPoints],
  );
  const writeEntryPoints = useMemo(
    () => entryPoints.filter((ep) => !ep.isView),
    [entryPoints],
  );

  // EVM-parity gating — same predicates as the Live form. Hide the entry
  // point + calldata + Simulate buttons until the ABI loads OR the fetch
  // fails (which falls back to Raw mode).
  const abiAvailable = Boolean(
    classInfo && Array.isArray(classInfo.abi) && entryPoints.length > 0,
  );
  const showFunctionSection = abiAvailable || (classError && !classPending);

  useEffect(() => {
    if (readEntryPoints.length > 0) {
      setSelectedFunctionType("read");
      setSelectedSelector(readEntryPoints[0]?.selector ?? "");
    } else if (writeEntryPoints.length > 0) {
      setSelectedFunctionType("write");
      setSelectedSelector(writeEntryPoints[0]?.selector ?? "");
    }
  }, [classInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    userPickedModeRef.current = false;
  }, [contractAddress]);

  useEffect(() => {
    if (userPickedModeRef.current) return;
    if (classError && !classPending) setFunctionModeState("raw");
    else if (abiAvailable) setFunctionModeState("function");
  }, [classError, classPending, abiAvailable]);

  const selectedEntry = useMemo(
    () =>
      (selectedFunctionType === "read" ? readEntryPoints : writeEntryPoints)
        .find((ep) => ep.selector === selectedSelector) ?? null,
    [readEntryPoints, selectedFunctionType, selectedSelector, writeEntryPoints],
  );

  // Reset paramValues + the encoded calldata on function change. Without
  // the calldata reset the previous function's felts leak into the next
  // submission (e.g. switching from a 1-arg fn → `name()` would still send
  // the prior arg). Skip the first mount so a clone-hydrated form doesn't
  // get its calldata wiped by the initial selectedEntry === null pass.
  const fnChangeFirstRunRef = React.useRef(true);
  useEffect(() => {
    if (fnChangeFirstRunRef.current) {
      fnChangeFirstRunRef.current = false;
      if (selectedEntry) {
        setParamValues((prev) =>
          buildInitialParamValues(selectedEntry.inputs ?? [], prev),
        );
      }
      return;
    }
    onFormChange({ ...form, calldata: "" });
    if (!selectedEntry) {
      setParamValues({});
      return;
    }
    setParamValues((prev) =>
      buildInitialParamValues(selectedEntry.inputs ?? [], prev),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry]);

  const update = <K extends keyof InvokeFormState>(
    k: K,
    v: InvokeFormState[K],
  ) => onFormChange({ ...form, [k]: v });

  // /simulate enforces strict nonce checks; auto-fetch on sender change.
  const senderAddrTrimmed = form.senderAddress.trim();
  useEffect(() => {
    if (!/^0x[0-9a-fA-F]{1,64}$/.test(senderAddrTrimmed)) return;
    if (isNeutralSender(senderAddrTrimmed)) return;
    let cancelled = false;
    (async () => {
      try {
        const { url } = networkConfigManager.resolveStarknetRpc(network);
        const provider = new RpcProvider({ nodeUrl: url });
        const nonce = await provider.getNonceForAddress(senderAddrTrimmed);
        if (cancelled) return;
        const nonceHex = `0x${BigInt(nonce).toString(16)}`;
        if (form.nonce !== nonceHex) {
          onFormChange({ ...form, nonce: nonceHex });
        }
      } catch {
        // Address isn't a deployed account; bridge surfaces the error on submit.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderAddrTrimmed, network]);

  // Resolve entry-point name once — Function mode picks from the ABI
  // dropdown, Raw mode reads whatever the user typed (name OR pre-hashed felt).
  const resolveEpName = useCallback((): string => {
    return selectedSelector
      ? entryPoints.find((ep) => ep.selector === selectedSelector)?.name ??
          selectedSelector
      : "";
  }, [selectedSelector, entryPoints]);

  const runRead = useCallback(async () => {
    setError(null);
    setReadResult(null);
    if (!contractAddress.trim().startsWith("0x")) {
      setError("Contract address must be a 0x-prefixed felt.");
      return;
    }
    const epName = resolveEpName();
    if (!epName) {
      setError("Entry-point name is required.");
      return;
    }
    const calldata = form.calldata
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    setReadPending(true);
    try {
      const { url } = networkConfigManager.resolveStarknetRpc(network);
      const provider = new RpcProvider({ nodeUrl: url });
      const raw = await provider.callContract({
        contractAddress: contractAddress.trim(),
        entrypoint: epName,
        calldata,
      });
      let decoded: unknown;
      let decodeError: string | undefined;
      if (classInfo?.abi) {
        try {
          decoded = new CallData(classInfo.abi).parse(epName, raw);
        } catch (err) {
          decodeError = err instanceof Error ? err.message : String(err);
        }
      }
      setReadResult({ raw, decoded, decodeError });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setReadPending(false);
    }
  }, [classInfo, contractAddress, form.calldata, network, resolveEpName]);

  const runDebugSimulation = useCallback(
    async (request: Parameters<StarknetSimulator["prepareSimulation"]>[0]) => {
      setSimStage({
        prepareId: "",
        status: "queued",
        stage: "queued",
        progressPct: 0,
        message: "Queued debug simulation",
      });

      const { prepareId } = await simulator.prepareSimulation(request, {
        network,
        timeoutMs: 30_000,
      });

      return await new Promise<SimulateResponse>((resolve, reject) => {
        let settled = false;
        let eventSource: EventSource | null = null;
        let pollTimer: number | null = null;

        const cleanup = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          if (pollTimer !== null) {
            window.clearInterval(pollTimer);
            pollTimer = null;
          }
        };

        const fail = (message: string) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(message));
        };

        const finish = async () => {
          if (settled) return;
          settled = true;
          cleanup();
          try {
            const result = await simulator.getPrepareResult(prepareId, {
              timeoutMs: 120_000,
            });
            resolve(result);
          } catch (err) {
            reject(err);
          }
        };

        const handleStatus = (status: SimulatePrepareStatus) => {
          setSimStage(status);
          if (status.status === "ready") {
            void finish();
          } else if (status.status === "failed") {
            fail(status.error || status.message || "Debug simulation failed");
          }
        };

        const startPolling = () => {
          if (pollTimer !== null) return;
          pollTimer = window.setInterval(() => {
            simulator
              .getPrepareStatus(prepareId, { timeoutMs: 30_000 })
              .then(handleStatus)
              .catch((err) => {
                fail(err instanceof Error ? err.message : String(err));
              });
          }, 900);
        };

        try {
          eventSource = simulator.connectPrepareEvents(prepareId);
          eventSource.addEventListener("status", (event) => {
            try {
              handleStatus(JSON.parse((event as MessageEvent).data));
            } catch (err) {
              fail(err instanceof Error ? err.message : String(err));
            }
          });
          eventSource.onerror = () => {
            eventSource?.close();
            eventSource = null;
            startPolling();
          };
        } catch {
          startPolling();
        }

        void simulator
          .getPrepareStatus(prepareId, { timeoutMs: 30_000 })
          .then(handleStatus)
          .catch(() => {
            startPolling();
          });
      });
    },
    [network, simulator],
  );

  const runSimulate = useCallback(async () => {
    setError(null);
    setSimStage(null);
    if (isNeutralSender(form.senderAddress)) {
      setError(
        "Cairo simulations need a deployed account contract as the FROM address — every INVOKE is dispatched through that account's __execute__. Replace 0x1 with your wallet address (or any deployed Argent / Braavos / OZ account on this network).",
      );
      return;
    }
    const epName = resolveEpName();
    const built = buildInvokeRequest(form, {
      contractAddress,
      entrypoint: epName,
    });
    if (!built.ok || !built.request) {
      setError(built.error ?? "Invalid request");
      return;
    }
    setPending("sim");
    try {
      let res: SimulateResponse;
      if (form.debugEnabled) {
        try {
          res = await runDebugSimulation(built.request);
        } catch (debugErr) {
          const fallback = await simulator.simulate(built.request, {
            network,
            traceSteps: true,
          });
          const message =
            debugErr instanceof Error ? debugErr.message : String(debugErr);
          if (fallback.results?.[0]) {
            fallback.results[0].debugTraceError = message;
          }
          res = fallback;
        }
      } else {
        res = await simulator.simulate(built.request, {
          network,
          traceSteps: true,
        });
      }
      // Keep the EVM simulation-page shape: stamp a friendly base36 ID, push
      // into context, and preserve the form snapshot for Re-Simulate.
      const simId = generateStarknetSimulationId();
      setSimulation({
        id: simId,
        source: "manual",
        response: res,
        chainId: res.chainId ?? res.blockContext.chainId ?? null,
        bridgeGitSha: null,
        network,
        formSnapshot: form,
        createdAt: Date.now(),
      });
      navigate(`/starknet/simulation/${simId}`, {
        state: { fromSimulation: true },
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPending(null);
      setSimStage(null);
    }
  }, [
    simulator,
    form,
    network,
    navigate,
    setSimulation,
    contractAddress,
    resolveEpName,
    runDebugSimulation,
  ]);

  useEffect(() => {
    setReadResult(null);
  }, [contractAddress, selectedSelector, form.calldata]);

  return (
    <div className="space-y-4">
      <Card className="relative">
        {/* Simulation History icon — pinned to the absolute top-right
            corner of the card so it sits well above the mode-toggle row
            (matches EDB's placement). `ClockCountdown` reads as
            "history" more clearly than the older `ClockCounterClockwise`
            because the directional pointer indicates "past time"
            without ambiguity. Bold weight + full opacity so the click
            target is visually pronounced rather than hidden. */}
        <Button
          type="button"
          variant="icon-borderless"
          size="icon-inline"
          onClick={() => navigate("/starknet/simulations")}
          title="Simulation History"
          aria-label="Simulation History"
          className="absolute top-3 right-3 z-10 cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
        >
          <ClockCountdown size={22} weight="bold" />
        </Button>
        <CardHeader>
          {/* EVM parity: render the Manual/Project · Transaction Replay
              strip as the FIRST visible element in the card so the
              sidebar's "Simulation Overrides" header lands at the same y. */}
          {modeToggle}
          <CardTitle className="text-sm">Manual simulation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Build an INVOKE v3 against a contract. Posts to{" "}
            <span className="font-mono">/simulate</span> for a full trace, or{" "}
            <span className="font-mono">/estimate-fee</span> for a fee-only
            response.
          </p>

          <StarknetContractColumn
            contractAddress={contractAddress}
            onAddressChange={handleAddressChange}
            selectedNetwork={selectedNetwork}
            onNetworkChange={onNetworkChange}
            isLoading={classPending}
            error={classError}
            onFetchClass={onFetchClass}
            contractName={contractName}
            classHash={classHash}
            tokenType={tokenType}
            tokenMeta={tokenMeta}
          />

          {abiAvailable && (
            <p className="text-[10px] text-success">
              Loaded ABI · {entryPoints.length} entry point
              {entryPoints.length === 1 ? "" : "s"}
            </p>
          )}

          {/* EVM parity: hide everything below the address column until the
              ABI loads OR the fetch fails (Raw mode fallback). */}
          {showFunctionSection && (
            <>
              <FunctionRawToggle
                value={functionMode}
                onChange={setFunctionMode}
              />

              {classError && !abiAvailable && (
                <p className="text-[10px] text-muted-foreground">
                  ABI not available — enter selector + felts manually.
                </p>
              )}

              {/* Read | Write tabs — EVM parity. */}
              {functionMode === "function" && abiAvailable && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-1.5 block">
                    Function Type
                  </Label>
                  <Tabs
                  value={selectedFunctionType}
                  onValueChange={(v) => {
                    const next = v as "read" | "write";
                    setSelectedFunctionType(next);
                    const nextEntries =
                      next === "read" ? readEntryPoints : writeEntryPoints;
                    setSelectedSelector(nextEntries[0]?.selector ?? "");
                  }}
                  className="w-full"
                >
                    <TabsList className="w-full grid grid-cols-2 h-9 bg-muted/30 p-0.5">
                      {readEntryPoints.length > 0 && (
                        <TabsTrigger
                          value="read"
                          className="gap-1.5 text-xs data-[state=active]:bg-green-500/20 data-[state=active]:text-green-500 data-[state=active]:border data-[state=active]:border-green-500/50"
                        >
                          Read ({readEntryPoints.length})
                        </TabsTrigger>
                      )}
                      {writeEntryPoints.length > 0 && (
                        <TabsTrigger
                          value="write"
                          className="gap-1.5 text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500 data-[state=active]:border data-[state=active]:border-amber-500/50"
                        >
                          Write ({writeEntryPoints.length})
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </Tabs>
                </div>
              )}

              <Field label="Entry point" htmlFor="manual-entry">
                {functionMode === "function" && entryPoints.length > 0 ? (
                  <Select
                    value={selectedSelector || ""}
                    onValueChange={(v) => setSelectedSelector(v)}
                  >
                    <SelectTrigger
                      id="manual-entry"
                      className="w-full text-xs font-mono"
                    >
                      <SelectValue placeholder="Choose function…" />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      className="max-h-[280px]"
                    >
                      {(selectedFunctionType === "read"
                        ? readEntryPoints
                        : writeEntryPoints
                      ).map((ep) => (
                        <SelectItem
                          key={ep.selector}
                          value={ep.selector}
                          className="text-xs font-mono"
                        >
                          {ep.name}({(ep.inputs ?? [])
                            .map((i) => i.type)
                            .join(",")})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="manual-entry"
                    placeholder="transfer or 0x…"
                    spellCheck={false}
                    className="font-mono text-xs"
                    value={selectedSelector}
                    onChange={(e) => setSelectedSelector(e.target.value)}
                  />
                )}
              </Field>

              {/* Calldata only renders after the user has picked an entry-point
                  (Function mode → selectedEntry resolved; Raw mode → user has
                  typed a selector). Mirrors EVM where the params section
                  doesn't appear until a function is selected. */}
              {functionMode === "function" && selectedEntry && classInfo?.abi && (
                <Field
                  label="Function Parameters"
                  htmlFor={`typed-${selectedEntry.selector}`}
                >
                  <StarknetTypedInputs
                    inputs={selectedEntry.inputs ?? []}
                    values={paramValues}
                    onChange={setParamValues}
                    abi={classInfo.abi}
                    functionName={selectedEntry.name ?? ""}
                    onCalldataChange={(felts) =>
                      update("calldata", formatFeltsForTextarea(felts))
                    }
                  />
                </Field>
              )}
              {functionMode === "raw" && selectedSelector.trim().length > 0 && (
                <Field label="Calldata felts" htmlFor="manual-calldata">
                  <Textarea
                    id="manual-calldata"
                    placeholder={"0x1\n0x5d07d9f6…\n0xf82886c4…"}
                    spellCheck={false}
                    className="font-mono text-xs h-32"
                    value={form.calldata}
                    onChange={(e) => update("calldata", e.target.value)}
                  />
                </Field>
              )}

              {/* Sender / Nonce / Block pin moved to the right-column
                  <StarknetSimulationOverridesSidebar> — EVM parity. */}

              {/* EVM parity: Read fns get a Call button (RpcProvider.callContract,
                  no INVOKE wrapper, no fake sender — the `0x1` neutral
                  sender doesn't have an `__execute__` so simulating reads
                  through the bridge always reverts). Write fns get the
                  full bridge `/simulate` path. */}
              {functionMode === "function" && selectedEntry?.isView ? (
                <>
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={runRead}
                      disabled={readPending}
                      loading={readPending}
                    >
                      Call
                    </Button>
                  </div>
                  {readResult && (
                    <div className="rounded-md border border-border bg-card/40 p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Return data
                      </div>
                      {readResult.decoded !== undefined && (
                        <pre className="font-mono text-xs whitespace-pre-wrap break-all text-foreground m-0">
                          {formatDecodedReturn(readResult.decoded)}
                        </pre>
                      )}
                      {readResult.decodeError && (
                        <div className="text-[10px] text-amber-400/90">
                          ABI decode failed: {readResult.decodeError} — showing raw felts only.
                        </div>
                      )}
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground text-[10px] uppercase tracking-wide hover:text-foreground transition-colors">
                          Raw felts ({readResult.raw.length})
                        </summary>
                        <div className="mt-1.5 space-y-0.5">
                          {readResult.raw.length === 0 ? (
                            <div className="text-xs text-muted-foreground">—</div>
                          ) : (
                            readResult.raw.map((felt, i) => (
                              <div
                                key={i}
                                className="font-mono text-xs flex gap-2 break-all"
                              >
                                <span className="text-muted-foreground tabular-nums">
                                  {String(i).padStart(2, "0")}
                                </span>
                                <span>{felt}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </details>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-2">
                  {pending === "sim" && form.debugEnabled && simStage && (
                    <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-foreground">{simStage.message}</span>
                        <span className="font-mono text-muted-foreground">
                          {Math.max(0, Math.min(100, simStage.progressPct))}%
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{
                            width: `${Math.max(2, Math.min(100, simStage.progressPct))}%`,
                          }}
                        />
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {simStage.stage}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 justify-end">
                    <Button
                      variant="outline"
                      onClick={runSimulate}
                      disabled={
                        !form.senderAddress.trim() ||
                        isNeutralSender(form.senderAddress) ||
                        pending !== null
                      }
                      loading={pending === "sim"}
                    >
                      {pending === "sim" && form.debugEnabled
                        ? "Simulating with debugger"
                        : "Simulate"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            typeof error === "string" ? (
              <Alert variant="destructive">
                <AlertTitle>Check the form</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            ) : (
              <BridgeErrorAlert error={error} context="Manual sim" />
            )
          )}
        </CardContent>
      </Card>

      {/* Results render on /starknet/simulation/:id — see
          StarknetSimulationResultsPage. */}
    </div>
  );
};

export default StarknetBuilderHub;
