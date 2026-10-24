/**
 * Contract-interaction controls shared by every chain's function workspace:
 * the function / raw-input mode switch and the Read / Write function tabs.
 */
import { AnimatedBookFlipIcon, AnimatedPenWriteIcon } from "./icons/IconLibrary";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

export type FunctionMode = "function" | "raw";
export type FunctionKind = "read" | "write";

export function FunctionModeToggle({ value, onChange, functionHint, rawLabel, rawHint }: {
  value: FunctionMode;
  onChange: (mode: FunctionMode) => void;
  functionHint: string;
  rawLabel: string;
  rawHint: string;
}) {
  const option = (mode: FunctionMode, title: string, hint: string) => (
    <Label
      className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
        value === mode
          ? "bg-purple-500/10 border-purple-500/50"
          : "bg-muted/30 border-border hover:bg-muted/50"
      }`}
    >
      <RadioGroupItem value={mode} className="h-3 w-3" />
      <div>
        <div className="text-xs font-medium text-foreground">{title}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </Label>
  );
  return (
    <RadioGroup
      value={value}
      onValueChange={(mode) => onChange(mode as FunctionMode)}
      aria-label="Input mode"
      className="grid grid-cols-2 gap-2 mb-3"
    >
      {option("function", "Choose function", functionHint)}
      {option("raw", rawLabel, rawHint)}
    </RadioGroup>
  );
}

/** Pass `children` (the function picker) to render it as the tabs' panel. */
export function FunctionTypeTabs({ value, onChange, readCount, writeCount, children }: {
  value: FunctionKind | null;
  onChange: (kind: FunctionKind) => void;
  readCount: number;
  writeCount: number;
  children?: ReactNode;
}) {
  return (
    <Tabs
      value={value ?? undefined}
      onValueChange={(kind) => onChange(kind as FunctionKind)}
      className="w-full"
    >
      <TabsList aria-label="Function type" className="w-full grid grid-cols-2 h-9 bg-muted/30 p-0.5">
        {readCount > 0 && (
          <TabsTrigger
            value="read"
            className="gap-1.5 text-xs data-[state=active]:bg-green-500/20 data-[state=active]:text-green-500 data-[state=active]:border data-[state=active]:border-green-500/50"
          >
            <AnimatedBookFlipIcon width={14} height={14} />
            Read ({readCount})
          </TabsTrigger>
        )}
        {writeCount > 0 && (
          <TabsTrigger
            value="write"
            className="gap-1.5 text-xs data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-500 data-[state=active]:border data-[state=active]:border-amber-500/50"
          >
            <AnimatedPenWriteIcon width={14} height={14} />
            Write ({writeCount})
          </TabsTrigger>
        )}
      </TabsList>
      {children !== undefined && (["read", "write"] as const).map((kind) => (
        <TabsContent key={kind} value={kind} className="mt-3 space-y-5 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
          {children}
        </TabsContent>
      ))}
    </Tabs>
  );
}
