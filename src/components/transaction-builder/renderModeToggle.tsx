import type { ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import {
  AnimatedLinkIcon,
  AnimatedClockIcon,
} from "../icons/IconLibrary";
import type { SimulationViewMode } from "./types";

export const renderModeToggle = (
  value: SimulationViewMode,
  onChange: (mode: SimulationViewMode) => void
): ReactNode => {
  return (
    <div className="mb-4">
      <Tabs value={value} onValueChange={(v) => onChange(v as SimulationViewMode)}>
        <TabsList>
          <TabsTrigger
            value="builder"
            className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <AnimatedLinkIcon width={14} height={14} />
            Manual / Project
          </TabsTrigger>
          <TabsTrigger
            value="replay"
            className="gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            <AnimatedClockIcon width={14} height={14} />
            Transaction Replay
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
};
