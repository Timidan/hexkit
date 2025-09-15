import React, { useState } from "react";
import type { DiamondFacet } from "../utils/diamondFacetFetcher";
import { Copy } from "lucide-react";

interface FacetMiniModalProps {
  facets: DiamondFacet[];
  onFunctionSelect: (
    facetAddress: string,
    functionName: string,
    functionType: "read" | "write"
  ) => void;
}

export const FacetMiniModal: React.FC<FacetMiniModalProps> = ({
  facets,
  onFunctionSelect,
}) => {
  const [filter, setFilter] = useState<"read" | "write">("read");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (addr: string) => {
    const next = new Set(expanded);
    if (next.has(addr)) next.delete(addr);
    else next.add(addr);
    setExpanded(next);
  };

  const shorten = (address: string) =>
    `${address.slice(0, 6)}...${address.slice(-4)}`;

  return (
    <div
      style={{
        marginTop: "12px",
        background: "#121212",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 600 }}>
          Diamond Facets ({facets.length})
        </div>
        <div
          style={{
            display: "inline-flex",
            background: "#0f0f0f",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <button
            onClick={() => setFilter("read")}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              color: filter === "read" ? "#10b981" : "#9ca3af",
              background:
                filter === "read" ? "rgba(16,185,129,0.08)" : "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            Read
          </button>
          <button
            onClick={() => setFilter("write")}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              color: filter === "write" ? "#f59e0b" : "#9ca3af",
              background:
                filter === "write" ? "rgba(245,158,11,0.08)" : "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            Write
          </button>
        </div>
      </div>

      <div
        style={{ maxHeight: 360, overflowY: "auto", display: "grid", gap: 8 }}
      >
        {facets.map((facet) => {
          const isOpen = expanded.has(facet.address);
          const funcs: Array<{ name: string }> = (
            filter === "read" ? facet.functions.read : facet.functions.write
          ) as Array<{ name: string }>;
          return (
            <div
              key={facet.address}
              style={{
                background: "#0e0e0e",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => toggle(facet.address)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: 10,
                  background: "transparent",
                  border: "none",
                  color: "#e5e7eb",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {facet.name || "Facet"}
                  </span>
                  {!facet.isVerified && (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#111827",
                        background: "#f59e0b",
                        padding: "1px 6px",
                        borderRadius: 4,
                        fontWeight: 700,
                      }}
                    >
                      UNVERIFIED
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: "#9ca3af",
                      fontFamily: "Monaco, Menlo, monospace",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {shorten(facet.address)}
                    <button
                      title="Copy address"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(facet.address);
                      }}
                      style={{
                        border: "none",
                        background: "transparent",
                        padding: 0,
                        cursor: "pointer",
                        color: "#9ca3af",
                        display: "inline-flex",
                        alignItems: "center",
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  </span>
                </div>
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  {funcs.length} func{funcs.length !== 1 ? "s" : ""}
                </span>
              </button>

              {isOpen && funcs.length > 0 && (
                <div style={{ padding: "8px 10px", display: "grid", gap: 6 }}>
                  {funcs.map((f: { name: string }) => (
                    <button
                      key={f.name}
                      onClick={() =>
                        onFunctionSelect(facet.address, f.name, filter)
                      }
                      style={{
                        background:
                          filter === "read"
                            ? "rgba(16,185,129,0.06)"
                            : "rgba(245,158,11,0.06)",
                        color: filter === "read" ? "#10b981" : "#f59e0b",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 6,
                        textAlign: "left",
                        padding: "6px 8px",
                        fontFamily: "Monaco, Menlo, monospace",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {facets.length === 0 && (
          <div
            style={{
              textAlign: "center",
              color: "#9ca3af",
              fontSize: 12,
              padding: 16,
            }}
          >
            No facets found
          </div>
        )}
      </div>
    </div>
  );
};

export default FacetMiniModal;
