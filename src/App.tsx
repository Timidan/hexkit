import React, { Suspense, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import "./App.css";
import { resolvePath } from "./chains/plugins";
import LoadingSpinner from "./components/shared/LoadingSpinner";
import { useRouteLoading } from "./hooks/useRouteLoading";
import PersistentTools from "./components/PersistentTools";
import { ToolkitProvider } from "./contexts/ToolkitContext";
import { SimulationProvider } from "./contexts/SimulationContext";
import { DebugProvider } from "./contexts/DebugContext";
import Navigation from "./components/Navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { NotificationProvider } from "./components/NotificationManager";
import { RouteMetaTags } from "./components/shared/RouteMetaTags";
import { useNetworkConfig } from "./contexts/NetworkConfigContext";
import { Button } from "./components/ui/button";
import TopBar from "./components/TopBar";
import EdbBridgeStatus from "./components/EdbBridgeStatus";
import ConstellationBackground from "./components/ConstellationBackground";
import HomePage from "./components/HomePage";
import MobileDrawer from "./components/MobileDrawer";
import { useBreakpoint } from "./hooks/useBreakpoint";

const SimulationResultsPage = React.lazy(() => import("./components/SimulationResultsPage"));
const RpcSettingsModal = React.lazy(() => import("./components/RpcSettingsModal"));
const StorageManagerModal = React.lazy(() => import("./components/StorageManagerModal"));

/** Visible placeholder while a lazily-loaded modal chunk is fetched. */
const ModalLoadingFallback: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 2100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.45)",
    }}
  >
    <LoadingSpinner text="Loading" />
  </div>
);

function App() {
  const [isRpcModalOpen, setIsRpcModalOpen] = useState(false);
  const [isStorageModalOpen, setIsStorageModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isMobile } = useBreakpoint();
  const { config, hasAcknowledgedDefaults, acknowledgeDefaults } = useNetworkConfig();

  const isSimulationPage = location.pathname.startsWith("/simulation/");
  const isHomePage = location.pathname === "/";

  // The app shell owns the loader for Home and Simulation. Tool routes are
  // gated inside PersistentTools so their mounted panels stay alive underneath.
  const appRouteKey = isHomePage
    ? `home:${location.search}`
    : isSimulationPage
      ? `simulation:${location.pathname}${location.search}`
      : null;
  const isAppRouteLoading = useRouteLoading(appRouteKey);

  const hasUserOverride =
    (config.rpcMode === "CUSTOM" && config.customRpcUrl?.trim()) ||
    (config.rpcMode === "ALCHEMY" && config.alchemyApiKey?.trim()) ||
    (config.rpcMode === "INFURA" && config.infuraProjectId?.trim());

  const { plugin } = resolvePath(location.pathname);
  const showRpcSetupGate = plugin.evmServices && !hasUserOverride && !hasAcknowledgedDefaults;

  return (
    <ToolkitProvider>
      <SimulationProvider>
        <DebugProvider>
          <NotificationProvider>
            <ErrorBoundary>
              <RouteMetaTags />
              <ConstellationBackground />
              <a href="#main-content" className="skip-link">Skip to content</a>
              {/* Global top bar — visible on every route */}
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

              {isSimulationPage ? (
                <>
                  {isAppRouteLoading && <LoadingSpinner text="Loading" fullPage />}
                  <div style={{ display: isAppRouteLoading ? "none" : undefined }}>
                    <Suspense fallback={<LoadingSpinner text="Loading" fullPage />}>
                      <Routes>
                        <Route path="/simulation/:id" element={<SimulationResultsPage />} />
                      </Routes>
                    </Suspense>
                  </div>
                </>
              ) : isHomePage ? (
                <>
                  {isAppRouteLoading && <LoadingSpinner text="Loading" fullPage />}
                  <div style={{ display: isAppRouteLoading ? "none" : undefined }}>
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                    </Routes>
                  </div>
                </>
              ) : (
                <div data-chain={plugin.id} className={cn("app", resolvePath(location.pathname).tool?.fullWidth && "app-fullwidth")}>
                  {!isMobile && <Navigation />}

                  <main id="main-content" tabIndex={-1} className="content">
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
                            onClick={() => setIsRpcModalOpen(true)}
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
                            onClick={acknowledgeDefaults}
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
              )}

              {/* Global footer — docs at far left, EDB status at far right */}
              <footer data-chain={plugin.id} className="app-footer">
                <a
                  className="app-footer-docs"
                  href="https://hexdocs.thally.app"
                  target="_blank"
                  rel="noreferrer"
                >
                  Documentation
                </a>
                {plugin.evmServices && <EdbBridgeStatus />}
              </footer>

              {isRpcModalOpen && (
                <Suspense fallback={<ModalLoadingFallback />}>
                  <RpcSettingsModal
                    isOpen={isRpcModalOpen}
                    onClose={() => setIsRpcModalOpen(false)}
                  />
                </Suspense>
              )}

              {isStorageModalOpen && (
                <Suspense fallback={<ModalLoadingFallback />}>
                  <StorageManagerModal
                    isOpen={isStorageModalOpen}
                    onClose={() => setIsStorageModalOpen(false)}
                  />
                </Suspense>
              )}
            </ErrorBoundary>
          </NotificationProvider>
        </DebugProvider>
      </SimulationProvider>
    </ToolkitProvider>
  );
}

export default App;
