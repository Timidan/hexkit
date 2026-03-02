/**
 * AbiUploadSection - ABI error display and manual ABI upload modal.
 * Extracted from ContractColumn.tsx to reduce file size.
 */
import React from "react";
import { XCircleIcon } from "../../icons/IconLibrary";
import { Button } from "../../ui/button";
import { useGridContext } from "../GridContext";

export default function AbiUploadSection(): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    contractAddress,
    selectedNetwork,
    abiError,
    setAbiError,
    showAbiUpload,
    setShowAbiUpload,
    manualAbi,
    setManualAbi,
    buttonStyle,
    handleManualABI,
  } = ctx;

  return (
    <>
      {abiError && (
        <div
          style={{
            padding: "12px",
            background: "#dc262620",
            border: "1px solid #dc2626",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "#dc2626",
              }}
            >
              <XCircleIcon width={16} height={16} />
              <span style={{ fontSize: "15px" }}>{abiError}</span>
            </div>
            {contractAddress && selectedNetwork && (
              <Button
                type="button"
                variant="ghost"
                style={{
                  padding: "4px 8px",
                  background: "transparent",
                  color: "#fff",
                  border: "1px solid rgba(255, 255, 255, 0.3)",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: "500",
                }}
                onClick={() => setShowAbiUpload(true)}
              >
                Upload ABI
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Manual ABI Upload Modal */}
      {showAbiUpload && (
        <div
          style={{
            padding: "16px",
            background: "#1a1a1a",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "12px",
            }}
          >
            <h4
              style={{
                fontSize: "15px",
                fontWeight: "600",
                color: "#ffffff",
                margin: 0,
              }}
            >
              Upload Contract ABI
            </h4>
            <Button
              type="button"
              variant="icon-borderless"
              size="icon-inline"
              style={{
                background: "none",
                border: "none",
                color: "#888",
                cursor: "pointer",
                fontSize: "17px",
                padding: "2px",
              }}
              onClick={() => {
                setShowAbiUpload(false);
                setManualAbi("");
                setAbiError(null);
              }}
              aria-label="Close upload ABI"
            >
              x
            </Button>
          </div>
          <div style={{ marginBottom: "12px" }}>
            <label
              style={{
                display: "block",
                fontSize: "13px",
                color: "#ccc",
                marginBottom: "6px",
              }}
            >
              Paste ABI JSON
            </label>
            <textarea
              value={manualAbi}
              onChange={(e) => setManualAbi(e.target.value)}
              placeholder='[{"inputs": [], "name": "totalSupply", "outputs": [...], ...}]'
              style={{
                width: "100%",
                minHeight: "120px",
                padding: "8px",
                background: "#2a2a2a",
                border: "1px solid #555",
                borderRadius: "6px",
                color: "#fff",
                fontSize: "12px",
                fontFamily: "monospace",
                resize: "vertical",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              type="button"
              variant="ghost"
              style={{
                ...buttonStyle,
                background: "#22c55e",
                fontSize: "13px",
                padding: "8px 16px",
              }}
              onClick={handleManualABI}
              disabled={!manualAbi.trim()}
            >
              Process ABI
            </Button>
            <Button
              type="button"
              variant="ghost"
              style={{
                ...buttonStyle,
                background: "#6b7280",
                fontSize: "13px",
                padding: "8px 16px",
              }}
              onClick={() => {
                setShowAbiUpload(false);
                setManualAbi("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
