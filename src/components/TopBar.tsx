import React, { Suspense } from "react";
import { Settings as SettingsIcon, HardDrive } from "lucide-react";
import { Button } from "./ui/button";
import RainbowKitWallet from "./RainbowKitWallet";
import EdbBridgeStatus from "./EdbBridgeStatus";
import UniversalSearchBar from "./UniversalSearchBar";
import { cn } from "@/lib/utils";

interface TopBarProps {
  onOpenRpcSettings: () => void;
  onOpenStorageManager: () => void;
  className?: string;
}

const TopBar: React.FC<TopBarProps> = ({
  onOpenRpcSettings,
  onOpenStorageManager,
  className,
}) => {
  return (
    <header
      className={cn(
        "topbar sticky top-0 z-50 flex h-14 items-center gap-2 border-b border-border/50 bg-background/95 px-4 backdrop-blur-sm",
        className,
      )}
    >
      {/* Left: branding */}
      <div className="flex shrink-0 items-center gap-2.5">
        <svg viewBox="0 0 100 100" fill="none" width={44} height={44} className="text-foreground">
          <polygon points="50,10 84.6,30 84.6,70 50,90 15.4,70 15.4,30" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="miter"/>
          <line x1="36" y1="31" x2="36" y2="69" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square"/>
          <line x1="64" y1="31" x2="64" y2="69" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square"/>
          <line x1="36" y1="50" x2="64" y2="50" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square"/>
          <line x1="1" y1="39" x2="15.4" y2="39" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
          <line x1="0" y1="50" x2="15.4" y2="50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
          <line x1="1" y1="61" x2="15.4" y2="61" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
          <line x1="84.6" y1="39" x2="99" y2="39" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
          <line x1="84.6" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
          <line x1="84.6" y1="61" x2="99" y2="61" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
        </svg>
        <span className="text-lg font-extrabold tracking-[0.14em] text-foreground" style={{ fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace" }}>HEXKIT</span>
      </div>

      {/* Center: search bar trigger (absolute-center so left/right asymmetry doesn't shift it) */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-2">
        <UniversalSearchBar
          className="pointer-events-auto w-full max-w-[460px]"
          onOpenRpcSettings={onOpenRpcSettings}
          onOpenStorageManager={onOpenStorageManager}
        />
      </div>

      {/* Spacer so left/right still push to edges */}
      <div className="flex-1" />

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <EdbBridgeStatus />
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
        <Button
          type="button"
          variant="icon-borderless"
          size="icon-inline"
          className="rpc-settings-trigger"
          onClick={onOpenRpcSettings}
          title="RPC Settings"
          aria-label="RPC settings"
        >
          <SettingsIcon size={16} />
        </Button>
        <RainbowKitWallet />
      </div>
    </header>
  );
};

export default TopBar;
