import React from 'react';
import { DynamicWidget, useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Wallet, 
  ChevronDown, 
  Settings, 
  LogOut, 
  Copy,
  ExternalLink,
  Zap
} from 'lucide-react';

interface DynamicWalletButtonProps {
  className?: string;
}

export const DynamicWalletButton: React.FC<DynamicWalletButtonProps> = ({ 
  className = '' 
}) => {
  const { 
    user, 
    primaryWallet, 
    handleLogOut,
    setShowAuthFlow 
  } = useDynamicContext();

  const [showDropdown, setShowDropdown] = React.useState(false);

  // Handle wallet connection
  const handleConnect = () => {
    setShowAuthFlow(true);
  };

  // Copy wallet address
  const copyAddress = async () => {
    if (primaryWallet?.address) {
      await navigator.clipboard.writeText(primaryWallet.address);
      // Could add toast notification here
    }
  };

  // Format address for display
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Check authentication status
  const isAuthenticated = !!user && !!primaryWallet;

  // Get wallet info
  const getWalletInfo = () => {
    if (!primaryWallet) return null;
    
    return {
      address: primaryWallet.address,
      connector: primaryWallet.connector?.name || 'Unknown',
      network: 'Ethereum', // Default to Ethereum for now
    };
  };

  const walletInfo = getWalletInfo();

  // Animation variants
  const buttonVariants = {
    initial: { scale: 1 },
    hover: { 
      scale: 1.02,
      transition: { duration: 0.2 }
    },
    tap: { 
      scale: 0.98,
      transition: { duration: 0.1 }
    }
  };

  const dropdownVariants = {
    initial: { 
      opacity: 0, 
      y: -10, 
      scale: 0.95 
    },
    animate: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: {
        type: 'spring' as const,
        stiffness: 300,
        damping: 30
      }
    },
    exit: { 
      opacity: 0, 
      y: -10, 
      scale: 0.95,
      transition: { duration: 0.2 }
    }
  };

  if (!isAuthenticated || !walletInfo) {
    return (
      <motion.div 
        className={`dynamic-wallet-button-container ${className}`}
        variants={buttonVariants}
        initial="initial"
        whileHover="hover"
        whileTap="tap"
      >
        <motion.button
          onClick={handleConnect}
          className="dynamic-connect-button"
          whileHover={{ boxShadow: 'var(--glow-cyan-strong)' }}
        >
          <Wallet size={20} />
          <span>Connect Wallet</span>
          <Zap size={16} className="connect-icon" />
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div className={`dynamic-wallet-button-container ${className}`}>
      <motion.div
        className="dynamic-wallet-connected"
        variants={buttonVariants}
        initial="initial"
        whileHover="hover"
        whileTap="tap"
      >
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="dynamic-wallet-info-button"
        >
          <div className="wallet-avatar">
            <Wallet size={16} />
          </div>
          
          <div className="wallet-details">
            <span className="wallet-address">
              {formatAddress(walletInfo.address)}
            </span>
            <span className="wallet-network">
              {walletInfo.network}
            </span>
          </div>
          
          <motion.div
            animate={{ rotate: showDropdown ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={16} />
          </motion.div>
        </button>

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              className="dynamic-wallet-dropdown"
              variants={dropdownVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              onMouseLeave={() => setShowDropdown(false)}
            >
              {/* Wallet Info Section */}
              <div className="dropdown-section">
                <div className="dropdown-item-header">
                  <strong>Connected Wallet</strong>
                </div>
                <div className="dropdown-item-info">
                  <span>Connector: {walletInfo.connector}</span>
                  <span>Network: {walletInfo.network}</span>
                </div>
              </div>

              <div className="dropdown-divider" />

              {/* Actions Section */}
              <div className="dropdown-section">
                <button 
                  className="dropdown-action"
                  onClick={copyAddress}
                >
                  <Copy size={16} />
                  <span>Copy Address</span>
                </button>
                
                <button 
                  className="dropdown-action"
                  onClick={() => window.open(`https://etherscan.io/address/${walletInfo.address}`, '_blank')}
                >
                  <ExternalLink size={16} />
                  <span>View on Explorer</span>
                </button>
                
                <button 
                  className="dropdown-action"
                  onClick={() => setShowDropdown(false)}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </button>
              </div>

              <div className="dropdown-divider" />

              {/* Disconnect Section */}
              <div className="dropdown-section">
                <button 
                  className="dropdown-action disconnect-action"
                  onClick={handleLogOut}
                >
                  <LogOut size={16} />
                  <span>Disconnect</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Hidden Dynamic Widget for auth flows */}
      <div style={{ display: 'none' }}>
        <DynamicWidget />
      </div>
    </div>
  );
};

export default DynamicWalletButton;