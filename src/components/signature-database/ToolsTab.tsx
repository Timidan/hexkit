import React, { Suspense } from "react";
import {
  ToolIcon,
  HashIcon,
  ZapIcon,
  AnimatedZapIcon,
  AnimatedHashIcon,
  AnimatedFileTextIcon,
} from "../icons/IconLibrary";
import { AlertCircle } from "lucide-react";
import { CopyButton } from "../ui/copy-button";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Alert, AlertDescription } from "../ui/alert";
import { AnimatedTabContent } from "../ui/animated-tabs";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "../ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import type { ToolSubTab } from "./types";

const SmartDecoder = React.lazy(() => import("../SmartDecoder"));
const CalldataEncoder = React.lazy(() => import("../CalldataEncoder"));
const HashToolkit = React.lazy(() => import("../HashToolkit"));

interface ToolsTabProps {
  activeToolSubTab: ToolSubTab;
  setActiveToolSubTab: (v: ToolSubTab) => void;
  calculatorSignature: string;
  setCalculatorSignature: (v: string) => void;
  calculatorResult: {
    selector: string;
    fullHash: string;
    error: string | null;
  };
}

const ToolsTab: React.FC<ToolsTabProps> = ({
  activeToolSubTab,
  setActiveToolSubTab,
  calculatorSignature,
  setCalculatorSignature,
  calculatorResult,
}) => {
  return (
    <div className="p-3">
      {/* Sub-tool selector -- pill tabs */}
      <Tabs
        value={activeToolSubTab}
        onValueChange={(v) => setActiveToolSubTab(v as ToolSubTab)}
        className="mb-3"
      >
        <div className="flex justify-center overflow-x-auto pb-1">
          <TabsList className="tool-pill-tabs h-auto w-auto bg-transparent p-0">
            <TabsTrigger value="selector" className="tool-pill-tab">
              <AnimatedZapIcon
                width={13}
                height={13}
                className="shrink-0"
              />
              Selector
            </TabsTrigger>
            <TabsTrigger value="decoder" className="tool-pill-tab">
              <AnimatedHashIcon
                width={13}
                height={13}
                className="shrink-0"
              />
              Decoder
            </TabsTrigger>
            <TabsTrigger value="encoder" className="tool-pill-tab">
              <AnimatedFileTextIcon
                width={13}
                height={13}
                className="shrink-0"
              />
              Encoder
            </TabsTrigger>
            <TabsTrigger value="hash" className="tool-pill-tab">
              <HashIcon width={13} height={13} className="shrink-0" />
              Hash
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <AnimatedTabContent activeKey={activeToolSubTab}>
        {activeToolSubTab === "selector" && (
          <div className="border border-border/50 rounded-lg p-4">
            <div className="mb-1">
              <div className="sigdb-section-header">
                <ToolIcon width={14} height={14} />
                Selector Calculator
              </div>
            </div>
            <p className="sigdb-field-desc mb-3 pl-5">
              Generate a 4-byte selector from a function signature
            </p>

            <Field>
              <FieldLabel htmlFor="calc-sig" className="sigdb-field-label">
                <HashIcon width={14} height={14} />
                Function Signature
              </FieldLabel>
              <InputGroup className="sigdb-input-group">
                <InputGroupInput
                  id="calc-sig"
                  value={calculatorSignature}
                  onChange={(e) => setCalculatorSignature(e.target.value)}
                  placeholder="transfer(address,uint256)"
                  className="font-mono text-sm"
                />
                {calculatorResult.selector && (
                  <InputGroupAddon align="inline-end">
                    <CopyButton
                      value={calculatorSignature}
                      ariaLabel="Copy signature"
                      iconSize={12}
                    />
                  </InputGroupAddon>
                )}
              </InputGroup>
              <FieldDescription className="sigdb-field-desc">
                Enter a Solidity function or event signature to compute its
                selector
              </FieldDescription>
            </Field>

            {calculatorResult.error && (
              <Alert variant="destructive" className="py-2 mt-3">
                <AlertCircle className="h-3 w-3" />
                <AlertDescription className="text-xs">
                  {calculatorResult.error}
                </AlertDescription>
              </Alert>
            )}

            {calculatorResult.selector && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <div className="sigdb-section-header">Results</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="sigdb-result-cell">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        Function Selector
                      </span>
                      <CopyButton
                        value={calculatorResult.selector}
                        ariaLabel="Copy selector"
                        iconSize={12}
                      />
                    </div>
                    <code className="block font-mono text-sm font-semibold text-emerald-400">
                      {calculatorResult.selector}
                    </code>
                  </div>
                  {calculatorResult.fullHash && (
                    <div className="sigdb-result-cell">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          Full Hash
                        </span>
                        <CopyButton
                          value={calculatorResult.fullHash}
                          ariaLabel="Copy full hash"
                          iconSize={12}
                        />
                      </div>
                      <code className="block font-mono text-xs text-muted-foreground break-all">
                        {calculatorResult.fullHash}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {activeToolSubTab === "decoder" && (
          <Suspense
            fallback={
              <div className="text-xs text-muted-foreground text-center py-8">
                Loading decoder...
              </div>
            }
          >
            <SmartDecoder />
          </Suspense>
        )}

        {activeToolSubTab === "encoder" && (
          <Suspense
            fallback={
              <div className="text-xs text-muted-foreground text-center py-8">
                Loading encoder...
              </div>
            }
          >
            <CalldataEncoder />
          </Suspense>
        )}

        {activeToolSubTab === "hash" && (
          <Suspense
            fallback={
              <div className="text-xs text-muted-foreground text-center py-8">
                Loading hash toolkit...
              </div>
            }
          >
            <HashToolkit />
          </Suspense>
        )}
      </AnimatedTabContent>
    </div>
  );
};

export default ToolsTab;
