/**
 * FunctionSelectSection - Function dropdown selector.
 * Extracted from GridLayout.tsx lines 1905-1952.
 */
import React from "react";
import { SearchIcon } from "../../icons/IconLibrary";
import { Label } from "../../ui/label";
import { Button } from "../../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../ui/select";
import { useGridContext } from "../GridContext";

export default function FunctionSelectSection(): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    allReadFunctions,
    allWriteFunctions,
    selectedFunction,
    handleFunctionSelect,
    setShowFunctionSearch,
    selectedFunctionType,
    filteredReadFunctions,
    filteredWriteFunctions,
  } = ctx;

  if (!(allReadFunctions.length > 0 || allWriteFunctions.length > 0)) {
    return null;
  }

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <Label className="text-xs text-muted-foreground">Select Function</Label>
        <Button
          type="button"
          variant="icon-borderless"
          size="icon-inline"
          onClick={() => setShowFunctionSearch(true)}
          aria-label="Search functions"
          className="p-1 rounded text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <SearchIcon width={14} height={14} />
        </Button>
      </div>
      <Select
        value={selectedFunction || ""}
        onValueChange={handleFunctionSelect}
      >
        <SelectTrigger className="w-full text-xs font-mono">
          <SelectValue placeholder="Choose function…" />
        </SelectTrigger>
        <SelectContent position="popper" className="max-h-[280px]">
          {selectedFunctionType === "read" &&
            filteredReadFunctions.length > 0 &&
            filteredReadFunctions.map((func: any, index: number) => (
              <SelectItem
                key={`read-${index}`}
                value={`read-${index}`}
                className="text-xs font-mono"
              >
                {func.name}({func.inputs?.map((input: { type: string }) => input.type).join(",")})
              </SelectItem>
            ))}
          {selectedFunctionType === "write" &&
            filteredWriteFunctions.length > 0 &&
            filteredWriteFunctions.map((func: any, index: number) => (
              <SelectItem
                key={`write-${index}`}
                value={`write-${index}`}
                className="text-xs font-mono"
              >
                {func.name}({func.inputs?.map((input: { type: string }) => input.type).join(",")})
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );
}
