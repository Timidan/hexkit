import { useAccount, useSwitchChain } from "wagmi";
import { Button } from "@/components/ui/button";
import { Wallet, WarningCircle } from "@phosphor-icons/react";
import { MEZO_TESTNET_CHAIN_ID, MEZO_FAUCET_URL } from "./constants";
import { MEZO_LENS_COPY } from "./copy";

interface ChainGateProps {
  children: React.ReactNode;
}

export function ChainGate({ children }: ChainGateProps) {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="flex justify-center py-10">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-white/[0.06] bg-zinc-950/40 px-6 py-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03]">
            <Wallet weight="duotone" className="h-5 w-5 text-zinc-400" />
          </span>
          <p className="text-sm text-zinc-300">
            {MEZO_LENS_COPY.emptyStateConnectWallet}
          </p>
        </div>
      </div>
    );
  }

  if (chainId !== MEZO_TESTNET_CHAIN_ID) {
    return (
      <div className="flex justify-center py-10">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-6 py-8 text-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/20 bg-amber-500/[0.06]">
            <WarningCircle weight="duotone" className="h-5 w-5 text-amber-300" />
          </span>
          <p className="text-sm text-zinc-200">
            {MEZO_LENS_COPY.emptyStateWrongChain}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <Button
              size="sm"
              disabled={isSwitching}
              onClick={() => switchChain({ chainId: MEZO_TESTNET_CHAIN_ID })}
              className="bg-zinc-100 text-zinc-950 hover:bg-white disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {isSwitching ? "Switching…" : MEZO_LENS_COPY.switchToMezoCta}
            </Button>
            <a
              href={MEZO_FAUCET_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-200 hover:underline"
            >
              {MEZO_LENS_COPY.openFaucetCta} ↗
            </a>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
