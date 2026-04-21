/**
 * CalldataSection - Dynamic calldata display.
 */
import React from "react";
import { CopyButton } from "../../ui/copy-button";
import { useGridContext } from "../GridContext";

export default function CalldataSection(): React.ReactElement {
  const ctx: any = useGridContext();
  const {
    generatedCallData,
    inputStyle,
  } = ctx;

  return (
    <div style={{ marginBottom: "12px" }}>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          color: "#ccc",
          marginBottom: "6px",
        }}
      >
        Generated Calldata
      </label>
      <div style={{ position: "relative" }}>
        <textarea
          value={generatedCallData}
          readOnly
          style={{
            ...inputStyle,
            fontFamily: "monospace",
            fontSize: "12px",
            paddingRight: "80px",
            background: "#0a0a0a",
            border: "none",
            color: "#22c55e",
            marginBottom: "0",
            minHeight: "40px",
            maxHeight: "120px",
            height: "auto",
            resize: "vertical",
            overflow: "auto",
            wordBreak: "break-all",
          }}
          rows={Math.min(
            Math.max(
              Math.ceil(
                (generatedCallData || "").length / 80
              ),
              1
            ),
            4
          )}
        />
        <div
          style={{
            position: "absolute",
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            alignItems: "center",
          }}
        >
          <CopyButton
            value={generatedCallData}
            ariaLabel="Copy generated calldata"
            iconSize={16}
          />
        </div>
      </div>
    </div>
  );
}
