import React from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createWeb3Modal } from '@web3modal/wagmi'
import { config } from '../config/web3'
import '../styles/Web3ModalOverrides.css'

const queryClient = new QueryClient()

// Get project ID from environment
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'demo-project-id'

// Create Web3Modal - enhanced configuration with custom theming following claude-UI-rules.md
let modal: any = null
try {
  modal = createWeb3Modal({
    wagmiConfig: config,
    projectId,
    enableAnalytics: false,
    enableOnramp: false,
    themeMode: 'dark',
    themeVariables: {
      '--w3m-font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      '--w3m-accent': '#6366f1',
      '--w3m-border-radius-master': '12px',
      // Primary colors
      '--w3m-color-bg-1': 'rgba(15, 16, 20, 0.95)',
      '--w3m-color-bg-2': 'rgba(17, 24, 39, 0.65)',
      '--w3m-color-bg-3': 'rgba(30, 41, 59, 0.5)',
      // Text colors
      '--w3m-color-fg-1': '#f6f6fb',
      '--w3m-color-fg-2': '#9a9aac',
      '--w3m-color-fg-3': '#6b7280',
      // Accent
      '--w3m-color-accent-1': '#6366f1',
      '--w3m-color-accent-2': '#22d3ee',
      // UI elements
      '--w3m-color-success': '#22c55e',
      '--w3m-color-error': '#ef4444',
      '--w3m-color-warning': '#f59e0b',
      // Borders
      '--w3m-color-border': 'rgba(255, 255, 255, 0.08)',
    },
  })
} catch (error) {
  console.warn('Web3Modal initialization failed:', error)
}

interface Web3ProviderProps {
  children: React.ReactNode
}

export const Web3Provider: React.FC<Web3ProviderProps> = ({ children }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}