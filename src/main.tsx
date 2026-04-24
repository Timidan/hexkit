import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import { configureMonacoCdn } from "@/lib/monaco";
import App from "./App.tsx";

// Configure Monaco CDN once at app startup
configureMonacoCdn();

// wagmi + RainbowKit are scoped to /evm/* via EvmFamilyProviders; imported
// separately from QueryClient so main.tsx doesn't transitively load them.
import { queryClient, QueryClientProvider } from "./config/queryClient";
import { NetworkConfigProvider } from "./contexts/NetworkConfigContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <NetworkConfigProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </NetworkConfigProvider>
    </HelmetProvider>
  </StrictMode>
);
