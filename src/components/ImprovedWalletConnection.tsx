import React, { useState } from 'react';
import './ImprovedWalletConnection.css';

interface WalletOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  recommended?: boolean;
}

const MetaMaskIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 7.5L13 2l-3 3.5L7 2 3 7.5v9l3 3 4 1.5 4 1.5 4-1.5 3-3v-9z" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CoinbaseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 7v10M7 12h10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const WALLET_OPTIONS: WalletOption[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: <MetaMaskIcon />,
    description: 'Connect with your MetaMask wallet',
    recommended: true,
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: <CoinbaseIcon />,
    description: 'Connect with your Coinbase Wallet',
    recommended: false,
  },
];

const ImprovedWalletConnection: React.FC = () => {
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="wallet-connection-container">
      {/* Header */}
      <div className="wallet-connection-header">
        <h2 className="wallet-connection-title">Connect Wallet</h2>
        <p className="wallet-connection-subtitle">
          Select your preferred wallet to get started
        </p>
      </div>

      {/* Recommended Badge */}
      <div className="wallet-connection-section">
        <div className="wallet-section-label">
          <span className="wallet-label-text">Recommended Wallets</span>
          <span className="wallet-label-badge">Browser</span>
        </div>

        {/* Wallet Options Grid */}
        <div className="wallet-options-grid">
          {WALLET_OPTIONS.map((wallet) => (
            <button
              key={wallet.id}
              className={`wallet-option-card ${selectedWallet === wallet.id ? 'wallet-option-active' : ''}`}
              onClick={() => setSelectedWallet(wallet.id)}
              aria-pressed={selectedWallet === wallet.id}
              aria-label={`Connect with ${wallet.name}`}
            >
              {/* Recommended Badge */}
              {wallet.recommended && (
                <div className="wallet-option-badge">
                  <span className="wallet-option-badge-icon">⭐</span>
                  <span className="wallet-option-badge-text">Recommended</span>
                </div>
              )}

              {/* Icon */}
              <div className="wallet-option-icon">
                {wallet.icon}
              </div>

              {/* Name & Description */}
              <div className="wallet-option-content">
                <h3 className="wallet-option-name">{wallet.name}</h3>
                <p className="wallet-option-description">{wallet.description}</p>
              </div>

              {/* Selection Indicator */}
              {selectedWallet === wallet.id && (
                <div className="wallet-option-checkmark">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Info Toggle */}
      <div className="wallet-connection-info-toggle">
        <button
          className="wallet-info-button"
          onClick={() => setShowInfo(!showInfo)}
          aria-expanded={showInfo}
          aria-label="What is a Wallet?"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>What is a Wallet?</span>
        </button>
      </div>

      {/* Info Section */}
      {showInfo && (
        <div className="wallet-connection-info">
          <h3 className="wallet-info-title">A Home for Your Digital Assets</h3>
          <p className="wallet-info-description">
            Wallets are used to send, receive, store, and display digital assets like Ethereum 
            and other tokens. Your wallet is secured by a private key that only you control.
          </p>
          <div className="wallet-info-features">
            <div className="wallet-info-feature">
              <span className="wallet-info-feature-icon">🔒</span>
              <span className="wallet-info-feature-text">Secure & Private</span>
            </div>
            <div className="wallet-info-feature">
              <span className="wallet-info-feature-icon">💼</span>
              <span className="wallet-info-feature-text">Own Your Assets</span>
            </div>
            <div className="wallet-info-feature">
              <span className="wallet-info-feature-icon">⚡</span>
              <span className="wallet-info-feature-text">Fast Transactions</span>
            </div>
          </div>
        </div>
      )}

      {/* Connect Button */}
      {selectedWallet && (
        <button className="wallet-connection-button" aria-label="Connect wallet">
          Connect {WALLET_OPTIONS.find(w => w.id === selectedWallet)?.name}
        </button>
      )}
    </div>
  );
};

export default ImprovedWalletConnection;
