import React from "react";
import {
  PlusIcon,
  XCircleIcon,
  FileTextIcon,
  TrashIcon,
} from "../icons/IconLibrary";
import { Upload, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import { Badge } from "../ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { ScrollArea } from "../ui/scroll-area";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldSet,
  FieldLegend,
  FieldGroup,
} from "../ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupTextarea,
} from "../ui/input-group";
import { generateSignatureHash } from "./helpers";
import type { CustomSignature } from "./types";

interface CustomTabProps {
  // ABI import
  abiInput: string;
  setAbiInput: (v: string) => void;
  contractPath: string;
  setContractPath: (v: string) => void;
  extractedSignatures: { functions: string[]; events: string[] };
  isExtracting: boolean;
  extractSignaturesFromABI: () => void;
  addExtractedSignatures: (
    signatures: string[],
    type: "function" | "event",
  ) => void;
  addAllExtractedSignatures: () => void;
  openFileModal: () => void;

  // File state
  selectedFiles: File[];
  setSelectedFiles: (v: File[]) => void;

  // Custom signature entry
  customSignature: string;
  setCustomSignature: (v: string) => void;
  handleAddCustomSignature: () => void;

  // Custom signatures list
  customSignatures: CustomSignature[];
  customOpen: boolean;
  setCustomOpen: (v: boolean) => void;
  clearCache: (type?: "function" | "event" | "error" | "custom") => void;
}

