// Provider stays mounted for the session once activated; the WalletManager
// decides when to mount it. autoConnect is enabled so previously-used wallets
// are restored from the SDK's own localStorage on remount.
import { useMemo, type ReactNode } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
} from "@solana/wallet-adapter-wallets";
import { useNetworkConfig } from "@/contexts/NetworkConfigContext";
import "@solana/wallet-adapter-react-ui/styles.css";

export function SolanaFamilyProviders({ children }: { children: ReactNode }) {
  const { resolveSolanaRpc } = useNetworkConfig();
  // ConnectionProvider accepts a new endpoint without re-mounting, so
  // wallet-adapter's selection state survives RPC provider changes.
  const endpoint = resolveSolanaRpc("mainnet-beta").url;
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default SolanaFamilyProviders;
