import React from "react";
import { SearchIcon } from "../icons/IconLibrary";
import { CopyButton } from "../ui/copy-button";
import { Badge } from "../ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { ScrollArea } from "../ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { AlertCircle } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";
import {
  Field,
  FieldDescription,
} from "../ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "../ui/input-group";
import type { FlattenedSignature, SearchProgress } from "./types";

interface SearchTabProps {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  isSearchStale: boolean;
  isSearching: boolean;
  searchProgress: SearchProgress[];
  handleSearch: () => void;
  searchResults: any;
  flattenedFunctionResults: FlattenedSignature[];
  flattenedEventResults: FlattenedSignature[];
  error: string | null;
}

const SearchTab: React.FC<SearchTabProps> = ({
  searchQuery,
  setSearchQuery,
  isSearchStale,
  isSearching,
  searchProgress,
  handleSearch,
  searchResults,
  flattenedFunctionResults,
  flattenedEventResults,
  error,
}) => {
  return (
    <div className="p-3">
      <div className="sigdb-section-header">
        <SearchIcon width={14} height={14} />
        Search by Name
      </div>

      <Field>
        <InputGroup className="sigdb-input-group">
          <InputGroupAddon>
            <SearchIcon width={14} height={14} />
          </InputGroupAddon>
          <InputGroupInput
            id="search-query"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="transfer*, *ERC20*, balanceOf"
            className="text-sm"
          />
          {isSearchStale && (
            <InputGroupAddon align="inline-end">
              <span className="text-xs text-muted-foreground animate-pulse">
                searching...
              </span>
            </InputGroupAddon>
          )}
        </InputGroup>
        <FieldDescription className="sigdb-field-desc">
          {searchQuery.length > 0 && searchQuery.length < 2
            ? "Type at least 2 characters to search"
            : "Use wildcards (*) for pattern matching."}
        </FieldDescription>
        {searchProgress.length > 0 && (
          <div className="mt-2 space-y-0.5 text-xs font-mono text-muted-foreground border border-border/50 rounded-md p-2 bg-muted/30 max-h-28 overflow-y-auto">
            {searchProgress.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span
                  className={
                    p.stage === "error"
                      ? "text-destructive"
                      : p.stage === "fallback"
                        ? "text-yellow-500"
                        : "text-muted-foreground"
                  }
                >
                  {p.stage === "error"
                    ? "\u2717"
                    : p.stage === "done"
                      ? "\u2713"
                      : "\u2192"}
                </span>
                <span>{p.message}</span>
              </div>
            ))}
            {isSearching && (
              <div className="flex items-center gap-1.5 animate-pulse">
                <span>{"\u22EF"}</span>
                <span>waiting for response\u2026</span>
              </div>
            )}
          </div>
        )}
        {error && (
          <Alert variant="destructive" className="py-2 mt-2">
            <AlertCircle className="h-3 w-3" />
            <AlertTitle className="text-xs">Search backend error</AlertTitle>
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </Field>

      {searchResults && (
        <div className="mt-4 pt-4 border-t border-border/50 space-y-3">
          <div className="sigdb-section-header">
            Results
            <Badge
              variant={searchResults.ok ? "success" : "error"}
              size="sm"
            >
              {flattenedFunctionResults.length +
                flattenedEventResults.length}{" "}
              found
            </Badge>
          </div>

          {flattenedFunctionResults.length === 0 &&
          flattenedEventResults.length === 0 ? (
            <p className="text-muted-foreground text-sm py-2">
              No results for "{searchQuery}"
            </p>
          ) : (
            <Tabs
              defaultValue={
                flattenedFunctionResults.length > 0 ? "functions" : "events"
              }
            >
              <TabsList className="h-8 bg-muted/30 overflow-x-auto">
                {flattenedFunctionResults.length > 0 && (
                  <TabsTrigger
                    value="functions"
                    className="text-xs h-7 px-3 gap-1.5"
                  >
                    Functions
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      {flattenedFunctionResults.length}
                    </Badge>
                  </TabsTrigger>
                )}
                {flattenedEventResults.length > 0 && (
                  <TabsTrigger
                    value="events"
                    className="text-xs h-7 px-3 gap-1.5"
                  >
                    Events
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4"
                    >
                      {flattenedEventResults.length}
                    </Badge>
                  </TabsTrigger>
                )}
              </TabsList>

              {flattenedFunctionResults.length > 0 && (
                <TabsContent value="functions" className="mt-2 responsive-scroll">
                  <ScrollArea className="max-h-72">
                    <div className="space-y-px">
                      {flattenedFunctionResults.map((item, i) => (
                        <HoverCard
                          key={`${item.hash}-${i}`}
                          openDelay={200}
                          closeDelay={100}
                        >
                          <HoverCardTrigger asChild>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
                              <span
                                className="font-mono text-xs truncate min-w-0"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="bottom"
                            align="start"
                            className="w-auto max-w-sm font-mono text-xs p-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground text-[10px] uppercase">
                                Selector
                              </span>
                              <div className="flex items-center gap-1">
                                <code>{item.hash}</code>
                                <CopyButton
                                  value={item.hash}
                                  ariaLabel="Copy hash"
                                  iconSize={10}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground text-[10px] uppercase">
                                Signature
                              </span>
                              <CopyButton
                                value={item.name}
                                ariaLabel="Copy signature"
                                iconSize={10}
                              />
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}

              {flattenedEventResults.length > 0 && (
                <TabsContent value="events" className="mt-2 responsive-scroll">
                  <ScrollArea className="max-h-72">
                    <div className="space-y-px">
                      {flattenedEventResults.map((item, i) => (
                        <HoverCard
                          key={`${item.hash}-${i}`}
                          openDelay={200}
                          closeDelay={100}
                        >
                          <HoverCardTrigger asChild>
                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-muted/50 transition-colors cursor-default">
                              <span
                                className="font-mono text-xs truncate min-w-0"
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            </div>
                          </HoverCardTrigger>
                          <HoverCardContent
                            side="bottom"
                            align="start"
                            className="w-auto max-w-sm font-mono text-xs p-2 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground text-[10px] uppercase">
                                Topic Hash
                              </span>
                              <div className="flex items-center gap-1">
                                <code>
                                  {item.hash.slice(0, 10)}
                                  {"\u2026"}
                                  {item.hash.slice(-6)}
                                </code>
                                <CopyButton
                                  value={item.hash}
                                  ariaLabel="Copy hash"
                                  iconSize={10}
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-muted-foreground text-[10px] uppercase">
                                Signature
                              </span>
                              <CopyButton
                                value={item.name}
                                ariaLabel="Copy signature"
                                iconSize={10}
                              />
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchTab;
