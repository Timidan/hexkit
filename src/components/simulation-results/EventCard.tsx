import React from "react";
import { Button } from "../ui/button";
import { formatEventValue } from "./eventDecoder";

// EventCard component - event display with collapsible sections
export function EventCard({ event, shortAddress }: { event: any; shortAddress: (addr: string) => string }) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [showRawData, setShowRawData] = React.useState(false);

  const rawData = event.data?.data || event.rawData || '';
  const rawTopics = event.data?.topics || event.topics || [];

  const formatArgs = (args: any) => {
    const coerceStructuredValue = (raw: unknown): unknown => {
      if (typeof raw !== "string") return raw;
      const value = raw.trim();
      if (!value) return value;

      const looksJsonObject = value.startsWith("{") && value.endsWith("}");
      const looksJsonArray = value.startsWith("[") && value.endsWith("]");
      if (looksJsonObject || looksJsonArray) {
        try {
          return JSON.parse(value);
        } catch {
          return raw;
        }
      }

      return raw;
    };

    if (!args) return null;
    if (Array.isArray(args)) {
      return args.map((arg) => ({
        ...arg,
        value: coerceStructuredValue(arg?.value),
      }));
    }
    return Object.entries(args).map(([key, value]) => ({
      name: key,
      value: coerceStructuredValue(formatEventValue(value))
    }));
  };

  const formattedArgs = formatArgs(event.eventArgs);
  const hasContent = formattedArgs && formattedArgs.length > 0;

  return (
    <div style={{
      background: "rgba(255, 255, 255, 0.02)",
      border: "1px solid var(--sim-border, #1f2026)",
      borderRadius: "8px",
      overflow: "hidden"
    }}>
      {/* Event Header - Clickable to expand/collapse */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: "12px 16px",
          borderBottom: isExpanded && hasContent ? "1px solid var(--sim-border, #1f2026)" : "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          userSelect: "none"
        }}
      >
        {/* Expand/collapse chevron */}
        <span style={{
          color: "var(--sim-text-muted, #9a9aac)",
          fontSize: "0.75rem",
          transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
          transition: "transform 0.15s ease"
        }}>{"\u25B6"}</span>

        {/* Event Name */}
        <span style={{
          fontSize: "1rem",
          fontWeight: 600,
          color: "#a78bfa"
        }}>
          {event.eventName}
        </span>

        {/* Contract name badge */}
        <span style={{
          fontSize: "0.75rem",
          padding: "2px 8px",
          background: "rgba(255, 255, 255, 0.1)",
          border: "1px solid rgba(255, 255, 255, 0.2)",
          borderRadius: "4px",
          color: "#e5e5e5",
          fontWeight: 500
        }}>
          {event.contractName || "Contract"}
        </span>

        {/* Contract address */}
        <span style={{
          color: "var(--sim-text-muted, #9a9aac)",
          fontFamily: "monospace",
          fontSize: "0.75rem",
          marginLeft: "auto"
        }}>
          {shortAddress(event.address || '')}
        </span>
      </div>

      {/* Collapsible content area */}
      {isExpanded && (
        <>
          {/* Decoded Parameters - Simple table display */}
          {hasContent && (
            <div style={{
              padding: "12px 16px",
              background: "rgba(0, 0, 0, 0.1)",
              fontFamily: "monospace",
              fontSize: "0.8rem"
            }}>
              {formattedArgs.map((arg: any, idx: number) => (
                <div key={idx} style={{
                  display: "flex",
                  gap: "8px",
                  marginBottom: "6px",
                  alignItems: "baseline"
                }}>
                  <span style={{ color: "#9a9aac", minWidth: "120px", flexShrink: 0 }}>{arg.name}:</span>
                  {arg.value !== null && typeof arg.value === "object" ? (
                    <pre style={{
                      color: "#d1d5db",
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      overflowWrap: "anywhere",
                    }}>
                      {JSON.stringify(arg.value, null, 2)}
                    </pre>
                  ) : (
                    <span style={{ color: "#d1d5db", wordBreak: "break-all" }}>
                      {arg.value === null || arg.value === 'null' || arg.value === '' ? 'null' : String(arg.value)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Show raw data toggle */}
          <div style={{
            padding: "8px 16px",
            borderTop: hasContent ? "1px solid var(--sim-border, #1f2026)" : "none"
          }}>
            <Button
              type="button"
              variant="ghost"
              onClick={(e) => { e.stopPropagation(); setShowRawData(!showRawData); }}
              style={{
                background: "none",
                border: "none",
                color: "#ffffff",
                fontSize: "0.8rem",
                cursor: "pointer",
                padding: 0,
                display: "flex",
                alignItems: "center",
                gap: "4px"
              }}
            >
              <span style={{
                display: "inline-block",
                transform: showRawData ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s"
              }}>{"\u25B6"}</span>
              {showRawData ? "Hide" : "Show"} raw data and topics
            </Button>

            {/* Collapsible raw data section */}
            {showRawData && (
              <div style={{
                marginTop: "12px",
                padding: "12px",
                background: "rgba(0, 0, 0, 0.2)",
                borderRadius: "6px",
                fontSize: "0.75rem",
                fontFamily: "monospace"
              }}>
                {rawTopics.length > 0 && (
                  <div style={{ marginBottom: "12px" }}>
                    <div style={{ color: "#ffffff", marginBottom: "4px", fontWeight: 500 }}>Topics:</div>
                    {rawTopics.map((topic: string, idx: number) => (
                      <div key={idx} style={{
                        color: "var(--sim-text-muted, #9a9aac)",
                        wordBreak: "break-all",
                        marginBottom: "2px"
                      }}>
                        [{idx}] {topic}
                      </div>
                    ))}
                  </div>
                )}
                {rawData && (
                  <div>
                    <div style={{ color: "#ffffff", marginBottom: "4px", fontWeight: 500 }}>Data:</div>
                    <div style={{
                      color: "var(--sim-text-muted, #9a9aac)",
                      wordBreak: "break-all"
                    }}>
                      {rawData || "0x"}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
