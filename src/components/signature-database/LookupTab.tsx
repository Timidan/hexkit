import React from "react";
import {
  HashtagIcon,
  SearchIcon,
} from "../icons/IconLibrary";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import { Badge } from "../ui/badge";
import { ButtonGroup } from "../ui/button-group";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from "../ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "../ui/input-group";
import type { SignatureResponse } from "./types";

interface LookupTabProps {
  lookupInput: string;
  setLookupInput: (v: string) => void;
  lookupType: "function" | "event" | "error";
  setLookupType: (v: "function" | "event" | "error") => void;
  lookupResults: SignatureResponse | null;
  isLookingUp: boolean;
  handleLookup: () => void;
}

const LookupTab: React.FC<LookupTabProps> = ({
  lookupInput,
  setLookupInput,
  lookupType,
  setLookupType,
  lookupResults,
  isLookingUp,
  handleLookup,
}) => {
  return (
    <div className="p-3">
      <div className="sigdb-section-header">
        <HashtagIcon width={14} height={14} />
        Lookup by Hash
      </div>

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel className="sigdb-field-label">Signature Type</FieldLabel>
          <ButtonGroup className="sigdb-type-toggle">
            <Button
              variant={lookupType === "function" ? "secondary" : "outline"}
              size="sm"
              data-active={lookupType === "function"}
              onClick={() => setLookupType("function")}
            >
              fn
            </Button>
            <Button
              variant={lookupType === "event" ? "secondary" : "outline"}
              size="sm"
              data-active={lookupType === "event"}
              onClick={() => setLookupType("event")}
            >
              event
            </Button>
            <Button
              variant={lookupType === "error" ? "secondary" : "outline"}
              size="sm"
              data-active={lookupType === "error"}
              onClick={() => setLookupType("error")}
            >
              error
            </Button>
          </ButtonGroup>
        </Field>

        <Field>
          <FieldLabel htmlFor="lookup-input" className="sigdb-field-label">
            <HashtagIcon width={14} height={14} />
            {lookupType === "event" ? "Topic(s)" : "Selector(s)"}
          </FieldLabel>
          <InputGroup className="sigdb-input-group">
            <InputGroupAddon>
              <span className="font-mono text-xs text-muted-foreground">
                0x
              </span>
            </InputGroupAddon>
            <InputGroupInput
              id="lookup-input"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLookup();
              }}
              placeholder={
                lookupType === "event"
                  ? "ddf252ad... (comma-separated)"
                  : lookupType === "error"
                    ? "08c379a0 (comma-separated)"
                    : "a9059cbb (comma-separated)"
              }
              className="font-mono text-sm"
            />
            <InputGroupAddon align="inline-end">
              <HoverCard>
                <HoverCardTrigger asChild>
                  <InputGroupButton
                    onClick={handleLookup}
                    disabled={isLookingUp}
                    size="icon-xs"
                    aria-label="Lookup signature"
                  >
                    <SearchIcon
                      width={14}
                      height={14}
                      className={isLookingUp ? "animate-spin" : ""}
                    />
                  </InputGroupButton>
                </HoverCardTrigger>
                <HoverCardContent side="top">
                  Lookup signature
                </HoverCardContent>
              </HoverCard>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription className="sigdb-field-desc">
            {lookupType === "event"
              ? "32-byte topic hashes, with or without 0x prefix"
              : `4-byte ${lookupType} selectors, comma-separated`}
          </FieldDescription>
        </Field>
      </FieldGroup>

      {lookupResults && lookupResults.result && (
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          <div className="sigdb-section-header">
            Results
            <Badge
              variant={lookupResults.ok ? "success" : "error"}
              size="sm"
            >
              {lookupResults.ok ? "OK" : "Failed"}
            </Badge>
          </div>
          {(() => {
            const resultsData =
              lookupType === "event"
                ? lookupResults.result.event
                : lookupResults.result.function;
            if (!resultsData || Object.keys(resultsData).length === 0) {
              return (
                <p className="text-muted-foreground text-sm py-2">
                  No results found
                </p>
              );
            }
            return Object.entries(resultsData).map(
              ([hash, signatures]) => (
                <div
                  key={hash}
                  className="rounded-lg border border-border/30 p-3"
                >
                  <div className="flex items-center justify-between mb-2">
                    <code className="font-mono text-xs font-medium text-muted-foreground">
                      {hash}
                    </code>
                    <CopyButton
                      value={hash}
                      ariaLabel="Copy hash"
                      iconSize={12}
                    />
                  </div>
                  {signatures && signatures.length > 0 ? (
                    <div className="space-y-1">
                      {signatures.map((sig, index) => (
                        <div
                          key={index}
                          className="sigdb-result-row text-xs"
                        >
                          <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                            <code className="font-mono truncate font-medium">
                              {sig.name}
                            </code>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {sig.filtered && (
                              <Badge variant="warning" size="sm">
                                Filtered
                              </Badge>
                            )}
                            <Badge variant="secondary" size="sm">
                              {lookupType}
                            </Badge>
                            <CopyButton
                              value={sig.name}
                              ariaLabel="Copy signature"
                              iconSize={12}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      No signatures found
                    </p>
                  )}
                </div>
              ),
            );
          })()}
        </div>
      )}
    </div>
  );
};

export default LookupTab;
