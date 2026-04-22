import React, { useState, useCallback, useMemo } from "react";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { MagnifyingGlass, X, CircleNotch } from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../components/ui/tabs";
import { Input } from "../../../components/ui/input";
import { VaultList } from "./VaultList";
import { VaultDrawer } from "./VaultDrawer";
import { PositionsView } from "./PositionsView";
import { ConciergePanel } from "./concierge/ConciergePanel";
import { IdleYieldBanner } from "./IdleYieldBanner";
import { useEarnPositions } from "./hooks/useEarnPositions";
import { usePositionVaults } from "./hooks/usePositionVaults";
import type { EarnVault } from "./types";
import { shortenAddress as truncateAddress } from "../../shared/AddressDisplay";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Strip whitespace and zero-width chars so pasted addresses with stray
// newlines/NBSP still match the 0x-hex regex.
function sanitizeAddressInput(value: string): string {
  return value.replace(/[\s\u200B-\u200D\uFEFF]+/g, "");
}

const LifiEarnPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("positions");
  const [selectedVault, setSelectedVault] = useState<EarnVault | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { address: walletAddress, isConnected } = useAccount();
  const [inputAddress, setInputAddress] = useState("");

  const sanitizedInput = useMemo(
    () => sanitizeAddressInput(inputAddress),
    [inputAddress]
  );
  const inputIsValid = ADDRESS_REGEX.test(sanitizedInput);
  const inputHasError = sanitizedInput.length > 0 && !inputIsValid;

  const targetAddress = inputIsValid
    ? sanitizedInput
    : walletAddress ?? null;

  const { data: positionsData, isFetching: positionsFetching } = useEarnPositions(targetAddress);
  const { data: positionVaults } = usePositionVaults(positionsData?.positions ?? []);

  const handleSelectVault = useCallback((vault: EarnVault) => {
    setSelectedVault(vault);
    setDrawerOpen(true);
  }, []);

  const handleCloseDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">LI.FI Earn</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Browse yield vaults, simulate deposits, and manage positions across 20+ protocols
        </p>
      </div>

      <div className="mb-4 flex w-full flex-col sm:w-[260px]">
        <div className="relative">
          {inputIsValid && positionsFetching ? (
            <CircleNotch className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-emerald-500" />
          ) : (
            <MagnifyingGlass
              className={`pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
                inputHasError ? "text-destructive" : "text-muted-foreground"
              }`}
            />
          )}
          <Input
            className={`h-7 pl-8 pr-7 text-xs ${
              inputHasError
                ? "border-destructive/60 focus-visible:ring-destructive/30"
                : ""
            }`}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            aria-invalid={inputHasError || undefined}
            value={inputAddress}
            onChange={(e) => setInputAddress(e.target.value)}
            placeholder={
              isConnected && walletAddress
                ? `Connected: ${truncateAddress(walletAddress)}`
                : "Paste address..."
            }
          />
          {inputAddress && (
            <button
              type="button"
              onClick={() => setInputAddress("")}
              aria-label="Clear address"
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        {inputHasError && (
          <p className="mt-1 text-[10px] leading-none text-destructive">
            Not a valid 0x address
          </p>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-col gap-2 border-b border-border/40 sm:flex-row sm:items-center sm:gap-4">
          <TabsList className="h-auto flex-1 justify-start gap-6 rounded-none border-0 bg-transparent p-0">
            {[
              { value: "positions", label: "My Positions" },
              { value: "vaults", label: "Vaults" },
            ].map((tab) => (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="relative h-9 flex-none rounded-none border-0 bg-transparent px-0 text-sm font-medium text-muted-foreground shadow-none transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:border-transparent"
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {tab.value === "positions" && (
                    <IdleYieldBanner onSelectVault={handleSelectVault} targetAddress={targetAddress} />
                  )}
                </span>
                {activeTab === tab.value && (
                  <motion.div
                    layoutId="earn-tab-indicator"
                    className="absolute inset-x-0 -bottom-px h-[2px] bg-foreground"
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  />
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="positions" className="mt-3">
          <div className="flex flex-col gap-8">
            <section>
              <PositionsView targetAddress={targetAddress} vaults={positionVaults ?? []} />
            </section>

            <section className="border-t border-border/40 pt-6">
              <ConciergePanel onSelectVault={handleSelectVault} targetAddress={targetAddress} />
            </section>
          </div>
        </TabsContent>

        <TabsContent value="vaults" className="mt-3">
          <VaultList onSelectVault={handleSelectVault} />
        </TabsContent>
      </Tabs>

      <VaultDrawer
        vault={selectedVault}
        open={drawerOpen}
        onClose={handleCloseDrawer}
      />
    </div>
  );
};

export default LifiEarnPage;
