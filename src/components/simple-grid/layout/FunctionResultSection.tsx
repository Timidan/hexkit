/**
 * FunctionResultSection - Raw calldata mode: input, decoded display, execution, results.
 */
import React from "react";
import { AnimatedPlayIcon, Loader2Icon } from "../../icons/IconLibrary";
import { Button } from "../../ui/button";
import CopyableResult from "../../ui/CopyableResult";
import { parseError } from "../../../utils/errorParser";
import {
  normalizeResultString,
  safeBigNumberToString,
} from "../utils";
import { useGridContext } from "../GridContext";

export default function FunctionResultSection(): React.ReactElement {
  const ctx: any = useGridContext();
  const {
    generatedCallData,
    setGeneratedCallData,
    decodedCalldata,
    isSimulationMode,
    isSimulating,
    simulationFromAddress,
    functionResult,
    setFunctionResult,
    contractAddress,
    selectedNetwork,
    runSimulation,
    renderSimulationInsights,
    createEthersProvider,
    showSuccess,
    showError,
    showWarning,
    functionMode,
  } = ctx;

  return (
    <div style={{ marginBottom: "16px" }}>
      <div style={{ marginBottom: "12px" }}>
        <label
          style={{
            display: "block",
            fontSize: "13px",
            color: "#ccc",
            marginBottom: "6px",
          }}
        >
          Raw Calldata
        </label>
        <textarea
          style={{
            width: "100%",
            minHeight: "60px",
            background: "#111",
            border: "1px solid #333",
            borderRadius: "6px",
            padding: "8px 12px",
            color: "#fff",
            fontSize: "13px",
            fontFamily: "Monaco, Menlo, monospace",
            resize: "vertical",
          }}
          placeholder="0x..."
          value={generatedCallData}
          onChange={(e) => setGeneratedCallData(e.target.value)}
        />
        <div
          style={{
            fontSize: "11px",
            color: "#888",
            marginTop: "4px",
          }}
        >
          Enter raw transaction calldata (starts with 0x)
        </div>
      </div>

      {/* Decoded calldata display */}
      {generatedCallData && generatedCallData.length > 10 && (
        <div style={{ marginBottom: "12px" }}>
          <div
            style={{
              fontSize: "13px",
              color: "#ccc",
              marginBottom: "8px",
            }}
          >
            Decoded Function
          </div>
          <div
            style={{
              background: "#1a1a1a",
              border: "1px solid #333",
              borderRadius: "6px",
              padding: "10px 12px",
              fontSize: "12px",
            }}
          >
            <div style={{ color: "#888", marginBottom: "6px" }}>
              Selector:{" "}
              <span
                style={{
                  color: "#06b6d4",
                  fontFamily: "monospace",
                }}
              >
                {generatedCallData.slice(0, 10)}
              </span>
            </div>
            {decodedCalldata?.isLoading ? (
              <div style={{ color: "#f59e0b", display: "flex", alignItems: "center", gap: "6px" }}>
                <Loader2Icon style={{ width: 12, height: 12, animation: "spin 1s linear infinite" }} />
                Decoding...
              </div>
            ) : decodedCalldata?.functionName ? (
              <>
                <div style={{ marginBottom: "6px" }}>
                  <span style={{ color: "#888" }}>Function: </span>
                  <span style={{ color: "#22c55e", fontWeight: 500 }}>
                    {decodedCalldata.functionName}
                  </span>
                </div>
                <div style={{ marginBottom: decodedCalldata.args.length > 0 ? "8px" : "0" }}>
                  <span style={{ color: "#888" }}>Signature: </span>
                  <span style={{ color: "#a78bfa", fontFamily: "monospace", fontSize: "11px" }}>
                    {decodedCalldata.signature}
                  </span>
                </div>
                {decodedCalldata.args.length > 0 && (
                  <div style={{ borderTop: "1px solid #333", paddingTop: "8px" }}>
                    <div style={{ color: "#888", marginBottom: "4px" }}>Arguments:</div>
                    {decodedCalldata.args.map((arg: string, idx: number) => {
                      // Extract param names from signature
                      const paramsMatch = decodedCalldata.signature.match(/\(([^)]*)\)/);
                      const params = paramsMatch ? paramsMatch[1].split(",").map((p: string) => p.trim()) : [];
                      const paramType = params[idx] || `arg${idx}`;
                      const isAddress = paramType.includes("address") || (arg.startsWith("0x") && arg.length === 42);
                      const isBigNumber = /^\d{10,}$/.test(arg);

                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "8px",
                            marginBottom: "4px",
                            paddingLeft: "8px",
                          }}
                        >
                          <span style={{ color: "#6b7280", minWidth: "16px" }}>[{idx}]</span>
                          <span style={{ color: "#94a3b8", fontSize: "11px", minWidth: "80px" }}>
                            {paramType}:
                          </span>
                          <span
                            style={{
                              color: isAddress ? "#60a5fa" : isBigNumber ? "#fbbf24" : "#e5e7eb",
                              fontFamily: "monospace",
                              wordBreak: "break-all",
                              flex: 1,
                            }}
                          >
                            {arg}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>
                Unknown function (selector not found in database)
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unified raw execution button */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <Button
          variant="ghost"
          className="flex-1 text-[13px] font-semibold backdrop-blur-lg hover:bg-transparent dark:hover:bg-transparent shadow-none hover:shadow-none"
          disabled={!generatedCallData || generatedCallData.length < 10 || isSimulating}
          loading={isSimulating}
          icon={!isSimulating ? <AnimatedPlayIcon width={16} height={16} /> : undefined}
          onClick={async () => {
            if (!generatedCallData || generatedCallData.length < 10) {
              showWarning(
                "Invalid Calldata",
                "Please enter valid calldata starting with 0x"
              );
              return;
            }

            if (!contractAddress) {
              showWarning(
                "Contract Required",
                "Please enter a contract address"
              );
              return;
            }

            try {
              if (isSimulationMode) {
                // Use decoded function name if available
                const description = decodedCalldata?.functionName
                  ? `${decodedCalldata.functionName} (raw)`
                  : "Raw calldata";

                await runSimulation(
                  {
                    to: contractAddress as `0x${string}`,
                    data: generatedCallData as `0x${string}`,
                  },
                  {
                    description,
                    fromOverride: simulationFromAddress,
                  }
                );
                return;
              }

              // Non-simulation mode: execute call
              setFunctionResult({ data: null, isLoading: true });

              const provider = await createEthersProvider(selectedNetwork);
              const result = await provider.call({
                to: contractAddress,
                data: generatedCallData,
              });

              setFunctionResult({
                data: safeBigNumberToString(result),
                error: undefined,
                isLoading: false,
                formattedResult: {
                  displayValue: result,
                  htmlContent: `<div style="font-family: monospace; color: #22c55e;">Raw Result: ${result}</div>`,
                },
              });

              showSuccess("Call Successful", "Raw call executed successfully");
            } catch (error: any) {
              console.error("Raw call error:", error);
              const parsedError = parseError(error);
              showError("Call Failed", parsedError.message);
              setFunctionResult({
                data: undefined,
                error: parsedError.message,
                isLoading: false,
              });
            }
          }}
        >
          {isSimulationMode
            ? isSimulating
              ? "Simulating…"
              : "Simulate"
            : "Execute Call"}
        </Button>
      </div>

      {isSimulationMode && functionMode === "raw" && (
        <div style={{ marginTop: "16px" }}>
          {renderSimulationInsights({
            emptyMessage:
              "Paste calldata and run the simulation to inspect the raw execution locally.",
          })}
        </div>
      )}

      {/* Result display for raw mode - not in simulation mode */}
      {functionResult && !isSimulationMode && (
        <div style={{ marginTop: "16px" }}>
          <div
            style={{
              fontSize: "15px",
              fontWeight: "600",
              color: "#888",
              marginBottom: "8px",
            }}
          >
            Raw Call Result
          </div>
          {(() => {
            const rawString = functionResult.error
              ? String(functionResult.error)
              : normalizeResultString(
                  functionResult.data ?? "No result"
                );

            return (
              <CopyableResult
                title=" Raw Output"
                tone={functionResult.error ? "error" : "info"}
                plainText={rawString}
                copyText={rawString}
                monospace
              />
            );
          })()}
        </div>
      )}
    </div>
  );
}
