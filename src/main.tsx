import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import { configureMonacoCdn } from "@/lib/monaco";
import App from "./App.tsx";

// Configure Monaco CDN once at app startup
configureMonacoCdn();
import { ChainProviders } from "./chains/plugins";
import { NetworkConfigProvider } from "./contexts/NetworkConfigContext";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <NetworkConfigProvider>
        <ChainProviders>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ChainProviders>
      </NetworkConfigProvider>
    </HelmetProvider>
  </StrictMode>
);
