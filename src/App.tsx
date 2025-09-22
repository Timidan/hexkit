import React, { useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ethers } from "ethers";
import "./App.css";
import { ToolIcon, HashIcon, ZapIcon } from "./components/icons/IconLibrary";
import AnimatedInput from "./components/ui/AnimatedInput";
import AnimatedButton from "./components/ui/AnimatedButton";
import RainbowKitWallet from "./components/RainbowKitWallet";
// import WalletTest from "./components/WalletTest"; // Removed after testing
// import PageTransition from "./components/ui/PageTransition";
// import DynamicWalletButton from "./components/DynamicWalletButton";
import "./styles/AnimatedInput.css";
import "./styles/AnimatedButton.css";
import "./styles/DynamicWallet.css";
import SimpleGridUI from "./components/SimpleGridUI";
import NewSimpleGridUI from "./components/NewSimpleGridUI";
import SignatureDatabase from "./components/SignatureDatabase";
import SmartDecoder from "./components/SmartDecoder";
import ComprehensiveContractSearch from "./components/ComprehensiveContractSearch";
import { ToolkitProvider } from "./contexts/ToolkitContext";
import Navigation from "./components/Navigation";
import ErrorBoundary from "./components/ErrorBoundary";
import { NotificationProvider } from "./components/NotificationManager";

// Signature Calculator Component
const SignatureCalculator: React.FC = () => {
  const [signature, setSignature] = useState("");
  const [selector, setSelector] = useState("");

  const calculateSelector = () => {
    try {
      const hash = ethers.utils.id(signature);
      setSelector(hash.slice(0, 10));
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";
      console.error("Error calculating selector:", errorMessage);
      setSelector(""); // Clear selector on error
    }
  };

  return (
    <div className="panel">
      <h2>Function Signatures</h2>

      <AnimatedInput
        label="Function Signature"
        value={signature}
        onChange={setSignature}
        type="text"
        placeholder="transfer(address,uint256)"
        icon={<HashIcon width={20} height={20} />}
        className="signature-input"
      />

      <AnimatedButton
        onClick={calculateSelector}
        variant="primary"
        icon={<ZapIcon width={18} height={18} />}
        className="calculate-selector-btn"
      >
        Calculate Selector
      </AnimatedButton>

      {selector && (
        <div className="result">
          <h3>Results:</h3>
          <p>
            Selector: <code>{selector}</code>
          </p>
        </div>
      )}
    </div>
  );
};

function App() {
  return (
    <ToolkitProvider>
      <NotificationProvider>
        <div className="app">
        <header>
          <div className="header-content">
            <div className="header-title">
              <h1>
                <ToolIcon width={24} height={24} className="inline mr-2" /> Web3 Toolkit
              </h1>
              <p>Ethereum Development Tools</p>
            </div>
            <div className="header-wallet">
              <RainbowKitWallet />
            </div>
          </div>
        </header>

        <Navigation />

        <main className="content">
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/decoder" replace />} />
              <Route path="/decoder" element={<SmartDecoder />} />
              <Route path="/signatures" element={<SignatureCalculator />} />
              <Route path="/builder" element={<SimpleGridUI />} />
              <Route path="/new-builder" element={<NewSimpleGridUI />} />
              <Route path="/database" element={<SignatureDatabase />} />
              <Route
                path="/contract-search"
                element={<ComprehensiveContractSearch />}
              />
            </Routes>
          </ErrorBoundary>
        </main>
        </div>
      </NotificationProvider>
    </ToolkitProvider>
  );
}

export default App;
