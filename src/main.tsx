import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import { configureMonacoCdn } from "@/lib/monaco";
import App from "./App.tsx";

// Configure Monaco CDN once at app startup
configureMonacoCdn();
import { 
  queryClient, 
  RainbowKitProvider, 
  QueryClientProvider,
  web3ToolkitTheme,
  RpcAwareWagmiProvider
} from './config/rainbowkit';
import { NetworkConfigProvider } from "./contexts/NetworkConfigContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NetworkConfigProvider>
      <RpcAwareWagmiProvider>
        <QueryClientProvider client={queryClient}>
          <RainbowKitProvider theme={web3ToolkitTheme}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </RainbowKitProvider>
        </QueryClientProvider>
      </RpcAwareWagmiProvider>
    </NetworkConfigProvider>
  </StrictMode>
);
