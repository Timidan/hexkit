import React from "react";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { DynamicWagmiConnector } from "@dynamic-labs/wagmi-connector";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "../config/web3";
import {
  dynamicConfig,
  
  DYNAMIC_CHAINS,
} from "../config/dynamic";

const queryClient = new QueryClient();

interface DynamicWeb3ProviderProps {
  children: React.ReactNode;
}

export const DynamicWeb3Provider: React.FC<DynamicWeb3ProviderProps> = ({
  children,
}) => {
  // Check if Dynamic is properly configured
  React.useEffect(() => {
  }, []);

  return (
    <DynamicContextProvider
      settings={{
        environmentId: dynamicConfig.environmentId,
        walletConnectors: dynamicConfig.walletConnectors,
        overrides: {
          evmNetworks: DYNAMIC_CHAINS,
        },

        // Enhanced UI settings for cyberpunk theme
        cssOverrides: `
          /* Cyberpunk theme overrides for Dynamic widgets */
          .dynamic-widget-container {
            --dynamic-color-primary: #00ffff;
            --dynamic-color-primary-hover: #00cccc;
            --dynamic-color-background: #0a0a0a;
            --dynamic-color-background-secondary: #1a1a1a;
            --dynamic-color-text: #ffffff;
            --dynamic-color-text-secondary: #cccccc;
            --dynamic-border: 2px solid rgba(0, 255, 255, 0.2);
            --dynamic-border-radius: 12px;
            --dynamic-font-family: 'Space Grotesk', system-ui, sans-serif;
          }
          
          .dynamic-modal-overlay {
            backdrop-filter: blur(20px);
            background: rgba(0, 0, 0, 0.9);
          }
          
          .dynamic-widget-container button {
            background: rgba(0, 255, 255, 0.15) !important;
            backdrop-filter: blur(20px) !important;
            border: 1px solid rgba(0, 255, 255, 0.3) !important;
            color: #00ffff !important;
            font-weight: 600 !important;
            text-shadow: 0 0 8px rgba(0, 255, 255, 0.5) !important;
            box-shadow: 
              0 8px 32px rgba(0, 255, 255, 0.2),
              0 2px 8px rgba(0, 255, 255, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.3),
              inset 0 -1px 0 rgba(0, 255, 255, 0.2) !important;
            transition: all 0.3s ease !important;
          }
          
          .dynamic-widget-container button:hover {
            transform: translateY(-2px) scale(1.02) !important;
            box-shadow: 0 6px 12px rgba(0, 0, 0, 0.4), 0 0 25px rgba(0, 255, 255, 0.6) !important;
          }
          
          .dynamic-wallet-list-item {
            background: rgba(26, 26, 26, 0.8) !important;
            border: 1px solid rgba(0, 255, 255, 0.2) !important;
            border-radius: 12px !important;
            backdrop-filter: blur(10px) !important;
          }
          
          .dynamic-wallet-list-item:hover {
            border-color: rgba(0, 255, 255, 0.5) !important;
            box-shadow: 0 0 15px rgba(0, 255, 255, 0.3) !important;
          }
        `,

        // Event handlers for logging
        events: {
          onAuthSuccess: (user: unknown) => {
            console.log(" Dynamic: User authenticated", user);
          },
          onAuthFlowCancel: () => {
            console.log(" Dynamic: Auth flow cancelled");
          },
          onLogout: () => {
            console.log(" Dynamic: User logged out");
          },
        },
      }}
    >
      <DynamicWagmiConnector>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        </WagmiProvider>
      </DynamicWagmiConnector>
    </DynamicContextProvider>
  );
};

export default DynamicWeb3Provider;
