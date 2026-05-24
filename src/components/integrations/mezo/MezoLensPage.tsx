import { useState } from "react";
import { ChainGate } from "./ChainGate";
import { type MezoTabId } from "./TabBar";
import { StackTab } from "./tabs/StackTab";
import { SwapTab } from "./tabs/SwapTab";
import { LiquidityTab } from "./tabs/LiquidityTab";
import { LockTab } from "./tabs/LockTab";
import { SaveTab } from "./tabs/SaveTab";
import { BorrowTab } from "./tabs/BorrowTab";
import { MEZO_LENS_COPY } from "./copy";
import { MezoTopBar } from "./components/MezoTopBar";
import { SideRailNav } from "./components/SideRailNav";

function TabBody({ tabId }: { tabId: MezoTabId }) {
  if (tabId === "stack") return <StackTab />;
  if (tabId === "borrow") return <BorrowTab />;
  if (tabId === "swap") return <SwapTab />;
  if (tabId === "save") return <SaveTab />;
  if (tabId === "liquidity") return <LiquidityTab />;
  if (tabId === "lock") return <LockTab />;
  return null;
}

export default function MezoLensPage() {
  const [activeTab, setActiveTab] = useState<MezoTabId>("stack");

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <img
            src="/logos/mezo.svg"
            alt=""
            aria-hidden
            className="h-7 w-7 opacity-90"
          />
          <div className="flex flex-col">
            <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
              {MEZO_LENS_COPY.pageTitle}
            </h2>
            <p className="max-w-xl text-sm text-zinc-400">
              {MEZO_LENS_COPY.pageSubtitle}
            </p>
          </div>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.02] via-zinc-950/30 to-zinc-950/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_24px_60px_-30px_rgba(0,0,0,0.8)]">
        <MezoTopBar />

        <ChainGate>
          <div className="grid grid-cols-12">
            <div className="col-span-12 md:col-span-3 lg:col-span-2">
              <SideRailNav active={activeTab} onChange={setActiveTab} />
            </div>
            <div className="col-span-12 md:col-span-9 lg:col-span-10">
              <TabBody tabId={activeTab} />
            </div>
          </div>
        </ChainGate>
      </div>
    </div>
  );
}
