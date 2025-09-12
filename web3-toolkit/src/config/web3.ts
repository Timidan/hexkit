import { createConfig, http } from 'wagmi'
import { 
  mainnet, 
  polygon, 
  bsc, 
  arbitrum, 
  optimism, 
  base,
  avalanche 
} from 'wagmi/chains'
import { coinbaseWallet, injected, walletConnect } from 'wagmi/connectors'

// Get project ID from environment or use a default for development
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id'

// Enhanced multi-chain configuration
export const config = createConfig({
  chains: [
    mainnet, 
    polygon, 
    bsc, 
    arbitrum, 
    optimism, 
    base,
    avalanche
  ],
  connectors: [
    injected(),
    coinbaseWallet({
      appName: 'Web3 Toolkit',
      appLogoUrl: 'https://web3-toolkit.example.com/logo.png',
    }),
    walletConnect({
      projectId,
      metadata: {
        name: 'Web3 Toolkit',
        description: 'A comprehensive Web3 developer toolkit with Dynamic integration',
        url: 'https://web3-toolkit.example.com',
        icons: ['https://web3-toolkit.example.com/logo.png'],
      },
    }),
  ],
  transports: {
    [mainnet.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(), 
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
    [avalanche.id]: http(),
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}