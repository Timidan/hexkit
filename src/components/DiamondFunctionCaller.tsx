import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  Play,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  Clock,
  Zap,
  Eye,
  Wallet,
} from "lucide-react";
import InlineCopyButton from "./ui/InlineCopyButton";
import type { Chain } from "../types";
import {
  parseTransactionError,
  formatErrorForUser,
} from "../utils/errorParser";

interface FunctionCall {
  name: string;
  type: "function";
  inputs: Array<{
    name: string;
    type: string;
    internalType?: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    internalType?: string;
  }>;
  stateMutability: "view" | "pure" | "nonpayable" | "payable";
  selector?: string;
  facetAddress?: string;
  facetName?: string;
  source?: string;
  confidence?: string;
  isWhatsABI?: boolean;
}

interface FunctionCallResult {
  success: boolean;
  result?: unknown;
  error?: string;
  gasUsed?: string;
  transactionHash?: string;
  blockNumber?: number;
  timestamp?: number;
}

interface Props {
  contractAddress: string;
  chain: Chain;
  functions: FunctionCall[];
  provider?: ethers.providers.Provider;
  connectedWallet?: {
    isConnected: boolean;
    address?: string;
    provider?: unknown;
    signer?: ethers.Signer;
  };
}

// Light inline function selector grouped by facet
function FunctionSelector({
  functions,
  getKey,
  selectedKey,
  onSelect,
}: {
  functions: FunctionCall[];
  getKey: (f: FunctionCall) => string;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const groups = new Map<string, FunctionCall[]>();
  functions.forEach((f) => {
    const group = f.facetName || "Functions";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(f);
  });

  return (
    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
      <label style={{ fontSize: "12px", color: "#6b7280" }}>Function:</label>
      <select
        value={selectedKey || ""}
        onChange={(e) => onSelect(e.target.value)}
        style={{
          flex: 1,
          padding: "8px",
          border: "1px solid rgba(59, 130, 246, 0.3)",
          borderRadius: "4px",
          fontSize: "13px",
          fontFamily: "Monaco, Menlo, monospace",
        }}
      >
        {[...groups.entries()].map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map((f) => {
              const key = getKey(f);
              return (
                <option key={key} value={key}>{`${f.name}(${f.inputs
                  .map((i) => i.type)
                  .join(",")})`}</option>
              );
            })}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

const DiamondFunctionCaller: React.FC<Props> = ({
  contractAddress,
  functions,
  provider,
  connectedWallet,
}) => {
  const [expandedFunctions, setExpandedFunctions] = useState<Set<string>>(
    new Set()
  );
  const [functionInputs, setFunctionInputs] = useState<
    Record<string, Record<string, string>>
  >({});
  const [callResults, setCallResults] = useState<
    Record<string, FunctionCallResult>
  >({});
  const [loadingCalls, setLoadingCalls] = useState<Set<string>>(new Set());

  const [selectedFunctionKey, setSelectedFunctionKey] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!selectedFunctionKey && functions.length > 0) {
      const firstKey = getFunctionKey(functions[0]);
      setSelectedFunctionKey(firstKey);
      setExpandedFunctions(new Set([firstKey]));
    }
  }, [functions, selectedFunctionKey]);

  // Categorization helpers (optional)
  // Note: with the dropdown UI, we don't render full lists anymore.

  const selectedFunction = functions.find(
    (f) => getFunctionKey(f) === selectedFunctionKey
  );
  const selectedIsReadOnly = selectedFunction
    ? selectedFunction.stateMutability === "view" ||
      selectedFunction.stateMutability === "pure"
    : true;

  const toggleFunctionExpansion = (functionKey: string) => {
    const newExpanded = new Set(expandedFunctions);
    if (newExpanded.has(functionKey)) {
      newExpanded.delete(functionKey);
    } else {
      newExpanded.add(functionKey);
    }
    setExpandedFunctions(newExpanded);
  };

  const updateFunctionInput = (
    functionKey: string,
    paramName: string,
    value: string
  ) => {
    setFunctionInputs((prev) => ({
      ...prev,
      [functionKey]: {
        ...prev[functionKey],
        [paramName]: value,
      },
    }));
  };

  const getFunctionKey = (func: FunctionCall): string => {
    return `${func.name}_${func.inputs.map((i) => i.type).join("_")}`;
  };

  const parseInputValue = (value: string, type: string): unknown => {
    if (!value.trim()) {
      if (type.includes("[]")) return [];
      if (type === "bool") return false;
      if (type.startsWith("uint") || type.startsWith("int")) return "0";
      return "";
    }

    try {
      // Handle arrays
      if (type.includes("[]")) {
        if (value.startsWith("[") && value.endsWith("]")) {
          return JSON.parse(value);
        }
        return value.split(",").map((v) => v.trim());
      }

      // Handle booleans
      if (type === "bool") {
        return value.toLowerCase() === "true" || value === "1";
      }

      // Handle numbers
      if (type.startsWith("uint") || type.startsWith("int")) {
        return ethers.BigNumber.from(value);
      }

      // Handle addresses
      if (type === "address") {
        if (!ethers.utils.isAddress(value)) {
          throw new Error("Invalid address format");
        }
        return value;
      }

      // Handle bytes
      if (type.startsWith("bytes")) {
        if (!value.startsWith("0x")) {
          return "0x" + value;
        }
        return value;
      }

      return value;
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error instanceof Error
            ? error.message
            : String(error)
          : String(error);
      throw new Error(`Invalid value for type ${type}: ${msg}`);
    }
  };

  const formatOutputValue = (value: unknown): string => {
    if (value === null || value === undefined) return "null";

    try {
      // BigNumber detection without using any
      const isBigNumber = (
        ethers.BigNumber as unknown as {
          isBigNumber: (x: unknown) => x is ethers.BigNumber;
        }
      ).isBigNumber(value);
      if (isBigNumber) {
        return (value as ethers.BigNumber).toString();
      }

      // Handle arrays
      if (Array.isArray(value)) {
        return JSON.stringify(value, null, 2);
      }

      // Handle objects (structs)
      if (typeof value === "object" && value !== null) {
        return JSON.stringify(value, null, 2);
      }

      // Handle boolean
      if (typeof value === "boolean") {
        return value.toString();
      }

      return String(value);
    } catch (error: unknown) {
      return `[Error formatting: ${error instanceof Error ? error.message : String(error)}]`;
    }
  };

  const callReadOnlyFunction = async (func: FunctionCall) => {
    const functionKey = getFunctionKey(func);

    if (!provider) {
      setCallResults((prev) => ({
        ...prev,
        [functionKey]: {
          success: false,
          error: "No provider available",
        },
      }));
      return;
    }

    setLoadingCalls((prev) => new Set(prev).add(functionKey));

    try {
      // Parse input parameters
      const inputs = functionInputs[functionKey] || {};
      const parsedArgs: unknown[] = [];

      for (const input of func.inputs) {
        const value = inputs[input.name] || "";
        try {
          const parsedValue = parseInputValue(value, input.type);
          parsedArgs.push(parsedValue);
        } catch (parseError: unknown) {
          throw new Error(
            `Parameter "${input.name}": ${parseError instanceof Error ? parseError.message : String(parseError)}`
          );
        }
      }

      // Create contract instance
      const contract = new ethers.Contract(contractAddress, [func], provider);

      console.log(`📞 Calling ${func.name} with args:`, parsedArgs);

      // Call the function using a typed index accessor
      const startTime = Date.now();
      const contractFns = contract as unknown as Record<
        string,
        (...args: unknown[]) => Promise<unknown>
      >;
      const result = await contractFns[func.name](...parsedArgs);
      const endTime = Date.now();

      console.log(`✅ ${func.name} result:`, result);

      setCallResults((prev) => ({
        ...prev,
        [functionKey]: {
          success: true,
          result: result,
          timestamp: endTime - startTime,
        },
      }));
    } catch (error: unknown) {
      console.error(`❌ Error calling ${func.name}:`, error);

      setCallResults((prev) => ({
        ...prev,
        [functionKey]: {
          success: false,
          error:
            (error instanceof Error ? error.message : String(error)) ||
            "Unknown error occurred",
        },
      }));
    } finally {
      setLoadingCalls((prev) => {
        const newSet = new Set(prev);
        newSet.delete(functionKey);
        return newSet;
      });
    }
  };

  const executeWriteFunction = async (func: FunctionCall) => {
    const functionKey = getFunctionKey(func);

    if (!connectedWallet?.isConnected || !connectedWallet?.signer) {
      setCallResults((prev) => ({
        ...prev,
        [functionKey]: {
          success: false,
          error:
            "Wallet not connected. Please connect your wallet to execute write functions.",
        },
      }));
      return;
    }

    setLoadingCalls((prev) => new Set(prev).add(functionKey));

    try {
      // Parse input parameters
      const inputs = functionInputs[functionKey] || {};
      const parsedArgs: unknown[] = [];

      for (const input of func.inputs) {
        const value = inputs[input.name] || "";
        try {
          const parsedValue = parseInputValue(value, input.type);
          parsedArgs.push(parsedValue);
        } catch (parseError: unknown) {
          throw new Error(
            `Parameter "${input.name}": ${parseError instanceof Error ? parseError.message : String(parseError)}`
          );
        }
      }

      // Create contract instance with signer for write operations
      const contract = new ethers.Contract(
        contractAddress,
        [func],
        connectedWallet.signer
      );

      console.log(`🚀 Executing ${func.name} with args:`, parsedArgs);

      // Estimate gas first
      let gasEstimate: ethers.BigNumber | undefined;
      try {
        const estimateFns = contract.estimateGas as unknown as Record<
          string,
          (...args: unknown[]) => Promise<ethers.BigNumber>
        >;
        gasEstimate = await estimateFns[func.name](...parsedArgs);
        console.log(
          `⛽ Gas estimate for ${func.name}:`,
          gasEstimate.toString()
        );
      } catch (gasError) {
        console.warn(`⚠️ Gas estimation failed for ${func.name}:`, gasError);
      }

      // Execute the transaction
      const startTime = Date.now();
      const writeFns = contract as unknown as Record<
        string,
        (...args: unknown[]) => Promise<{
          hash: string;
          wait: () => Promise<{
            transactionHash: string;
            gasUsed?: ethers.BigNumber;
            blockNumber: number;
            events?: unknown[];
          }>;
        }>
      >;
      const tx = await writeFns[func.name](...parsedArgs, {
        gasLimit: gasEstimate ? gasEstimate.mul(120).div(100) : undefined, // Add 20% buffer
      });

      console.log(`📄 Transaction sent: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      const endTime = Date.now();

      console.log(`✅ Transaction confirmed: ${receipt.transactionHash}`);

      setCallResults((prev) => ({
        ...prev,
        [functionKey]: {
          success: true,
          result: (receipt.events || []) as unknown[],
          gasUsed: receipt.gasUsed?.toString(),
          transactionHash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          timestamp: endTime - startTime,
        },
      }));
    } catch (error: unknown) {
      console.error(`❌ Error executing ${func.name}:`, error);

      setCallResults((prev) => ({
        ...prev,
        [functionKey]: {
          success: false,
          error: formatErrorForUser(parseTransactionError(error)),
        },
      }));
    } finally {
      setLoadingCalls((prev) => {
        const newSet = new Set(prev);
        newSet.delete(functionKey);
        return newSet;
      });
    }
  };

  const renderParameterInput = (
    param: { name: string; type: string },
    functionKey: string
  ) => {
    const value = functionInputs[functionKey]?.[param.name] || "";

    return (
      <div key={param.name} style={{ marginBottom: "12px" }}>
        <label
          style={{
            display: "block",
            fontSize: "12px",
            fontWeight: "500",
            color: "#6b7280",
            marginBottom: "4px",
          }}
        >
          {param.name}
          <span
            style={{
              color: "#9ca3af",
              fontFamily: "Monaco, Menlo, monospace",
              marginLeft: "8px",
            }}
          >
            ({param.type})
          </span>
        </label>

        {param.type === "bool" ? (
          <select
            value={value}
            onChange={(e) =>
              updateFunctionInput(functionKey, param.name, e.target.value)
            }
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "4px",
              fontSize: "13px",
              fontFamily: "Monaco, Menlo, monospace",
            }}
          >
            <option value="">Select...</option>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        ) : param.type.includes("[]") ? (
          <textarea
            value={value}
            onChange={(e) =>
              updateFunctionInput(functionKey, param.name, e.target.value)
            }
            placeholder={`Array of ${param.type.replace("[]", "")} (JSON format or comma-separated)`}
            rows={3}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "4px",
              fontSize: "13px",
              fontFamily: "Monaco, Menlo, monospace",
              resize: "vertical",
            }}
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) =>
              updateFunctionInput(functionKey, param.name, e.target.value)
            }
            placeholder={`Enter ${param.type} value`}
            style={{
              width: "100%",
              padding: "8px",
              border: "1px solid rgba(59, 130, 246, 0.3)",
              borderRadius: "4px",
              fontSize: "13px",
              fontFamily: "Monaco, Menlo, monospace",
            }}
          />
        )}
      </div>
    );
  };

  const renderFunctionResult = (result: FunctionCallResult) => {
    if (!result) return null;

    return (
      <div
        style={{
          marginTop: "12px",
          padding: "12px",
          background: result.success
            ? "rgba(34, 197, 94, 0.05)"
            : "rgba(239, 68, 68, 0.05)",
          border: `1px solid ${result.success ? "rgba(34, 197, 94, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
          borderRadius: "6px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "8px",
          }}
        >
          {result.success ? (
            <CheckCircle size={16} style={{ color: "#22c55e" }} />
          ) : (
            <AlertCircle size={16} style={{ color: "#ef4444" }} />
          )}
          <span
            style={{
              fontSize: "12px",
              fontWeight: "600",
              color: result.success ? "#22c55e" : "#ef4444",
            }}
          >
            {result.success ? "Success" : "Error"}
          </span>
          {result.timestamp && (
            <span
              style={{
                fontSize: "11px",
                color: "#6b7280",
                marginLeft: "auto",
              }}
            >
              {result.timestamp}ms
            </span>
          )}
        </div>

        {result.success && result.result !== undefined ? (
          <div>
            {/* Transaction Hash for write functions */}
            {result.transactionHash && (
              <div style={{ marginBottom: "12px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#6b7280",
                    marginBottom: "4px",
                  }}
                >
                  Transaction Hash:
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <code
                    style={{
                      background: "rgba(34, 197, 94, 0.1)",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      fontFamily: "Monaco, Menlo, monospace",
                      color: "#22c55e",
                      flex: 1,
                    }}
                  >
                    {result.transactionHash}
                  </code>
                  <InlineCopyButton
                    value={result.transactionHash ?? ''}
                    ariaLabel="Copy transaction hash"
                    iconSize={10}
                    size={28}
                  />
                </div>
              </div>
            )}

            {/* Gas Used */}
            {result.gasUsed && (
              <div style={{ marginBottom: "8px" }}>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#6b7280",
                  }}
                >
                  Gas Used:{" "}
                </span>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#f59e0b",
                    fontFamily: "Monaco, Menlo, monospace",
                  }}
                >
                  {parseInt(result.gasUsed).toLocaleString()}
                </span>
              </div>
            )}

            {/* Return Value or Events */}
            <div
              style={{
                fontSize: "11px",
                color: "#6b7280",
                marginBottom: "4px",
              }}
            >
              {result.transactionHash ? "Events:" : "Return Value:"}
            </div>
            <div
              style={{
                background: "rgba(0, 0, 0, 0.02)",
                padding: "8px",
                borderRadius: "4px",
                fontFamily: "Monaco, Menlo, monospace",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                maxHeight: "200px",
                overflow: "auto",
              }}
            >
              {result.transactionHash ? (
                // Show events for write functions
                Array.isArray(result.result) &&
                (result.result as unknown[]).length > 0 ? (
                  (result.result as unknown[]).map((event, index) => (
                    <div key={index} style={{ marginBottom: "8px" }}>
                      <div style={{ color: "#3b82f6", fontWeight: "600" }}>
                        Event
                      </div>
                      <div style={{ marginLeft: "12px" }}>
                        {JSON.stringify(event, null, 2)}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#6b7280", fontStyle: "italic" }}>
                    No events emitted
                  </div>
                )
              ) : // Show return values for read functions
              selectedFunction && selectedFunction.outputs.length > 1 ? (
                selectedFunction.outputs.map((output, index) => (
                  <div key={index} style={{ marginBottom: "4px" }}>
                    <span style={{ color: "#6b7280" }}>
                      {output.name || `output${index}`} ({output.type}):
                    </span>{" "}
                    {formatOutputValue(
                      Array.isArray(result.result)
                        ? (result.result as unknown[])[index]
                        : result.result
                    )}
                  </div>
                ))
              ) : (
                formatOutputValue(result.result)
              )}
            </div>
          </div>
        ) : result.error ? (
          <div>
            <div
              style={{
                fontSize: "11px",
                color: "#6b7280",
                marginBottom: "4px",
              }}
            >
              Error Message:
            </div>
            <div
              style={{
                background: "rgba(239, 68, 68, 0.1)",
                padding: "8px",
                borderRadius: "4px",
                fontSize: "12px",
                color: "#dc2626",
              }}
            >
              {result.error}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderFunction = (func: FunctionCall, isReadOnly: boolean = true) => {
    const functionKey = getFunctionKey(func);
    const isExpanded = expandedFunctions.has(functionKey);
    const isLoading = loadingCalls.has(functionKey);
    const result = callResults[functionKey];

    return (
      <div
        key={functionKey}
        style={{
          background: "rgba(255, 255, 255, 0.5)",
          border: "1px solid rgba(0, 0, 0, 0.1)",
          borderRadius: "8px",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            padding: "12px",
            cursor: "pointer",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
          onClick={() => toggleFunctionExpansion(functionKey)}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: 1,
            }}
          >
            {isReadOnly ? (
              <Eye size={16} style={{ color: "#3b82f6" }} />
            ) : (
              <Zap size={16} style={{ color: "#f59e0b" }} />
            )}

            <span
              style={{
                fontFamily: "Monaco, Menlo, monospace",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              {func.name}
            </span>

            <span
              style={{
                fontSize: "11px",
                color: "#6b7280",
                background: "rgba(107, 114, 128, 0.1)",
                padding: "2px 6px",
                borderRadius: "3px",
              }}
            >
              {func.stateMutability}
            </span>

            {func.facetName && (
              <span
                style={{
                  fontSize: "11px",
                  color: "#8b5cf6",
                  background: "rgba(139, 92, 246, 0.1)",
                  padding: "2px 6px",
                  borderRadius: "3px",
                }}
              >
                {func.facetName}
              </span>
            )}

            {func.isWhatsABI && (
              <span
                style={{
                  fontSize: "10px",
                  color: "#f59e0b",
                  background: "rgba(245, 158, 11, 0.1)",
                  padding: "1px 4px",
                  borderRadius: "2px",
                }}
              >
                WhatsABI
              </span>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {result &&
              (result.success ? (
                <CheckCircle size={14} style={{ color: "#22c55e" }} />
              ) : (
                <AlertCircle size={14} style={{ color: "#ef4444" }} />
              ))}
            {isExpanded ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
          </div>
        </div>

        {isExpanded && (
          <div
            style={{
              borderTop: "1px solid rgba(0, 0, 0, 0.1)",
              padding: "16px",
              background: "rgba(0, 0, 0, 0.02)",
            }}
          >
            {/* Function signature */}
            <div style={{ marginBottom: "16px" }}>
              <div
                style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  marginBottom: "4px",
                }}
              >
                Function Signature:
              </div>
              <code
                style={{
                  background: "rgba(0, 0, 0, 0.05)",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontFamily: "Monaco, Menlo, monospace",
                }}
              >
                {func.name}(
                {func.inputs.map((i) => `${i.type} ${i.name}`).join(", ")})
                {func.outputs.length > 0 &&
                  ` returns (${func.outputs.map((o) => `${o.type} ${o.name || ""}`).join(", ")})`}
              </code>
            </div>

            {/* Input parameters */}
            {func.inputs.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#374151",
                  }}
                >
                  Parameters:
                </div>
                {func.inputs.map((param) =>
                  renderParameterInput(param, functionKey)
                )}
              </div>
            )}

            {/* Call button */}
            {isReadOnly ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  callReadOnlyFunction(func);
                }}
                disabled={isLoading}
                style={{
                  background: isLoading
                    ? "rgba(107, 114, 128, 0.5)"
                    : "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  fontSize: "12px",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  marginBottom: "12px",
                }}
              >
                {isLoading ? (
                  <Clock size={14} className="animate-spin" />
                ) : (
                  <Play size={14} />
                )}
                {isLoading ? "Calling..." : "Call Function"}
              </button>
            ) : (
              <div style={{ marginBottom: "12px" }}>
                {connectedWallet?.isConnected ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      executeWriteFunction(func);
                    }}
                    disabled={isLoading}
                    style={{
                      background: isLoading
                        ? "rgba(107, 114, 128, 0.5)"
                        : "#f59e0b",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      padding: "8px 16px",
                      fontSize: "12px",
                      cursor: isLoading ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {isLoading ? (
                      <Clock size={14} className="animate-spin" />
                    ) : (
                      <Zap size={14} />
                    )}
                    {isLoading
                      ? "Sending Transaction..."
                      : "Execute Transaction"}
                  </button>
                ) : (
                  <div
                    style={{
                      background: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid rgba(245, 158, 11, 0.3)",
                      borderRadius: "6px",
                      padding: "8px 12px",
                      fontSize: "11px",
                      color: "#92400e",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Wallet size={12} />
                    Connect wallet to execute write functions
                  </div>
                )}
              </div>
            )}

            {/* Results */}
            {renderFunctionResult(result)}
          </div>
        )}
      </div>
    );
  };

  if (functions.length === 0) {
    return (
      <div
        style={{
          background: "rgba(239, 68, 68, 0.05)",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "8px",
          padding: "16px",
          textAlign: "center",
          color: "#6b7280",
        }}
      >
        No functions available for interaction
      </div>
    );
  }

  return (
    <div style={{ marginTop: "20px" }}>
      <div
        style={{
          background: "rgba(59, 130, 246, 0.05)",
          border: "1px solid rgba(59, 130, 246, 0.2)",
          borderRadius: "8px",
          padding: "16px",
          marginBottom: "16px",
        }}
      >
        <h4
          style={{
            margin: "0 0 8px 0",
            color: "#3b82f6",
            fontSize: "16px",
            fontWeight: "600",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <Play size={18} />
          Interactive Function Calls
        </h4>
        <p
          style={{
            fontSize: "13px",
            color: "#6b7280",
            margin: "0 0 12px 0",
          }}
        >
          Select a function, enter arguments, then execute. Read-only functions
          call instantly; write functions require a connected wallet.
        </p>

        {/* Function dropdown (grouped by facet) */}
        <FunctionSelector
          functions={functions}
          getKey={getFunctionKey}
          onSelect={(key) => {
            setSelectedFunctionKey(key);
            setExpandedFunctions(new Set([key]));
          }}
          selectedKey={selectedFunctionKey}
        />
      </div>

      {/* Selected function panel */}
      {selectedFunction && (
        <div>{renderFunction(selectedFunction, selectedIsReadOnly)}</div>
      )}
    </div>
  );
};

export default DiamondFunctionCaller;
