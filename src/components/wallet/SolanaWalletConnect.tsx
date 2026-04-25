import React from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { cn } from "@/lib/utils";

export const SolanaWalletConnect: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={cn("flex items-center", className)}>
      <WalletMultiButton
        style={{
          height: 34,
          padding: "0 12px",
          borderRadius: 6,
          backgroundColor: "rgba(255,255,255,0.06)",
          color: "#e5e7eb",
          fontSize: 12,
          fontFamily: "inherit",
        }}
      />
    </div>
  );
};

export default SolanaWalletConnect;
