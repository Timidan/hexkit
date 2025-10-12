import React, { useState, useEffect } from 'react';
import type { WalletInfo } from '../types/transaction';
import { detectWallets, connectWallet, getChainName, formatAddress, switchChain } from '../utils/walletDetection';
import { SUPPORTED_CHAINS } from '../utils/chains';

interface WalletConnectionProps {
  onWalletConnect: (wallet: WalletInfo) => void;
  onWalletDisconnect: () => void;
  connectedWallet?: WalletInfo;
}

const WalletConnection: React.FC<WalletConnectionProps> = ({
  onWalletConnect,
  onWalletDisconnect,
  connectedWallet,
}) => {
  const [availableWallets, setAvailableWallets] = useState<WalletInfo[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const wallets = detectWallets();
    setAvailableWallets(wallets);

    // Listen for account and chain changes
    if (typeof window !== 'undefined' && window.ethereum) {
      const ethereum = window.ethereum as any;
      
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          onWalletDisconnect();
        } else if (connectedWallet) {
          onWalletConnect({
            ...connectedWallet,
            accounts,
            isConnected: true,
          });
        }
      };

      const handleChainChanged = (chainId: string) => {
        if (connectedWallet) {
          onWalletConnect({
            ...connectedWallet,
            chainId,
          });
        }
      };

      ethereum.on('accountsChanged', handleAccountsChanged);
      ethereum.on('chainChanged', handleChainChanged);

      return () => {
        ethereum.removeListener('accountsChanged', handleAccountsChanged);
        ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [connectedWallet, onWalletConnect, onWalletDisconnect]);

  const handleConnect = async (wallet: WalletInfo) => {
    setConnecting(wallet.name);
    setError(null);

    try {
      const connectedWalletInfo = await connectWallet(wallet);
      onWalletConnect(connectedWalletInfo);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = () => {
    onWalletDisconnect();
    setError(null);
  };

  const handleSwitchChain = async (targetChainId: string) => {
    if (!connectedWallet?.provider) return;

    try {
      await switchChain(connectedWallet.provider, targetChainId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getCurrentChain = () => {
    if (!connectedWallet) return null;
    return SUPPORTED_CHAINS.find(chain => 
      '0x' + chain.id.toString(16) === connectedWallet.chainId
    );
  };

  const isWrongChain = () => {
    const currentChain = getCurrentChain();
    return !currentChain;
  };

  if (connectedWallet?.isConnected) {
    return (
      <div className="wallet-connection connected">
        <div className="wallet-info">
          <div className="wallet-header">
            <span className="wallet-icon">{connectedWallet.icon}</span>
            <div className="wallet-details">
              <div className="wallet-name">{connectedWallet.name}</div>
              <div className="wallet-address">
                {formatAddress(connectedWallet.accounts[0])}
              </div>
            </div>
            <button
              onClick={handleDisconnect}
              className="disconnect-btn"
              title="Disconnect wallet"
            >
              
            </button>
          </div>

          <div className="chain-info">
            <span className="chain-label">Network:</span>
            <span className={`chain-name ${isWrongChain() ? 'wrong-chain' : ''}`}>
              {getChainName(connectedWallet.chainId)}
            </span>
          </div>

          {isWrongChain() && (
            <div className="wrong-chain-warning">
              <p>Unsupported network. Please switch to a supported chain:</p>
              <div className="chain-switcher">
                {SUPPORTED_CHAINS.map((chain) => (
                  <button
                    key={chain.id}
                    onClick={() => handleSwitchChain('0x' + chain.id.toString(16))}
                    className="chain-switch-btn"
                  >
                    {chain.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="connection-error">
            <p style={{ color: '#ff6b6b' }}>{error}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wallet-connection disconnected">
      <h3> Connect Wallet</h3>
      <p>Connect your wallet to build and simulate transactions</p>

      <div className="wallet-list">
        {availableWallets.length === 0 && (
          <div className="no-wallets">
            <p>No wallets detected. Please install a Web3 wallet like:</p>
            <ul>
              <li><a href="https://metamask.io/" target="_blank" rel="noopener noreferrer">MetaMask</a></li>
              <li><a href="https://rabby.io/" target="_blank" rel="noopener noreferrer">Rabby</a></li>
            </ul>
          </div>
        )}

        {availableWallets.map((wallet) => (
          <button
            key={wallet.name}
            onClick={() => handleConnect(wallet)}
            disabled={connecting !== null}
            className="wallet-option"
          >
            <span className="wallet-icon">{wallet.icon}</span>
            <span className="wallet-name">{wallet.name}</span>
            {connecting === wallet.name && (
              <span className="connecting">Connecting...</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <div className="connection-error">
          <p style={{ color: '#ff6b6b' }}>{error}</p>
        </div>
      )}
    </div>
  );
};

export default WalletConnection;
