import React, { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import type { Connector } from "wagmi";

interface InlineWalletConnectProps {
  size?: "compact" | "regular";
  chainId?: number;
  chainName?: string;
}

const shortenAddress = (address?: string) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

const InlineWalletConnect: React.FC<InlineWalletConnectProps> = ({
  size = "regular",
  chainId,
  chainName,
}) => {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    connect,
    connectors,
    error,
    isPending,
    variables,
  } = useConnect();
  const {
    switchChain,
    isPending: isSwitchPending,
    error: switchError,
  } = useSwitchChain();

  const readyConnectors = useMemo(
    () => connectors.filter((connector) => connector.ready),
    [connectors]
  );

  const [selectedId, setSelectedId] = useState<string | undefined>(
    readyConnectors[0]?.id
  );

  useEffect(() => {
    if (
      readyConnectors.length > 0 &&
      !readyConnectors.find((connector) => connector.id === selectedId)
    ) {
      setSelectedId(readyConnectors[0].id);
    }
  }, [readyConnectors, selectedId]);

  const activeConnector: Connector | undefined =
    readyConnectors.find((connector) => connector.id === selectedId) ||
    readyConnectors[0];

  type ConnectArgs = Parameters<typeof connect>;
  type ConnectChainId = ConnectArgs[0] extends { chainId?: infer Id }
    ? Id
    : never;
  type SwitchArgs = Parameters<typeof switchChain>;
  type SwitchChainId = SwitchArgs[0] extends { chainId: infer Id }
    ? Id
    : never;

  const supportedChainIds = useMemo(() => {
    const ids = new Set<number>();
    readyConnectors.forEach((connector) => {
      const connectorChains = Array.isArray((connector as Connector).chains)
        ? ((connector as Connector).chains as Array<{ id: number }>)
        : [];
      connectorChains.forEach((connectorChain) => {
        if (typeof connectorChain.id === "number") {
          ids.add(connectorChain.id);
        }
      });
    });
    return ids;
  }, [readyConnectors]);

  const normalizeChainId = <T extends number | undefined,>(
    value: number | undefined
  ): T | undefined => {
    if (value === undefined) return undefined;
    return supportedChainIds.has(value) ? (value as T) : undefined;
  };

  const desiredChainId = normalizeChainId<ConnectChainId & SwitchChainId>(
    chainId
  );

  const needsSwitch = Boolean(
    desiredChainId !== undefined &&
      isConnected &&
      chain?.id !== desiredChainId
  );

  const handleConnect = () => {
    if (!activeConnector) {
      return;
    }

    if (needsSwitch && desiredChainId !== undefined) {
      switchChain({ chainId: desiredChainId as SwitchChainId });
      return;
    }

    const connectChainId =
      desiredChainId !== undefined ? (desiredChainId as ConnectChainId) : undefined;
    connect({
      connector: activeConnector,
      ...(connectChainId !== undefined ? { chainId: connectChainId } : {}),
    });
  };

  const handleSwitch = () => {
    if (desiredChainId !== undefined) {
      switchChain({ chainId: desiredChainId as SwitchChainId });
    }
  };

  const buttonPadding = size === "compact" ? "8px 18px" : "12px 24px";
  const fontSize = size === "compact" ? "12px" : "14px";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        flexWrap: "wrap",
      }}
    >
      {isConnected ? (
        <>
          <span
            style={{
              fontFamily: "monospace",
              fontSize,
              color: "#a5b4fc",
            }}
          >
            {shortenAddress(address)}
          </span>
          {needsSwitch ? (
            <button
              type="button"
              onClick={handleSwitch}
              disabled={isSwitchPending}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(59, 130, 246, 0.45)",
                background: "rgba(59, 130, 246, 0.22)",
                color: "#bfdbfe",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {isSwitchPending
                ? "Switching…"
                : `Switch to ${chainName || `chain ${desiredChainId}`}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => disconnect()}
              style={{
                padding: "8px 14px",
                borderRadius: "8px",
                border: "1px solid rgba(248, 113, 113, 0.4)",
                background: "rgba(248, 113, 113, 0.16)",
                color: "#fecaca",
                fontSize: "12px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Disconnect
            </button>
          )}
        </>
      ) : (
        <>
          {readyConnectors.length > 1 && (
            <select
              value={activeConnector?.id ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: "8px",
                border: "1px solid rgba(59, 130, 246, 0.35)",
                background: "rgba(15, 23, 42, 0.6)",
                color: "#cbd5f5",
                fontSize: "12px",
              }}
            >
              {readyConnectors.map((connector) => (
                <option key={connector.id} value={connector.id}>
                  {connector.name}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={handleConnect}
            disabled={!activeConnector || isPending}
            style={{
              padding: buttonPadding,
              borderRadius: "10px",
              border: "1px solid rgba(59, 130, 246, 0.45)",
              background: "rgba(59, 130, 246, 0.2)",
              color: "#dbeafe",
              fontSize,
              fontWeight: 600,
              cursor: activeConnector ? "pointer" : "not-allowed",
              opacity: activeConnector ? 1 : 0.5,
            }}
          >
            {isPending &&
            (variables?.connector as Connector | undefined)?.id ===
              activeConnector?.id
              ? "Connecting…"
              : `Connect ${activeConnector?.name ?? "Wallet"}`}
          </button>
          {error && (
            <span style={{ fontSize: "11px", color: "#f87171" }}>
              {error.message}
            </span>
          )}
        </>
      )}
      {switchError && (
        <span style={{ fontSize: "11px", color: "#f87171" }}>
          {switchError.message}
        </span>
      )}
    </div>
  );
};

export default InlineWalletConnect;
