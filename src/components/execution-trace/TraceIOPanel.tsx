import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CopyButton } from "../ui/copy-button";
import { Button } from "../ui/button";
import { formatParamValue } from "./traceTypes";
import type { SignatureDecodedInput } from "./traceTypes";

interface TraceIOPanelProps {
  selectedInput?: string | null;
  selectedOutput?: string | null;
  decodedInput: any;
  decodedOutput: any;
  signatureDecodedInput: SignatureDecodedInput | null;
  signatureLookupLoading: boolean;
  inputViewMode: "decoded" | "raw";
  setInputViewMode: (mode: "decoded" | "raw") => void;
  outputViewMode: "decoded" | "raw";
  setOutputViewMode: (mode: "decoded" | "raw") => void;
  inputExpanded: boolean;
  setInputExpanded: (v: boolean) => void;
  outputExpanded: boolean;
  setOutputExpanded: (v: boolean) => void;
}

const TraceIOPanel: React.FC<TraceIOPanelProps> = ({
  selectedInput,
  selectedOutput,
  decodedInput,
  decodedOutput,
  signatureDecodedInput,
  signatureLookupLoading,
  inputViewMode,
  setInputViewMode,
  outputViewMode,
  setOutputViewMode,
  inputExpanded,
  setInputExpanded,
  outputExpanded,
  setOutputExpanded,
}) => {
  const inputValue = selectedInput || "";
  const inputSelector = inputValue.slice(0, 10).toLowerCase();

  let outputValue = "";
  if (
    selectedOutput &&
    selectedOutput !== "0x" &&
    selectedOutput.toLowerCase() !== inputSelector
  ) {
    outputValue = selectedOutput;
  }

  const hasData =
    (inputValue && inputValue !== "0x") ||
    (outputValue && outputValue !== "0x");

  if (!hasData) {
    return (
      <div className="exec-io-empty">
        <p>No input/output data available for this transaction</p>
      </div>
    );
  }

  return (
    <div className="exec-io-container">
      {/* Input Panel */}
      <div className="exec-io-panel">
        <div className="exec-io-header">
          <span>INPUT</span>
          <div className="exec-io-header-actions">
            <div className="exec-io-view-toggle">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`exec-io-view-btn ${inputViewMode === "decoded" ? "active" : ""}`}
                onClick={() => setInputViewMode("decoded")}
              >
                Decoded
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`exec-io-view-btn ${inputViewMode === "raw" ? "active" : ""}`}
                onClick={() => setInputViewMode("raw")}
              >
                Raw
              </Button>
            </div>
            <CopyButton
              value={
                inputViewMode === "raw"
                  ? inputValue || "0x"
                  : decodedInput
                    ? JSON.stringify(
                        Object.fromEntries(
                          decodedInput.fragment.inputs.map((input: any, idx: number) => [
                            input.name || `param${idx}`,
                            formatParamValue(
                              decodedInput.args[idx],
                              input.type,
                              input.components
                            ),
                          ])
                        ),
                        null,
                        2
                      )
                    : signatureDecodedInput
                      ? JSON.stringify(
                          {
                            function: signatureDecodedInput.signature,
                            ...Object.fromEntries(
                              signatureDecodedInput.params.map((p) => [p.name, p.value])
                            ),
                          },
                          null,
                          2
                        )
                      : inputValue || "{}"
              }
              className="exec-io-copy-btn"
              iconSize={14}
              ariaLabel="Copy input"
            />
          </div>
        </div>
        <div className="exec-io-content">
          {inputViewMode === "raw" ? (
            <div className="exec-io-raw">
              <code>{inputValue || "0x"}</code>
            </div>
          ) : (
            <>
              <div
                className="exec-io-tree-toggle"
                onClick={() => setInputExpanded(!inputExpanded)}
              >
                <span className={`exec-io-caret ${inputExpanded ? "expanded" : ""}`}>
                  {inputExpanded ? (
                    <ChevronDown size={12} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={12} strokeWidth={2} />
                  )}
                </span>
                <span className="exec-io-bracket">{"{"}</span>
              </div>
              {inputExpanded && (
                <div className="exec-io-tree-content">
                  {decodedInput ? (
                    <>
                      {decodedInput.fragment.inputs.map((input: any, idx: number) => (
                        <div key={idx} className="exec-io-tree-item">
                          <span className="exec-io-key">
                            "{input.name || `param${idx}`}"
                          </span>
                          <span className="exec-io-colon">:</span>
                          <span className="exec-io-value">
                            {formatParamValue(
                              decodedInput.args[idx],
                              input.type,
                              input.components
                            )}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : signatureDecodedInput ? (
                    <>
                      <div className="exec-io-tree-item exec-io-function-name">
                        <span className="exec-io-key">"function"</span>
                        <span className="exec-io-colon">:</span>
                        <span className="exec-io-value exec-io-function-sig">
                          "{signatureDecodedInput.signature}"
                        </span>
                      </div>
                      {signatureDecodedInput.params.map((param, idx) => (
                        <div key={idx} className="exec-io-tree-item">
                          <span className="exec-io-key">
                            "{param.name}" <span className="exec-io-type">({param.type})</span>
                          </span>
                          <span className="exec-io-colon">:</span>
                          <span className="exec-io-value">{param.value}</span>
                        </div>
                      ))}
                    </>
                  ) : signatureLookupLoading ? (
                    <div className="exec-io-tree-item exec-io-loading">
                      <span className="exec-io-value">Looking up function signature...</span>
                    </div>
                  ) : (
                    <div className="exec-io-tree-item">
                      <span className="exec-io-value">{inputValue || "0x"}</span>
                    </div>
                  )}
                </div>
              )}
              <span className="exec-io-bracket">{"}"}</span>
            </>
          )}
        </div>
      </div>

      {/* Output Panel */}
      <div className="exec-io-panel">
        <div className="exec-io-header">
          <span>OUTPUT</span>
          <div className="exec-io-header-actions">
            <div className="exec-io-view-toggle">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`exec-io-view-btn ${outputViewMode === "decoded" ? "active" : ""}`}
                onClick={() => setOutputViewMode("decoded")}
              >
                Decoded
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`exec-io-view-btn ${outputViewMode === "raw" ? "active" : ""}`}
                onClick={() => setOutputViewMode("raw")}
              >
                Raw
              </Button>
            </div>
            <CopyButton
              value={outputViewMode === "raw" ? outputValue || "0x" : outputValue || "{}"}
              className="exec-io-copy-btn"
              iconSize={14}
              ariaLabel="Copy output"
            />
          </div>
        </div>
        <div className="exec-io-content">
          {outputViewMode === "raw" ? (
            <div className="exec-io-raw">
              <code>{outputValue || "0x"}</code>
            </div>
          ) : (
            <>
              <div
                className="exec-io-tree-toggle"
                onClick={() => setOutputExpanded(!outputExpanded)}
              >
                <span className={`exec-io-caret ${outputExpanded ? "expanded" : ""}`}>
                  {outputExpanded ? (
                    <ChevronDown size={12} strokeWidth={2} />
                  ) : (
                    <ChevronRight size={12} strokeWidth={2} />
                  )}
                </span>
                <span className="exec-io-bracket">{"{"}</span>
              </div>
              {outputExpanded && (
                <div className="exec-io-tree-content">
                  {decodedOutput && decodedOutput.fragment?.outputs ? (
                    <>
                      {decodedOutput.fragment.outputs.map((output: any, idx: number) => (
                        <div key={idx} className="exec-io-tree-item">
                          <span className="exec-io-key">
                            "
                            {output.name ||
                              (decodedOutput.fragment.outputs?.length === 1
                                ? ""
                                : `output${idx}`)}
                            "
                          </span>
                          <span className="exec-io-colon">:</span>
                          <span className="exec-io-value">
                            {formatParamValue(
                              decodedOutput.values[idx],
                              output.type,
                              output.components
                            )}
                          </span>
                        </div>
                      ))}
                    </>
                  ) : decodedInput?.fragment?.outputs && decodedInput.fragment.outputs.length === 0 ? (
                    <div className="exec-io-tree-item">
                      <span className="exec-io-value exec-io-no-output">
                        (no return value)
                      </span>
                    </div>
                  ) : (
                    <div className="exec-io-tree-item">
                      <span className="exec-io-value">0x</span>
                    </div>
                  )}
                </div>
              )}
              <span className="exec-io-bracket">{"}"}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TraceIOPanel;
