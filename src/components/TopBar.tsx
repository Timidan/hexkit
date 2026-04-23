import React, { Suspense, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  GearSix as SettingsIcon,
  HardDrive,
  List,
  X,
  MagnifyingGlass,
  Lightning,
} from "@phosphor-icons/react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import RainbowKitWallet from "./RainbowKitWallet";

import UniversalSearchBar from "./UniversalSearchBar";
import { useNetworkConfig } from "@/contexts/NetworkConfigContext";
import { cn } from "@/lib/utils";
import { useBreakpoint } from "@/hooks/useBreakpoint";

interface TopBarProps {
  onOpenRpcSettings: () => void;
  onOpenStorageManager: () => void;
  className?: string;
  onToggleMobileMenu?: () => void;
  isMobileMenuOpen?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({
  onOpenRpcSettings,
  onOpenStorageManager,
  className,
  onToggleMobileMenu,
  isMobileMenuOpen,
}) => {
  const { isMobile } = useBreakpoint();
  const { config } = useNetworkConfig();

  const needsKeys =
    config.etherscanKeyMode === "personal" && !config.etherscanApiKey?.trim();

  const [popoverOpen, setPopoverOpen] = useState(false);

  useEffect(() => {
    if (!needsKeys) {
      setPopoverOpen(false);
      return;
    }
    const openTimer = setTimeout(() => setPopoverOpen(true), 1500);
    return () => clearTimeout(openTimer);
  }, [needsKeys]);

  useEffect(() => {
    if (!popoverOpen) return;
    const closeTimer = setTimeout(() => setPopoverOpen(false), 5000);
    return () => clearTimeout(closeTimer);
  }, [popoverOpen]);

  return (
    <header
      className={cn(
        "topbar sticky top-0 z-50 flex h-12 md:h-14 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur-sm",
        className,
      )}
    >
      <Link
        to="/"
        aria-label="HexKit home"
        className="flex shrink-0 items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <svg
          viewBox="0 0 100 100"
          fill="none"
          width={isMobile ? 32 : 44}
          height={isMobile ? 32 : 44}
          className="text-foreground"
        >
          <polygon
            points="50,10 84.6,30 84.6,70 50,90 15.4,70 15.4,30"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinejoin="miter"
          />
          <line
            x1="36"
            y1="31"
            x2="36"
            y2="69"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="square"
          />
          <line
            x1="64"
            y1="31"
            x2="64"
            y2="69"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="square"
          />
          <line
            x1="36"
            y1="50"
            x2="64"
            y2="50"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="square"
          />
          <line
            x1="1"
            y1="39"
            x2="15.4"
            y2="39"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
          />
          <line
            x1="0"
            y1="50"
            x2="15.4"
            y2="50"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
          />
          <line
            x1="1"
            y1="61"
            x2="15.4"
            y2="61"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
          />
          <line
            x1="84.6"
            y1="39"
            x2="99"
            y2="39"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
          />
          <line
            x1="84.6"
            y1="50"
            x2="100"
            y2="50"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
          />
          <line
            x1="84.6"
            y1="61"
            x2="99"
            y2="61"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
          />
        </svg>
        <span
          className="hidden md:inline text-lg font-extrabold tracking-[0.14em] text-foreground"
          style={{
            fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace",
          }}
        >
          HEXKIT
        </span>
      </Link>

      <div className="pointer-events-none absolute inset-0 hidden md:flex items-center justify-center px-2">
        <UniversalSearchBar
          className="pointer-events-auto w-full max-w-[460px]"
          onOpenRpcSettings={onOpenRpcSettings}
          onOpenStorageManager={onOpenStorageManager}
        />
      </div>

      <div className="flex-1" />

      <div className="flex shrink-0 items-center gap-1.5">
        {isMobile && (
          <Button
            type="button"
            variant="icon-borderless"
            size="icon-inline"
            className="touch-target"
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "k",
                  ctrlKey: true,
                  bubbles: true,
                }),
              )
            }
            title="Search"
            aria-label="Search"
          >
            <MagnifyingGlass size={16} />
          </Button>
        )}
        <RainbowKitWallet />
        <Button
          type="button"
          variant="icon-borderless"
          size="icon-inline"
          className="storage-manager-trigger"
          onClick={onOpenStorageManager}
          title="Storage Manager"
          aria-label="Storage manager"
        >
          <HardDrive size={15} />
        </Button>
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="icon-borderless"
              size="icon-inline"
              className="rpc-settings-trigger relative"
              onClick={(e) => {
                e.preventDefault();
                setPopoverOpen(false);
                onOpenRpcSettings();
              }}
              title="RPC Settings"
              aria-label="RPC settings"
            >
              <SettingsIcon size={16} />
              {needsKeys && (
                <span
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400"
                  style={{
                    animation: "rpc-hint-pulse 2s ease-in-out infinite",
                  }}
                />
              )}
            </Button>
          </PopoverTrigger>
          {needsKeys && (
            <PopoverContent
              side="bottom"
              align="end"
              sideOffset={8}
              className="w-64 p-3"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <div className="flex items-start gap-2.5">
                <Lightning className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-xs font-medium leading-snug">
                    Add your personal explorer key or switch back to the app default key
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                    Personal browser-held keys stay client-visible on this device
                  </p>
                </div>
              </div>
            </PopoverContent>
          )}
        </Popover>
        {isMobile && onToggleMobileMenu && (
          <Button
            type="button"
            variant="icon-borderless"
            size="icon-inline"
            className="touch-target"
            onClick={onToggleMobileMenu}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {isMobileMenuOpen ? <X size={20} /> : <List size={20} />}
          </Button>
        )}
      </div>
    </header>
  );
};

export default TopBar;
