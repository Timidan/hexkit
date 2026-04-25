/**
 * Mounted inside <SolanaFamilyProviders>. Reads @solana/wallet-adapter-react
 * state and forwards it to the WalletManager. Uses the wallet-adapter-react-
 * ui modal for picker UX — the bridge only toggles visibility.
 */
import { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useWalletManager } from "@/contexts/WalletManager";

export function SolanaBridge() {
  const manager = useWalletManager();
  const { publicKey, connected, wallet, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    manager.registerBridge("svm", {
      openPicker: () => setVisible(true),
      disconnect: () => {
        void disconnect();
      },
    });
    return () => manager.unregisterBridge("svm");
  }, [manager, setVisible, disconnect]);

  useEffect(() => {
    if (connected && publicKey) {
      manager.updateConnection("svm", {
        address: publicKey.toBase58(),
        chainId: null,
        connectorId: wallet?.adapter.name ?? null,
        connectorName: wallet?.adapter.name ?? null,
      });
    } else {
      manager.updateConnection("svm", null);
    }
  }, [manager, connected, publicKey, wallet]);

  return null;
}

export default SolanaBridge;
