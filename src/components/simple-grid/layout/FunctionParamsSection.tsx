/**
 * FunctionParamsSection - Enhanced function parameters input.
 */
import React from "react";
import {
  CheckCircleIcon,
  AlertTriangleIcon,
} from "../../icons/IconLibrary";
import ContractInputComponent from "../../ContractInputComponent";
import { useGridContext } from "../GridContext";

export default function FunctionParamsSection(): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    selectedFunctionObj,
    functionInputs,
    contractInputsHook,
  } = ctx;

  if (
    !selectedFunctionObj ||
    !selectedFunctionObj.inputs ||
    selectedFunctionObj.inputs.length === 0
  ) {
    return null;
  }

  return (
    <div style={{ marginBottom: "12px" }}>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          color: "#ccc",
          marginBottom: "8px",
          fontWeight: "600",
        }}
      >
        Function Parameters
      </label>
      <div
        style={{
          background: "#1a1a1a",
          border: "1px solid #333",
          borderRadius: "6px",
          padding: "0",
          marginBottom: "8px",
          overflow: "hidden",
        }}
      >
        <style>{`
          .minimal-arg-input {
            background: transparent;
            border: none;
            border-radius: 0;
            padding: 16px;
          }

          .arg-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 8px;
            border-bottom: 1px solid #333;
          }

          .arg-count {
            color: #999;
            font-size: 14px;
            font-weight: 500;
          }

          .arg-actions {
            display: flex;
            gap: 8px;
          }

          .sample-btn, .clear-btn {
            background: linear-gradient(135deg, rgba(69, 183, 209, 0.15), rgba(69, 183, 209, 0.05));
            border: 1px solid rgba(69, 183, 209, 0.4);
            color: #45b7d1;
            padding: 8px 16px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            gap: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          }

          .sample-btn:hover {
            background: linear-gradient(135deg, rgba(69, 183, 209, 0.25), rgba(69, 183, 209, 0.1));
            border-color: #45b7d1;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(69, 183, 209, 0.2);
          }

          .clear-btn {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(239, 68, 68, 0.05));
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #ef4444;
          }

          .clear-btn:hover {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.25), rgba(239, 68, 68, 0.1));
            border-color: #ef4444;
            transform: translateY(-1px);
            box-shadow: 0 4px 8px rgba(239, 68, 68, 0.2);
          }

          .arg-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .arg-row {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .arg-label {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .arg-name {
            color: #fff;
            font-weight: 500;
            font-size: 15px;
          }

          .arg-type {
            font-size: 13px;
            padding: 2px 6px;
            border-radius: 3px;
            background: rgba(255,255,255,0.1);
            font-family: 'Monaco', monospace;
            font-weight: 400;
          }

          .arg-input, .bool-input {
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 8px 10px;
            color: #fff;
            font-size: 15px;
            transition: border-color 0.2s;
            width: 100%;
            max-width: 100%;
            min-width: 250px;
          }

          .arg-input:focus, .bool-input:focus {
            outline: none;
            border-color: #45b7d1;
            box-shadow: 0 0 0 1px rgba(69, 183, 209, 0.3);
          }

          .arg-input::placeholder {
            color: #666;
          }

          .bool-input {
            cursor: pointer;
          }

          /* Array styles - simplified comma-separated approach */
          .array-input-wrapper {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .array-input {
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 4px;
            padding: 8px 10px;
            color: #fff;
            font-size: 15px;
            transition: border-color 0.2s;
            width: 100%;
          }

          .array-input:focus {
            outline: none;
            border-color: #45b7d1;
            box-shadow: 0 0 0 1px rgba(69, 183, 209, 0.3);
          }

          .array-input::placeholder {
            color: #666;
          }

          .array-hint {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 2px;
          }

          /* Struct Array styles */
          .struct-array-row {
            background: rgba(255,255,255,0.02);
            border: 1px solid #333;
            border-radius: 6px;
            padding: 12px;
          }

          .struct-array-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .struct-array-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #3a3a3a;
          }

          .array-count {
            color: #999;
            font-size: 14px;
            font-weight: 500;
          }

          .add-struct-btn {
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.05)) !important;
            border: 1px solid rgba(34, 197, 94, 0.4) !important;
            color: #22c55e !important;
            padding: 8px 16px !important;
            border-radius: 8px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer;
            transition: all 0.3s ease !important;
            display: flex;
            align-items: center;
            gap: 8px;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1) !important;
          }

          .add-struct-btn:hover {
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(34, 197, 94, 0.1)) !important;
            border-color: #22c55e !important;
            transform: translateY(-1px) !important;
            box-shadow: 0 4px 8px rgba(34, 197, 94, 0.2) !important;
          }

          /* Validation error styling */
          .input-with-validation {
            position: relative;
          }

          .validation-error {
            border-color: #ef4444 !important;
            background: rgba(239, 68, 68, 0.1) !important;
          }

          .validation-error-message {
            color: #ef4444;
            font-size: 12px;
            margin-top: 4px;
            font-weight: 500;
          }

          .struct-item {
            background: #252525;
            border: 1px solid #3a3a3a;
            border-radius: 4px;
            padding: 10px;
          }

          .struct-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            padding: 6px;
            border-bottom: 1px solid #333;
            cursor: pointer;
            border-radius: 4px;
            transition: background 0.2s;
          }

          .struct-item-header:hover {
            background: #333;
          }

          .struct-header-left {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .expand-icon {
            font-size: 14px;
            transition: transform 0.2s;
          }

          .struct-item.collapsed .struct-item-header {
            margin-bottom: 0;
          }

          .populated-indicator {
            color: #22c55e;
            font-size: 12px;
            font-weight: 500;
            background: rgba(34, 197, 94, 0.1);
            padding: 2px 6px;
            border-radius: 12px;
            border: 1px solid rgba(34, 197, 94, 0.3);
          }

          .struct-index {
            color: #74b9ff;
            font-weight: 500;
            font-size: 14px;
          }

          .remove-struct-btn, .clear-struct-btn {
            background: #ff4757;
            border: none;
            color: white;
            width: 20px;
            height: 20px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .clear-struct-btn {
            background: #ffa502;
            width: 24px;
            height: 24px;
          }

          /* Array input hint styling */
          .array-hint {
            margin-top: 4px;
          }

          .struct-fields {
            display: grid;
            gap: 8px;
          }

          .struct-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .field-label {
            color: #ccc;
            font-size: 14px;
            font-weight: 500;
          }

          .struct-field-input {
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 3px;
            padding: 6px 8px;
            color: #fff;
            font-size: 14px;
            transition: border-color 0.2s;
            width: 100%;
            max-width: 100%;
            min-width: 200px;
          }

          .struct-field-input:focus {
            outline: none;
            border-color: #45b7d1;
            box-shadow: 0 0 0 1px rgba(69, 183, 209, 0.3);
          }

          .empty-array {
            text-align: center;
            padding: 20px;
            color: #666;
            font-style: italic;
            border: 1px dashed #3a3a3a;
            border-radius: 4px;
          }

          /* Nested struct styles */
          .nested-struct {
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 4px;
            padding: 8px;
            margin: 4px 0;
          }

          .nested-struct-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 1px solid #333;
          }

          .field-name {
            color: #fff;
            font-weight: 500;
            font-size: 14px;
          }

          .field-type {
            font-size: 13px;
            font-family: 'Monaco', monospace;
          }

          .nested-struct-fields {
            display: flex;
            flex-direction: column;
            gap: 6px;
          }

          .nested-field {
            display: flex;
            flex-direction: column;
            gap: 3px;
          }

          /* Tuple styles */
          .tuple-row {
            background: rgba(255,255,255,0.02);
            border: 1px solid #333;
            border-radius: 4px;
            padding: 12px;
          }

          .tuple-inputs {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .tuple-field {
            display: flex;
            flex-direction: column;
            gap: 3px;
          }

          .tuple-field-label {
            color: #aaa;
            font-size: 13px;
            font-weight: 500;
          }

          .tuple-field-input {
            background: #333;
            border: 1px solid #444;
            border-radius: 3px;
            padding: 6px 8px;
            color: #fff;
            font-size: 14px;
          }

          .no-args {
            text-align: center;
            padding: 20px;
            color: #666;
            font-size: 15px;
          }
        `}</style>
        {/* Unified Input System */}
        <div
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "12px",
          }}
        >
          {selectedFunctionObj.inputs.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                padding: "20px",
                color: "#666",
                fontSize: "14px",
              }}
            >
              This function requires no parameters
            </div>
          ) : (
            <div>
              {selectedFunctionObj.inputs.map(
                (input: any, index: number) => {
                  // Prefer hook state (source of truth after forceReapply).
                  // Use nullish coalescing (??) to preserve falsy values like 0, false, "".
                  const hookVal = contractInputsHook.inputStates[input.name]?.value;
                  const computedValue = hookVal !== undefined && hookVal !== null
                    ? hookVal
                    : (functionInputs[input.name] ??
                       functionInputs[`${selectedFunctionObj.name}_${index}`] ??
                       '');

                  return (
                  <ContractInputComponent
                    key={`${selectedFunctionObj.name}-${input.name}-${index}`}
                    inputDefinition={{
                      name: input.name,
                      type: input.type,
                      internalType: input.internalType,
                      components: input.components,
                    }}
                    value={computedValue}
                    onChange={(value, isValid) => {
                      contractInputsHook.handleInputChange(
                        input.name,
                        value,
                        isValid
                      );
                    }}
                  />
                );
                }
              )}

              {/* Validation Status */}
              {contractInputsHook.isAllValid ? (
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#10b981",
                    fontSize: "13px",
                  }}
                >
                  <CheckCircleIcon size={14} />
                </div>
              ) : (
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    color: "#ef4444",
                    fontSize: "13px",
                  }}
                >
                  <AlertTriangleIcon size={14} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
