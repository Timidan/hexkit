import React from "react";
import { List } from "react-window";
import {
  DatabaseIcon,
  HashtagIcon,
  FileTextIcon,
  TrashIcon,
} from "../icons/IconLibrary";
import { AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "../ui/button";
import { CopyButton } from "../ui/copy-button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import type { CachedSignature } from "./types";

interface CacheTabProps {
  flattenedCachedFunctions: CachedSignature[];
  flattenedCachedEvents: CachedSignature[];
  flattenedCachedErrors: CachedSignature[];
  functionsOpen: boolean;
  setFunctionsOpen: (v: boolean) => void;
  eventsOpen: boolean;
  setEventsOpen: (v: boolean) => void;
  errorsOpen: boolean;
  setErrorsOpen: (v: boolean) => void;
  clearCache: (type?: "function" | "event" | "error" | "custom") => void;
}

const CacheTab: React.FC<CacheTabProps> = ({
  flattenedCachedFunctions,
  flattenedCachedEvents,
  flattenedCachedErrors,
  functionsOpen,
  setFunctionsOpen,
  eventsOpen,
  setEventsOpen,
  errorsOpen,
  setErrorsOpen,
  clearCache,
}) => {
  return (
    <div className="p-3 space-y-2">
      <div className="sigdb-section-header">
        <DatabaseIcon width={14} height={14} />
        Cached Signatures
      </div>

      {/* Cached Functions - Virtualized */}
      {flattenedCachedFunctions.length > 0 && (
        <Collapsible open={functionsOpen} onOpenChange={setFunctionsOpen}>
          <CollapsibleTrigger className="sigdb-collapsible-header flex items-center justify-between w-full py-2.5 px-3 border bg-muted/10 hover:bg-muted/20 transition-colors text-xs">
            <div className="flex items-center gap-2">
              <HashtagIcon width={14} height={14} />
              <span className="font-medium">
                Functions ({flattenedCachedFunctions.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-inline"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCache("function");
                }}
              >
                <TrashIcon width={12} height={12} />
              </Button>
              <ChevronDown
                width={14}
                height={14}
                className={`transition-transform ${functionsOpen ? "rotate-180" : ""}`}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1">
              <List
                style={{
                  height: Math.min(
                    140,
                    flattenedCachedFunctions.length * 36,
                  ),
                  width: "100%",
                }}
                rowCount={flattenedCachedFunctions.length}
                rowHeight={36}
                overscanCount={3}
                className="scrollbar-thin"
                rowProps={{}}
                rowComponent={({ index, style }) => {
                  const item = flattenedCachedFunctions[index];
                  if (!item) return <div style={style} />;
                  return (
                    <div style={style} className="sigdb-result-row text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <code className="font-mono truncate font-medium">
                          {item.name}
                        </code>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <CopyButton
                        value={item.name}
                        ariaLabel="Copy signature"
                        iconSize={12}
                      />
                    </div>
                  );
                }}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Cached Events - Virtualized */}
      {flattenedCachedEvents.length > 0 && (
        <Collapsible open={eventsOpen} onOpenChange={setEventsOpen}>
          <CollapsibleTrigger className="sigdb-collapsible-header flex items-center justify-between w-full py-2.5 px-3 border bg-muted/10 hover:bg-muted/20 transition-colors text-xs">
            <div className="flex items-center gap-2">
              <FileTextIcon width={14} height={14} />
              <span className="font-medium">
                Events ({flattenedCachedEvents.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-inline"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCache("event");
                }}
              >
                <TrashIcon width={12} height={12} />
              </Button>
              <ChevronDown
                width={14}
                height={14}
                className={`transition-transform ${eventsOpen ? "rotate-180" : ""}`}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1">
              <List
                style={{
                  height: Math.min(
                    140,
                    flattenedCachedEvents.length * 36,
                  ),
                  width: "100%",
                }}
                rowCount={flattenedCachedEvents.length}
                rowHeight={36}
                overscanCount={3}
                className="scrollbar-thin"
                rowProps={{}}
                rowComponent={({ index, style }) => {
                  const item = flattenedCachedEvents[index];
                  if (!item) return <div style={style} />;
                  return (
                    <div style={style} className="sigdb-result-row text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <code className="font-mono truncate font-medium">
                          {item.name}
                        </code>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <CopyButton
                        value={item.name}
                        ariaLabel="Copy signature"
                        iconSize={12}
                      />
                    </div>
                  );
                }}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Cached Errors - Virtualized */}
      {flattenedCachedErrors.length > 0 && (
        <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
          <CollapsibleTrigger className="sigdb-collapsible-header flex items-center justify-between w-full py-2.5 px-3 border bg-muted/10 hover:bg-muted/20 transition-colors text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle width={14} height={14} />
              <span className="font-medium">
                Errors ({flattenedCachedErrors.length})
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-inline"
                onClick={(e) => {
                  e.stopPropagation();
                  clearCache("error");
                }}
              >
                <TrashIcon width={12} height={12} />
              </Button>
              <ChevronDown
                width={14}
                height={14}
                className={`transition-transform ${errorsOpen ? "rotate-180" : ""}`}
              />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1">
              <List
                style={{
                  height: Math.min(
                    140,
                    flattenedCachedErrors.length * 36,
                  ),
                  width: "100%",
                }}
                rowCount={flattenedCachedErrors.length}
                rowHeight={36}
                overscanCount={3}
                className="scrollbar-thin"
                rowProps={{}}
                rowComponent={({ index, style }) => {
                  const item = flattenedCachedErrors[index];
                  if (!item) return <div style={style} />;
                  return (
                    <div style={style} className="sigdb-result-row text-xs">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <code className="font-mono truncate font-medium">
                          {item.name}
                        </code>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <CopyButton
                        value={item.name}
                        ariaLabel="Copy signature"
                        iconSize={12}
                      />
                    </div>
                  );
                }}
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {flattenedCachedFunctions.length === 0 &&
        flattenedCachedEvents.length === 0 &&
        flattenedCachedErrors.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-6">
            No cached signatures yet. Look up or search for signatures to
            populate the cache.
          </p>
        )}

      <Button
        variant="outline"
        size="sm"
        onClick={() => clearCache()}
        disabled={
          flattenedCachedFunctions.length === 0 &&
          flattenedCachedEvents.length === 0 &&
          flattenedCachedErrors.length === 0
        }
      >
        <TrashIcon width={12} height={12} />
        Clear All
      </Button>
    </div>
  );
};

export default CacheTab;
