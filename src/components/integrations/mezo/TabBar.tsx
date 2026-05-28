import type { Icon } from "@phosphor-icons/react";
import {
  Stack as StackIcon,
  Vault as VaultIcon,
  ArrowsLeftRight as SwapIcon,
  PiggyBank as SaveIcon,
  CirclesThreePlus as LiquidityIcon,
  Lock as LockIcon,
} from "@phosphor-icons/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MEZO_LENS_COPY } from "./copy";
import type { GlossaryKey } from "./glossary";

interface MezoTabSpec {
  id: "stack" | "borrow" | "swap" | "save" | "liquidity" | "lock";
  label: string;
  icon: Icon;
  glossaryKey: GlossaryKey;
}

export const MEZO_TABS: readonly MezoTabSpec[] = [
  {
    id: "stack",
    label: MEZO_LENS_COPY.tabs.stack.label,
    icon: StackIcon,
    glossaryKey: "stack",
  },
  {
    id: "borrow",
    label: MEZO_LENS_COPY.tabs.borrow.label,
    icon: VaultIcon,
    glossaryKey: "borrow",
  },
  {
    id: "swap",
    label: MEZO_LENS_COPY.tabs.swap.label,
    icon: SwapIcon,
    glossaryKey: "swap",
  },
  {
    id: "save",
    label: MEZO_LENS_COPY.tabs.save.label,
    icon: SaveIcon,
    glossaryKey: "save",
  },
  {
    id: "liquidity",
    label: MEZO_LENS_COPY.tabs.liquidity.label,
    icon: LiquidityIcon,
    glossaryKey: "liquidity",
  },
  {
    id: "lock",
    label: MEZO_LENS_COPY.tabs.lock.label,
    icon: LockIcon,
    glossaryKey: "lock",
  },
] as const;

export type MezoTabId = (typeof MEZO_TABS)[number]["id"];

interface TabBarProps {
  active: MezoTabId;
  onChange: (id: MezoTabId) => void;
}

/**
 * Legacy horizontal segmented-pill tab bar — kept for environments outside the
 * Workbench shell (the Workbench layout uses SideRailNav instead).
 */
export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <Tabs
      value={active}
      onValueChange={(v) => onChange(v as MezoTabId)}
      className="w-full"
    >
      <TabsList className="inline-flex w-full justify-start gap-1 rounded-xl border border-white/[0.06] bg-zinc-950/40 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        {MEZO_TABS.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="group relative h-8 flex-1 rounded-md border border-transparent bg-transparent px-3 text-[12px] font-medium tracking-wide text-zinc-500 transition-all data-[state=active]:border-white/10 data-[state=active]:bg-white/[0.06] data-[state=active]:text-zinc-50 data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_1px_2px_rgba(0,0,0,0.4)] hover:text-zinc-200"
            >
              <TabIcon
                weight="duotone"
                className="mr-2 h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-data-[state=active]:opacity-100"
              />
              {tab.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
