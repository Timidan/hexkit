import React, { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import "./App.css";
import { ToolIcon } from "./components/icons/IconLibrary";
import { Settings as SettingsIcon } from "lucide-react";
import RainbowKitWallet from "./components/RainbowKitWallet";
// import WalletTest from "./components/WalletTest"; // Removed after testing
// import PageTransition from "./components/ui/PageTransition";
// import DynamicWalletButton from "./components/DynamicWalletButton";
import "./styles/AnimatedInput.css";
import "./styles/AnimatedButton.css";
import "./styles/DynamicWallet.css";
import TransactionBuilderHub from "./components/TransactionBuilderHub";
import NewSimpleGridUI from "./components/NewSimpleGridUI";
import SignatureDatabase from "./components/SignatureDatabase";
import SmartDecoder from "./components/SmartDecoder";
import ComprehensiveContractSearch from "./components/ComprehensiveContractSearch";
import SimulatorWorkbench from "./components/SimulatorWorkbench";
import { ToolkitProvider } from "./contexts/ToolkitContext";
import Navigation from "./components/Navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { NotificationProvider } from "./components/NotificationManager";
import RpcSettingsModal from "./components/RpcSettingsModal";

interface ToolRoute {
  path: string;
  render: () => React.ReactElement;
}

const TOOL_ROUTES: ToolRoute[] = [
  { path: "/decoder", render: () => <SmartDecoder /> },
  { path: "/builder", render: () => <TransactionBuilderHub /> },
  { path: "/new-builder", render: () => <NewSimpleGridUI /> },
  { path: "/database", render: () => <SignatureDatabase /> },
  { path: "/signatures", render: () => <SignatureDatabase initialTab="tools" /> },
  { path: "/contract-search", render: () => <ComprehensiveContractSearch /> },
  { path: "/simulator", render: () => <SimulatorWorkbench /> },
];

const PersistentTools: React.FC = () => {
  const location = useLocation();
  const elementsRef = useRef<Record<string, React.ReactElement>>({});
  const [visitedPaths, setVisitedPaths] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (TOOL_ROUTES.some((route) => route.path === location.pathname)) {
      initial.add(location.pathname);
    }
    return initial;
  });

  useEffect(() => {
    if (TOOL_ROUTES.some((route) => route.path === location.pathname)) {
      setVisitedPaths((prev) => {
        if (prev.has(location.pathname)) return prev;
        const next = new Set(prev);
        next.add(location.pathname);
        return next;
      });
    }
  }, [location.pathname]);

  const activeRoute = useMemo(
    () => TOOL_ROUTES.find((route) => route.path === location.pathname),
    [location.pathname]
  );

  if (!activeRoute) {
    return <Navigate to="/decoder" replace />;
  }

  const ensureElement = (route: ToolRoute) => {
    if (!elementsRef.current[route.path]) {
      elementsRef.current[route.path] = route.render();
    }
    return elementsRef.current[route.path];
  };

  return (
    <>
      {TOOL_ROUTES.map((route) => {
        if (!visitedPaths.has(route.path) && route.path !== activeRoute.path) {
          return null;
        }

        const element = ensureElement(route);
        const isActive = route.path === activeRoute.path;

        return (
          <div
            key={route.path}
            style={{ display: isActive ? "block" : "none", width: "100%" }}
          >
            {element}
          </div>
        );
      })}
    </>
  );
};

function App() {
  const [isRpcModalOpen, setIsRpcModalOpen] = useState(false);

  return (
    <ToolkitProvider>
      <NotificationProvider>
        <div className="app">
        <header>
          <div className="header-wallet">
            <span
              role="button"
              tabIndex={0}
              className="wallet-icon-inline rpc-settings-trigger"
              onClick={() => setIsRpcModalOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setIsRpcModalOpen(true);
                }
              }}
              title="RPC Settings"
              aria-label="RPC settings"
            >
              <SettingsIcon size={18} />
            </span>
            <RainbowKitWallet />
          </div>
          <div className="header-content">
            <div className="header-title">
              <h1>
                <ToolIcon width={24} height={24} className="inline mr-2" /> Web3 Toolkit
              </h1>
              <p>Ethereum Development Tools</p>
            </div>
          </div>
        </header>

        <Navigation />

        <main className="content">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/decoder" replace />} />
              <Route path="/*" element={<PersistentTools />} />
            </Routes>
          </ErrorBoundary>
        </main>
        <RpcSettingsModal
          isOpen={isRpcModalOpen}
          onClose={() => setIsRpcModalOpen(false)}
        />
        </div>
      </NotificationProvider>
    </ToolkitProvider>
  );
}

export default App;
