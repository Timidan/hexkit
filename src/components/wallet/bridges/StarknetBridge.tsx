/**
 * Starknet bridge — subscribes to the Starkzap client and forwards state to
 * the WalletManager. Owns the picker modal for Argent X / Braavos /
 * Cartridge. Pattern follows market-zap (onlyoneAlexia/market-zap).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { X, Warning } from "@phosphor-icons/react";
import {
  getStarkzapClient,
  type StarknetProviderId,
} from "@/chains/starknet/starkzapClient";
import { useWalletManager } from "@/contexts/WalletManager";
import { useNetworkConfig } from "@/contexts/NetworkConfigContext";
import { ARGENT_X_LOGO, BRAAVOS_LOGO, CARTRIDGE_LOGO } from "./starknetLogos";

const PROVIDERS: {
  id: StarknetProviderId;
  label: string;
  description: string;
  logo: string;
  bg: string;
}[] = [
  {
    id: "argentX",
    label: "Argent X",
    description: "Browser extension",
    logo: ARGENT_X_LOGO,
    bg: "#000",
  },
  {
    id: "braavos",
    label: "Braavos",
    description: "Browser extension",
    logo: BRAAVOS_LOGO,
    bg: "#0a0a0c",
  },
  {
    id: "cartridge",
    label: "Cartridge",
    description: "Social login · Google, passkeys, Discord",
    logo: CARTRIDGE_LOGO,
    bg: "#0a0a0c",
  },
];

export function StarknetBridge() {
  const manager = useWalletManager();
  const client = getStarkzapClient();
  const { resolveStarknetRpc } = useNetworkConfig();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState<StarknetProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset the Starkzap client when the resolved RPC URL changes (user
  // switched provider in Settings). Keyed off URL, not configVersion, to
  // avoid thrashing on every keystroke while the user types a key.
  const lastUrlRef = useRef<string>(client.currentRpcUrl());
  const currentUrl = resolveStarknetRpc("mainnet").url;
  useEffect(() => {
    if (currentUrl !== lastUrlRef.current) {
      lastUrlRef.current = currentUrl;
      void client.reset();
    }
  }, [currentUrl, client]);

  useEffect(() => {
    return client.subscribe((s) => {
      if (s.address && s.provider) {
        const entry = PROVIDERS.find((p) => p.id === s.provider);
        manager.updateConnection("starknet", {
          address: s.address,
          chainId: s.network,
          connectorId: s.provider,
          connectorName: entry?.label ?? s.provider,
        });
      } else {
        manager.updateConnection("starknet", null);
      }
    });
  }, [client, manager]);

  useEffect(() => {
    manager.registerBridge("starknet", {
      openPicker: () => {
        setError(null);
        setPickerOpen(true);
      },
      disconnect: () => {
        void client.disconnect();
      },
    });
    return () => manager.unregisterBridge("starknet");
  }, [manager, client]);

  const handleSelect = useCallback(
    async (id: StarknetProviderId) => {
      setBusy(id);
      setError(null);
      try {
        if (id === "cartridge") {
          await client.connectCartridge();
        } else {
          await client.connectBrowserWallet(id);
        }
        setPickerOpen(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Connection failed");
      } finally {
        setBusy(null);
      }
    },
    [client],
  );

  if (!pickerOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Select Starknet wallet"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={() => !busy && setPickerOpen(false)}
      data-testid="starknet-picker"
    >
      <div
        className="w-full max-w-[360px] rounded-2xl border border-border/60 bg-[#0c0c0f] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <div className="text-sm font-semibold text-foreground">Connect a Starknet wallet</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Powered by Starkzap
            </div>
          </div>
          <button
            type="button"
            onClick={() => !busy && setPickerOpen(false)}
            disabled={busy !== null}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-40"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="h-px bg-border/40" />

        <ul className="flex flex-col py-2">
          {PROVIDERS.map(({ id, label, description, logo, bg }) => {
            const isBusy = busy === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => handleSelect(id)}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed"
                  data-testid={`starknet-option-${id}`}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg overflow-hidden ring-1 ring-white/10"
                    style={{ backgroundColor: bg }}
                  >
                    <img
                      src={logo}
                      alt=""
                      width={40}
                      height={40}
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {description}
                    </div>
                  </div>
                  {isBusy && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      connecting…
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {error && (
          <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] text-destructive">
            <Warning className="mt-0.5 h-3.5 w-3.5 shrink-0" weight="fill" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        <div className="border-t border-border/40 px-5 py-2.5 text-center text-[10px] text-muted-foreground">
          By connecting you agree to the wallet provider's terms.
        </div>
      </div>
    </div>
  );
}

export default StarknetBridge;
