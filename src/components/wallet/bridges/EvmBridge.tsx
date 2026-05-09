/**
 * Mounted inside <EvmFamilyProviders>. Reads wagmi + RainbowKit state and
 * forwards it to the WalletManager. Registers imperative handles so the
 * top-bar picker can open the RainbowKit modal and disconnect.
 */
import { useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useWalletManager } from "@/contexts/WalletManager";

export function EvmBridge() {
  const manager = useWalletManager();
  const { address, chainId, connector, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { openConnectModal } = useConnectModal();

  useEffect(() => {
    manager.registerBridge("evm", {
      openPicker: () => openConnectModal?.(),
      disconnect: () => disconnect(),
    });
    return () => manager.unregisterBridge("evm");
  }, [manager, openConnectModal, disconnect]);

  useEffect(() => {
    if (isConnected && address) {
      manager.updateConnection("evm", {
        address,
        chainId: chainId ?? null,
        connectorId: connector?.id ?? null,
        connectorName: connector?.name ?? null,
      });
    } else {
      manager.updateConnection("evm", null);
    }
  }, [manager, isConnected, address, chainId, connector]);

  return null;
}

export default EvmBridge;
