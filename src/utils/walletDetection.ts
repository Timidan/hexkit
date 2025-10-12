import type { WalletInfo } from '../types/transaction';

// Wallet detection utilities
export const detectWallets = (): WalletInfo[] => {
  const wallets: WalletInfo[] = [];

  // MetaMask detection
  if (typeof window !== 'undefined' && window.ethereum) {
    const ethereum = window.ethereum as any;
    
    if (ethereum.isMetaMask) {
      wallets.push({
        name: 'MetaMask',
        icon: 'metamask',
        isInstalled: true,
        isConnected: ethereum.selectedAddress !== null,
        accounts: ethereum.selectedAddress ? [ethereum.selectedAddress] : [],
        address: ethereum.selectedAddress || '',
        chainId: ethereum.chainId || '0x1',
        provider: ethereum,
      });
    }

    // Rabby detection (Rabby injects into window.ethereum but has specific identifier)
    if (ethereum.isRabby) {
      wallets.push({
        name: 'Rabby',
        icon: 'rabby',
        isInstalled: true,
        isConnected: ethereum.selectedAddress !== null,
        accounts: ethereum.selectedAddress ? [ethereum.selectedAddress] : [],
        address: ethereum.selectedAddress || '',
        chainId: ethereum.chainId || '0x1',
        provider: ethereum,
      });
    }

    // Generic injected wallet (fallback)
    if (!ethereum.isMetaMask && !ethereum.isRabby) {
      wallets.push({
        name: 'Browser Wallet',
        icon: 'browser',
        isInstalled: true,
        isConnected: ethereum.selectedAddress !== null,
        accounts: ethereum.selectedAddress ? [ethereum.selectedAddress] : [],
        address: ethereum.selectedAddress || '',
        chainId: ethereum.chainId || '0x1',
        provider: ethereum,
      });
    }
  }

  // Check for Coinbase Wallet
  if (typeof window !== 'undefined' && (window as any).coinbaseWalletExtension) {
    const coinbase = (window as any).coinbaseWalletExtension;
    wallets.push({
      name: 'Coinbase Wallet',
      icon: 'coinbase',
      isInstalled: true,
      isConnected: false, // Would need to check connection status
      accounts: [],
      address: '',
      chainId: '0x1',
      provider: coinbase,
    });
  }

  return wallets;
};

export const connectWallet = async (wallet: WalletInfo): Promise<WalletInfo> => {
  if (!wallet.provider) {
    throw new Error('No provider available');
  }

  try {
    const accounts = await wallet.provider.request({
      method: 'eth_requestAccounts',
    });

    const chainId = await wallet.provider.request({
      method: 'eth_chainId',
    });

    return {
      ...wallet,
      isConnected: true,
      accounts,
      chainId,
    };
  } catch (error) {
    console.error('Failed to connect wallet:', error);
    throw new Error(`Failed to connect to ${wallet.name}`);
  }
};

export const switchChain = async (provider: any, chainId: string): Promise<void> => {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId }],
    });
  } catch (error: any) {
    // If chain is not added to wallet, add it
    if (error.code === 4902) {
      throw new Error('Chain not found in wallet. Please add it manually.');
    }
    throw error;
  }
};

export const getWalletProvider = (providerInstance: any) => {
  // Return a Web3Provider compatible with ethers.js v5
  if (typeof window !== 'undefined' && providerInstance) {
    return providerInstance;
  }
  return null;
};

// Chain helpers
export const getChainName = (chainId: string): string => {
  const chainNames: { [key: string]: string } = {
    '0x1': 'Ethereum Mainnet',
    '0x89': 'Polygon',
    '0x38': 'BSC',
    '0xa4b1': 'Arbitrum One',
    '0xa': 'Optimism',
    '0x2105': 'Base',
  };
  return chainNames[chainId] || `Chain ${chainId}`;
};

export const formatAddress = (address: string): string => {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};
