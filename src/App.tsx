import React, { Suspense, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import "./App.css";
import LoadingSpinner from "./components/shared/LoadingSpinner";
import PersistentTools from "./components/PersistentTools";
import { ToolkitProvider } from "./contexts/ToolkitContext";
import { SimulationProvider } from "./contexts/SimulationContext";
import { StarknetSimulationProvider } from "./contexts/StarknetSimulationContext";
import { DebugProvider } from "./contexts/DebugContext";
import {
  WalletManagerProvider,
  useWalletManager,
} from "./contexts/WalletManager";
import Navigation from "./components/Navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { NotificationProvider } from "./components/NotificationManager";
import { RouteMetaTags } from "./components/shared/RouteMetaTags";
import { useNetworkConfig } from "./contexts/NetworkConfigContext";
import { Button } from "./components/ui/button";
import TopBar from "./components/TopBar";
import EdbBridgeStatus from "./components/EdbBridgeStatus";
import StarknetSimBridgeStatus from "./components/StarknetSimBridgeStatus";
import ConstellationBackground from "./components/ConstellationBackground";
import HomePage from "./components/HomePage";
import MobileDrawer from "./components/MobileDrawer";
import { useBreakpoint } from "./hooks/useBreakpoint";
import { FAMILY_PREFIXES, parseFamilyFromPath, resolveLegacyRedirect } from "./routes/familyRoutes";

// Provider + bridge are a matched pair per family. Both are lazy so their
// module graphs only load once the user activates that family.
const EvmFamilyProviders = React.lazy(
  () => import("./chains/providers/EvmFamilyProviders"),
);
const StarknetFamilyProviders = React.lazy(
  () => import("./chains/providers/StarknetFamilyProviders"),
);
const EvmBridge = React.lazy(
  () => import("./components/wallet/bridges/EvmBridge"),
);
const StarknetBridge = React.lazy(
  () => import("./components/wallet/bridges/StarknetBridge"),
);

const SimulationResultsPage = React.lazy(() => import("./components/SimulationResultsPage"));
const StarknetSimulationResultsPage = React.lazy(
  () => import("./components/starknet/StarknetSimulationResultsPage"),
);
const RpcSettingsModal = React.lazy(() => import("./components/RpcSettingsModal"));
const StorageManagerModal = React.lazy(() => import("./components/StorageManagerModal"));

/**
 * Conditionally wraps children with the family providers the user has
 * activated. First activation per family triggers a one-time subtree
 * remount as the provider inserts itself above Routes — accepted tradeoff
 * for preserving chunk isolation on inactive families.
 */
const FamilyProviderStack: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { activeFamilies } = useWalletManager();
  if (activeFamilies.size === 0) return <>{children}</>;

  let node: React.ReactNode = children;
  if (activeFamilies.has("starknet")) {
    node = (
      <StarknetFamilyProviders>
        <StarknetBridge />
        {node}
      </StarknetFamilyProviders>
    );
  }
  if (activeFamilies.has("evm")) {
    node = (
      <EvmFamilyProviders>
        <EvmBridge />
        {node}
      </EvmFamilyProviders>
    );
  }

  return (
    <Suspense fallback={<LoadingSpinner text="Connecting wallet" fullPage />}>
      {node}
    </Suspense>
  );
};

interface FamilyShellProps {
  isMobile: boolean;
  showRpcSetupGate: boolean;
  onOpenRpcModal: () => void;
  onAcknowledgeDefaults: () => void;
}

type AppPageMode = "evm-simulation" | "starknet-simulation" | "home" | "family";

function getAppPageMode(pathname: string): AppPageMode {
  if (pathname.startsWith("/simulation/")) return "evm-simulation";
  if (pathname.startsWith(`${FAMILY_PREFIXES.starknet}/simulation/`)) {
    return "starknet-simulation";
  }
  if (pathname === "/") return "home";
  return "family";
}

