/// <reference types="vite/client" />

interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on: (eventName: string, handler: (...args: any[]) => void) => void;
  removeListener: (eventName: string, handler: (...args: any[]) => void) => void;
  selectedAddress: string | null;
  chainId: string;
  isMetaMask?: boolean;
  isRabby?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
    coinbaseWalletExtension?: any;
  }
}

export {};
