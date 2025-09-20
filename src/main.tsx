import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { 
  config, 
  queryClient, 
  RainbowKitProvider, 
  WagmiProvider, 
  QueryClientProvider,
  web3ToolkitTheme
} from './config/rainbowkit';
// import DynamicWeb3Provider from './components/DynamicWeb3Provider'

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={config as any}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={web3ToolkitTheme}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