const CustomTab: React.FC<CustomTabProps> = ({
  abiInput,
  setAbiInput,
  contractPath,
  setContractPath,
  extractedSignatures,
  isExtracting,
  extractSignaturesFromABI,
  addExtractedSignatures,
  addAllExtractedSignatures,
  openFileModal,
  selectedFiles,
  setSelectedFiles,
  customSignature,
  setCustomSignature,
  handleAddCustomSignature,
  customSignatures,
  customOpen,
  setCustomOpen,
  clearCache,
}) => {
  return (
    <div className="p-3">
      <div className="sigdb-section-header">
        <PlusIcon width={14} height={14} />
        Custom Library
      </div>

      {/* ABI Import Section */}
      <FieldSet className="sigdb-section-divider">
        <FieldLegend variant="label" className="sigdb-section-header mb-0">
          <FileTextIcon width={14} height={14} />
          Import from ABI
        </FieldLegend>

        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel className="sigdb-field-label">
              Contract Files
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={openFileModal} size="sm">
                <Upload className="h-4 w-4" />
                Select Folder
              </Button>
              {contractPath && (
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span className="truncate max-w-40">{contractPath}</span>
                  <Button
                    variant="ghost"
                    size="icon-inline"
                    onClick={() => {
                      setContractPath("");
                      setSelectedFiles([]);
                    }}
                  >
                    <XCircleIcon width={14} height={14} />
                  </Button>
                </div>
              )}
            </div>
          </Field>

          <Field>
            <FieldLabel htmlFor="abi-json-input" className="sigdb-field-label">
              ABI JSON
            </FieldLabel>
            <InputGroup className="h-auto sigdb-input-group">
              <InputGroupTextarea
                id="abi-json-input"
                value={abiInput}
                onChange={(e) => setAbiInput(e.target.value)}
                placeholder='[{"inputs":[],"name":"transfer",...}]'
                rows={2}
                className="font-mono text-xs"
              />
              <InputGroupAddon
                align="block-end"
                className="border-t border-border/30"
              >
                <HoverCard>
                  <HoverCardTrigger asChild>
                    <InputGroupButton
                      onClick={extractSignaturesFromABI}
                      disabled={isExtracting || !abiInput.trim()}
                      size="xs"
                      aria-label="Extract signatures from ABI"
                    >
                      <FileTextIcon
                        width={14}
                        height={14}
                        className={isExtracting ? "animate-spin" : ""}
                      />
                      Extract
                    </InputGroupButton>
                  </HoverCardTrigger>
                  <HoverCardContent side="top">
                    Extract signatures from ABI
                  </HoverCardContent>
                </HoverCard>
              </InputGroupAddon>
            </InputGroup>
            <FieldDescription className="sigdb-field-desc">
              Paste a JSON ABI array to extract function and event signatures
            </FieldDescription>
          </Field>
        </FieldGroup>

        {/* Extracted Signatures Preview */}
        {(extractedSignatures.functions.length > 0 ||
          extractedSignatures.events.length > 0) && (
          <div className="mt-3 p-3 rounded-lg border border-border/30 bg-background/50 space-y-2">
            <div className="sigdb-section-header">
              Extracted (
              {extractedSignatures.functions.length +
                extractedSignatures.events.length}
              )
            </div>

            {extractedSignatures.functions.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Functions ({extractedSignatures.functions.length})
                </div>
                <div className="space-y-1">
                  {extractedSignatures.functions
                    .slice(0, 3)
                    .map((sig, index) => (
                      <div key={index} className="sigdb-result-row text-xs">
                        <code className="font-mono truncate">{sig}</code>
                        <Badge variant="secondary" size="sm">
                          {generateSignatureHash(sig)}
                        </Badge>
                      </div>
                    ))}
                  {extractedSignatures.functions.length > 3 && (
                    <p className="text-xs text-muted-foreground pl-2">
                      +{extractedSignatures.functions.length - 3} more...
                    </p>
                  )}
                </div>
              </div>
            )}

            {extractedSignatures.events.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Events ({extractedSignatures.events.length})
                </div>
                <div className="space-y-1">
                  {extractedSignatures.events
                    .slice(0, 3)
                    .map((sig, index) => (
                      <div key={index} className="sigdb-result-row text-xs">
                        <code className="font-mono truncate">{sig}</code>
                        <Badge variant="secondary" size="sm">
                          {generateSignatureHash(sig, "event").slice(0, 10)}
                          ...
                        </Badge>
                      </div>
                    ))}
                  {extractedSignatures.events.length > 3 && (
                    <p className="text-xs text-muted-foreground pl-2">
                      +{extractedSignatures.events.length - 3} more...
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={addAllExtractedSignatures} size="sm">
                Add All (
                {extractedSignatures.functions.length +
                  extractedSignatures.events.length}
                )
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  addExtractedSignatures(
                    extractedSignatures.functions,
                    "function",
                  )
                }
                disabled={extractedSignatures.functions.length === 0}
              >
                Functions ({extractedSignatures.functions.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  addExtractedSignatures(extractedSignatures.events, "event")
                }
                disabled={extractedSignatures.events.length === 0}
              >
                Events ({extractedSignatures.events.length})
              </Button>
            </div>
          </div>
        )}
      </FieldSet>

      {/* Manual Signature Entry */}
      <FieldSet className="sigdb-section-divider">
        <FieldLegend variant="label" className="sigdb-section-header mb-0">
          Add Custom Signature
        </FieldLegend>
        <FieldDescription className="sigdb-field-desc -mt-1 mb-3">
          Register a function or event signature to your local library
        </FieldDescription>

        <div className="flex items-center gap-2">
          <InputGroup className="flex-1 sigdb-input-group">
            <InputGroupAddon>
              <span className="font-mono text-xs text-muted-foreground">
                fn
              </span>
            </InputGroupAddon>
            <InputGroupInput
              value={customSignature}
              onChange={(e) => setCustomSignature(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddCustomSignature();
              }}
              placeholder="transfer(address,uint256)"
              className="font-mono text-sm"
            />
          </InputGroup>
          <Button
            onClick={handleAddCustomSignature}
            size="sm"
            disabled={!customSignature.trim()}
          >
            <PlusIcon width={14} height={14} />
            Add
          </Button>
        </div>
      </FieldSet>

      {/* Custom Signatures List */}
      {customSignatures.length > 0 && (
        <Collapsible open={customOpen} onOpenChange={setCustomOpen}>
          <CollapsibleTrigger className="sigdb-collapsible-header flex items-center justify-between w-full py-2.5 px-3 border bg-muted/20 hover:bg-muted/40 text-xs">
            <div className="flex items-center gap-2">
              <PlusIcon width={12} height={12} />
              <span className="font-medium">
                Custom ({customSignatures.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCache("custom");
                }}
              >
                <TrashIcon width={10} height={10} />
              </Button>
              <ChevronDown
                width={12}
                height={12}
                className={`transition-transform ${customOpen ? "rotate-180" : ""}`}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ScrollArea className="h-24 mt-1">
              <div className="space-y-0.5">
                {customSignatures.map((sig, index) => (
                  <div key={index} className="sigdb-result-row text-xs">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <code className="font-mono truncate">
                        {sig.signature}
                      </code>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {sig.project ||
                          new Date(sig.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                    <CopyButton
                      value={sig.signature}
                      ariaLabel="Copy signature"
                      iconSize={10}
                    />
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};

export default CustomTab;
