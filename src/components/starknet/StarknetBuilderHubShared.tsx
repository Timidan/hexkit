import React from "react";
import { Label } from "../ui/label";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";

export type FunctionMode = "function" | "raw";

export const FunctionRawToggle: React.FC<{
  value: FunctionMode;
  onChange: (next: FunctionMode) => void;
}> = ({ value, onChange }) => (
  <RadioGroup
    value={value}
    onValueChange={(next) => onChange(next as FunctionMode)}
    className="grid grid-cols-2 gap-2"
  >
    <Label
      className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
        value === "function"
          ? "bg-purple-500/10 border-purple-500/50"
          : "bg-muted/30 border-border hover:bg-muted/50"
      }`}
    >
      <RadioGroupItem value="function" className="h-3 w-3" />
      <div>
        <div className="text-xs font-medium text-foreground">Function</div>
        <div className="text-[10px] text-muted-foreground">Pick from ABI</div>
      </div>
    </Label>
    <Label
      className={`flex items-center gap-2 p-2.5 rounded-md border cursor-pointer transition-colors ${
        value === "raw"
          ? "bg-purple-500/10 border-purple-500/50"
          : "bg-muted/30 border-border hover:bg-muted/50"
      }`}
    >
      <RadioGroupItem value="raw" className="h-3 w-3" />
      <div>
        <div className="text-xs font-medium text-foreground">Raw input data</div>
        <div className="text-[10px] text-muted-foreground">Selector + raw felts</div>
      </div>
    </Label>
  </RadioGroup>
);

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function shortenAddress(addr: string): string {
  if (!addr || addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function formatDecodedReturn(value: unknown): string {
  if (value === undefined || value === null) return String(value);
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 1
  ) {
    const sole = (value as Record<string, unknown>)[
      Object.keys(value as object)[0]
    ];
    return formatDecodedReturn(sole);
  }
  return JSON.stringify(value, jsonReplacer, 2);
}

function jsonReplacer(_key: string, val: unknown): unknown {
  if (typeof val === "bigint") return val.toString();
  return val;
}