const FamilyShell: React.FC<FamilyShellProps> = ({
  isMobile,
  showRpcSetupGate,
  onOpenRpcModal,
  onAcknowledgeDefaults,
}) => {
  const location = useLocation();

  return (
    <div
      className={cn(
        "app",
        (
          location.pathname.startsWith(`${FAMILY_PREFIXES.evm}/explorer`) ||
          location.pathname.startsWith(`${FAMILY_PREFIXES.evm}/builder`) ||
          location.pathname.startsWith(`${FAMILY_PREFIXES.evm}/integrations`) ||
          location.pathname.startsWith(`${FAMILY_PREFIXES.starknet}/explorer`) ||
          location.pathname.startsWith(`${FAMILY_PREFIXES.starknet}/builder`) ||
          location.pathname.startsWith(`${FAMILY_PREFIXES.starknet}/simulation/`) ||
          location.pathname.startsWith(`${FAMILY_PREFIXES.starknet}/simulations`)
        ) && "app-fullwidth",
      )}
    >
      {!isMobile && <Navigation />}

      <main className="content">
        <Routes>
          <Route path="/*" element={<PersistentTools />} />
        </Routes>
      </main>

      {showRpcSetupGate && (
        <div
          role="alert"
          aria-live="assertive"
          className="rpc-gate-overlay"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            className="rpc-gate-card"
            style={{
              maxWidth: "520px",
              width: "100%",
              background:
                "linear-gradient(135deg, rgba(35,37,52,0.95), rgba(20,22,33,0.95))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 15px 40px rgba(0,0,0,0.35)",
              borderRadius: "16px",
              padding: "24px",
              color: "#e5e7eb",
            }}
          >
            <p
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                fontSize: "13px",
                color: "#9ca3af",
                marginBottom: "8px",
              }}
            >
              Connection required
            </p>
            <h3 style={{ margin: "0 0 8px", fontSize: "21px", fontWeight: 700 }}>
              Pick an RPC provider or confirm public defaults
            </h3>
            <p style={{ margin: "0 0 16px", lineHeight: 1.4, color: "#cbd5e1" }}>
              To run reads, writes, and simulations reliably, choose your RPC (Alchemy, Infura, or custom).
              If you prefer, you can continue with the built-in public endpoints, but they may be rate-limited.
            </p>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Button
                type="button"
                variant="ghost"
                className="btn btn-primary"
                onClick={onOpenRpcModal}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.4)",
                  background: "transparent",
                  color: "#fff",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Configure RPC now
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="btn btn-secondary"
                onClick={onAcknowledgeDefaults}
                style={{
                  padding: "10px 16px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.04)",
                  color: "#e5e7eb",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Use public defaults for now
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function AppInner() {
  const [isRpcModalOpen, setIsRpcModalOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isMobile } = useBreakpoint();
  const { config, hasAcknowledgedDefaults, acknowledgeDefaults } = useNetworkConfig();
  const { activateFamily } = useWalletManager();

  // Visiting a family's route ensures its provider is mounted so tools can
  // resolve native SDK hooks without requiring an explicit picker click.
  useEffect(() => {
    const family = parseFamilyFromPath(location.pathname);
    if (family) activateFamily(family);
  }, [location.pathname, activateFamily]);

  const pageMode = getAppPageMode(location.pathname);
  const legacyRedirectTarget = resolveLegacyRedirect({
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
  });

  const hasUserOverride =
    (config.rpcMode === "CUSTOM" && config.customRpcUrl?.trim()) ||
    (config.rpcMode === "ALCHEMY" && config.alchemyApiKey?.trim()) ||
    (config.rpcMode === "INFURA" && config.infuraProjectId?.trim());

  const showRpcSetupGate = !hasUserOverride && !hasAcknowledgedDefaults;

  const shellProps: FamilyShellProps = {
    isMobile,
    showRpcSetupGate,
    onOpenRpcModal: () => setIsRpcModalOpen(true),
    onAcknowledgeDefaults: acknowledgeDefaults,
  };

  return (
    <>
      <RouteMetaTags />
      <ConstellationBackground />
      <TopBar
        onOpenRpcSettings={() => setIsRpcModalOpen(true)}
        onOpenStorageManager={() => setIsStorageModalOpen(true)}
        onToggleMobileMenu={() => setIsMobileMenuOpen((v) => !v)}
        isMobileMenuOpen={isMobileMenuOpen}
      />

      {isMobile && (
        <MobileDrawer
          open={isMobileMenuOpen}
          onOpenChange={setIsMobileMenuOpen}
        />
      )}

      <FamilyProviderStack>
        {legacyRedirectTarget ? (
          <Navigate to={legacyRedirectTarget} replace />
        ) : pageMode === "evm-simulation" ? (
          <Suspense fallback={<LoadingSpinner text="Loading" fullPage />}>
            <Routes>
              <Route path="/simulation/:id" element={<SimulationResultsPage />} />
            </Routes>
          </Suspense>
        ) : pageMode === "starknet-simulation" ? (
          <Suspense fallback={<LoadingSpinner text="Loading" fullPage />}>
            <Routes>
              <Route
                path={`${FAMILY_PREFIXES.starknet}/simulation/:id`}
                element={<StarknetSimulationResultsPage />}
              />
            </Routes>
          </Suspense>
        ) : pageMode === "home" ? (
          <Routes>
            <Route path="/" element={<HomePage />} />
          </Routes>
        ) : (
          <Routes>
            <Route
              path={`${FAMILY_PREFIXES.evm}/*`}
              element={<FamilyShell {...shellProps} />}
            />
            <Route
              path={`${FAMILY_PREFIXES.starknet}/*`}
              element={<FamilyShell {...shellProps} />}
            />
            <Route
              path="*"
              element={<Navigate to={FAMILY_PREFIXES.evm} replace />}
            />
          </Routes>
        )}
      </FamilyProviderStack>

      <footer className="app-footer">
        <EdbBridgeStatus />
        <StarknetSimBridgeStatus />
      </footer>

      {isRpcModalOpen && (
        <Suspense fallback={null}>
          <RpcSettingsModal
            isOpen={isRpcModalOpen}
            onClose={() => setIsRpcModalOpen(false)}
          />
        </Suspense>
      )}

      {isStorageModalOpen && (
        <Suspense fallback={null}>
          <StorageManagerModal
            isOpen={isStorageModalOpen}
            onClose={() => setIsStorageModalOpen(false)}
          />
        </Suspense>
      )}
    </>
  );
}

function App() {
  return (
    <WalletManagerProvider>
      <ToolkitProvider>
        <SimulationProvider>
          <StarknetSimulationProvider>
            <DebugProvider>
              <NotificationProvider>
                <ErrorBoundary>
                  <AppInner />
                </ErrorBoundary>
              </NotificationProvider>
            </DebugProvider>
          </StarknetSimulationProvider>
        </SimulationProvider>
      </ToolkitProvider>
    </WalletManagerProvider>
  );
}

export default App;
