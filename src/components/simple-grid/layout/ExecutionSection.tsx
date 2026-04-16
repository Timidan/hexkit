/**
 * ExecutionSection - Function execution button, gas estimation, result display, simulation insights.
 */
import React from "react";
import { AnimatedPlayIcon } from "../../icons/IconLibrary";
import { ethers } from "ethers";
import { ContractResultFormatter } from "../../../utils/resultFormatter";
import CopyableResult from "../../ui/CopyableResult";
import { Button } from "../../ui/button";
import ComplexValueViewer from "../../ui/ComplexValueViewer";
import {
  createNodeFromValue,
  serializeNode,
} from "../../../utils/complexValueBuilder";
import { parseError } from "../../../utils/errorParser";
import {
  normalizeResultString,
  deriveResultMetadata,
  stringifyResultData,
  safeBigNumberToString,
} from "../utils";
import { useGridContext } from "../GridContext";
import { getWalletClient as getWagmiWalletClient, waitForTransactionReceipt as wagmiWaitForReceipt } from "@wagmi/core";

export default function ExecutionSection(): React.ReactElement | null {
  const ctx: any = useGridContext();
  const {
    selectedFunctionObj,
    selectedFunctionType,
    contractAddress,
    contractInfo,
    isDiamond,
    diamondFacets,
    proxyInfo,
    implementationAbi,
    isSimulationMode,
    isSimulating,
    simulationError,
    simulationFromAddress,
    functionResult,
    setFunctionResult,
    generatedCallData,
    setGeneratedCallData,
    contractInputsHook,
    walletMissingForWrite,
    disableSimulationAction,
    isConnected,
    walletClient,
    publicClient,
    chainId,
    switchChain,
    accountChain,
    selectedNetwork,
    runSimulation,
    renderSimulationInsights,
    createEthersProvider,
    sanitizeAbiEntries,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showNotification,
    getWalletChainId,
    wagmiConfig,
  } = ctx;

  if (!selectedFunctionObj) return null;

  return (
    <div style={{
      marginTop: "20px",
      ...(isSimulationMode ? {
        position: "sticky" as const,
        bottom: 0,
        zIndex: 10,
        background: "#0f172a",
        paddingTop: "8px",
        paddingBottom: "4px",
        borderTop: "1px solid #1e293b",
      } : {}),
    }}>
      {/* Simulation caller input moved to SimulationOverridesPanel */}
      <div
        style={{
          display: "flex",
          gap: "12px",
          alignItems: "center",
          marginBottom: "12px",
        }}
      >
        <Button
          variant={walletMissingForWrite ? "secondary" : "ghost"}
          className="flex-1 text-[13px] font-semibold backdrop-blur-lg hover:bg-transparent dark:hover:bg-transparent shadow-none hover:shadow-none"
          disabled={walletMissingForWrite || disableSimulationAction}
          loading={isSimulationMode && isSimulating}
          icon={!isSimulating ? <AnimatedPlayIcon width={16} height={16} /> : undefined}
          onClick={async () => {
            if (disableSimulationAction) {
              return;
            }

            if (!selectedFunctionObj || !contractAddress) {
              showWarning(
                "Selection required",
                "Select both a contract and a function before executing."
              );
              return;
            }

            // For WRITE operations, check wallet connection and open modal if needed
            if (selectedFunctionType === "write" && walletMissingForWrite) {
              showWarning(
                "Wallet required",
                "Connect your wallet to send transactions."
              );
              return;
            }

            try {
              // Parse the function inputs using unified system
              const args =
                contractInputsHook.getFormattedArgs();

              // Create combined ABI for diamond contracts
              const getContractABI = () => {
                if (isDiamond && diamondFacets.length > 0) {
                  const combinedABI: any[] = [];
                  diamondFacets.forEach((facet: any) => {
                    if (facet.abi) {
                      let facetABI: any[] = [];
                      try {
                        facetABI = Array.isArray(facet.abi)
                          ? facet.abi
                          : JSON.parse(facet.abi as string);
                      } catch {
                        facetABI = [];
                      }
                      if (facetABI.length > 0) {
                        combinedABI.push(
                          ...sanitizeAbiEntries(facetABI)
                        );
                      }
                    }
                  });
                  return sanitizeAbiEntries(combinedABI);
                } else if (isDiamond) {
                  return [selectedFunctionObj];
                } else if (proxyInfo?.isProxy && implementationAbi) {
                  return sanitizeAbiEntries(implementationAbi);
                } else {
                  return sanitizeAbiEntries(
                    JSON.parse(contractInfo?.abi || "[]")
                  );
                }
              };

              const contractABI = getContractABI();

              if (isSimulationMode && selectedFunctionType === "write") {
                const iface = new ethers.utils.Interface(contractABI);
                const encodedCalldata = iface.encodeFunctionData(
                  selectedFunctionObj.name,
                  args
                );

                if (encodedCalldata) {
                  setGeneratedCallData(encodedCalldata);
                }

                setFunctionResult({ data: null, isLoading: true });

                const simulation = await runSimulation(
                  {
                    to: contractAddress as `0x${string}`,
                    data: encodedCalldata as `0x${string}`,
                    functionName: selectedFunctionObj.name,
                  },
                  {
                    description: selectedFunctionObj.name,
                    fromOverride: simulationFromAddress,
                  }
                );

                if (!simulation) {
                  setFunctionResult({
                    data: null,
                    error:
                      simulationError ||
                      "Simulation did not complete.",
                    isLoading: false,
                  });
                  return;
                }

                if (!simulation.success) {
                  const failureMessage =
                    simulation.error ||
                    simulation.revertReason ||
                    "Simulation indicated this call would revert.";
                  setFunctionResult({
                    data: null,
                    error: failureMessage,
                    isLoading: false,
                  });
                  return;
                }

                setFunctionResult({
                  data: {
                    mode: simulation.mode,
                    gasUsed: simulation.gasUsed,
                    warnings: simulation.warnings ?? [],
                  },
                  formattedResult: {
                    displayValue:
                      simulation.gasUsed
                        ? `Simulation succeeded. Estimated gas usage: ${simulation.gasUsed}.`
                        : "Simulation succeeded.",
                    type: "simulation",
                  },
                  isLoading: false,
                });
                return;
              }

              if (selectedFunctionType === "read") {
                // Set loading state
                setFunctionResult({
                  data: null,
                  isLoading: true,
                });

                try {
                  const persistResult = (resultValue: any) => {
                    const rawFunctionABI = contractABI.find(
                      (item: any) =>
                        item.type === "function" &&
                        item.name === selectedFunctionObj.name
                    );

                    let functionObjToUse = rawFunctionABI;

                    if (
                      selectedFunctionObj &&
                      selectedFunctionObj.outputs &&
                      Array.isArray(selectedFunctionObj.outputs)
                    ) {
                      functionObjToUse = {
                        name: selectedFunctionObj.name,
                        outputs: selectedFunctionObj.outputs.map(
                          (output: any) => ({
                            name:
                              output.name || `output_${output.type}`,
                            type: output.type,
                            internalType: output.internalType,
                            components: output.components,
                          })
                        ),
                      } as any;
                    } else if (!functionObjToUse) {
                      functionObjToUse = selectedFunctionObj;
                    }

                    const formattedResult =
                      ContractResultFormatter.formatResult(
                        resultValue,
                        functionObjToUse ?? selectedFunctionObj ?? {
                          outputs: [],
                        }
                      );

                    setFunctionResult({
                      data: safeBigNumberToString(resultValue),
                      formattedResult,
                      functionABI: functionObjToUse ?? selectedFunctionObj,
                      isLoading: false,
                    });
                  };

                  if (isSimulationMode) {
                    const iface = new ethers.utils.Interface(contractABI);
                    const encodedCalldata = iface.encodeFunctionData(
                      selectedFunctionObj.name,
                      args
                    );

                    if (encodedCalldata) {
                      setGeneratedCallData(encodedCalldata);
                    }

                    const simulation = await runSimulation(
                      {
                        to: contractAddress as `0x${string}`,
                        data: encodedCalldata as `0x${string}`,
                        functionName: selectedFunctionObj.name,
                      },
                      {
                        description: selectedFunctionObj.name,
                        fromOverride: simulationFromAddress,
                      }
                    );

                    if (!simulation) {
                      setFunctionResult({
                        data: null,
                        error:
                          simulationError ||
                          "Simulation did not complete.",
                        isLoading: false,
                      });
                      return;
                    }

                    if (!simulation.success) {
                      const failureMessage =
                        simulation.error ||
                        simulation.revertReason ||
                        "Simulation indicated this call would revert.";
                      setFunctionResult({
                        data: null,
                        error: failureMessage,
                        isLoading: false,
                      });
                      return;
                    }

                    const rawTrace = simulation.rawTrace as unknown;
                    const returnData =
                      typeof rawTrace === "string"
                        ? rawTrace
                        : rawTrace &&
                            typeof rawTrace === "object" &&
                            "returnData" in (rawTrace as Record<string, any>)
                          ? (rawTrace as Record<string, any>).returnData
                          : null;

                    if (!returnData || returnData === "0x") {
                      setFunctionResult({
                        data: null,
                        error: "Simulation succeeded but returned no data.",
                        isLoading: false,
                      });
                      return;
                    }

                    const decodedResult = iface.decodeFunctionResult(
                      selectedFunctionObj.name,
                      returnData
                    );
                    persistResult(decodedResult);
                    return;
                  }

                  // Check if publicClient's chain matches the selected network
                  const walletChainMismatch =
                    publicClient &&
                    selectedNetwork &&
                    publicClient.chain?.id !== selectedNetwork.id;

                  if (isDiamond || !publicClient || walletChainMismatch) {
                    if (!selectedNetwork) {
                      throw new Error("No network selected");
                    }

                    const provider =
                      await createEthersProvider(selectedNetwork);
                    const contract = new ethers.Contract(
                      contractAddress,
                      contractABI,
                      provider
                    );
                    const result = await contract[
                      selectedFunctionObj.name
                    ](...args);
                    persistResult(result);
                  } else {
                    const result = await publicClient.readContract({
                      address: contractAddress as `0x${string}`,
                      abi: contractABI,
                      functionName: selectedFunctionObj.name,
                      args,
                    });
                    persistResult(result);
                  }
                  return;
                } catch (error: any) {
                  const parsedErr = parseError(error);
                  setFunctionResult({
                    data: null,
                    error: parsedErr.message,
                    isLoading: false,
                  });
                }
              } else {
                try {
                  // Network validation before write function execution
                  const currentWalletChain = accountChain?.id;
                  const appSelectedChain =
                    selectedNetwork?.id;

                  if (
                    appSelectedChain !== undefined &&
                    currentWalletChain !== undefined &&
                    currentWalletChain !== appSelectedChain
                  ) {
                    const networkName =
                      selectedNetwork?.name ||
                      `Chain ${appSelectedChain}`;

                    // Show info notification about automatic network switch
                    showInfo(
                      "Network Switch Required",
                      `Switching from Chain ${currentWalletChain} to ${networkName}...`
                    );

                    if (switchChain && appSelectedChain) {
                      try {
                        await switchChain({
                          chainId: appSelectedChain as any,
                        });

                        // Poll for network switch completion (up to 5s)
                        let updatedChainId: number | undefined;
                        for (let attempt = 0; attempt < 10; attempt++) {
                          await new Promise((resolve) =>
                            setTimeout(resolve, 500)
                          );
                          updatedChainId = await getWalletChainId(
                            walletClient
                          );
                          if (updatedChainId !== undefined && updatedChainId === appSelectedChain) break;
                        }

                        if (
                          updatedChainId !==
                            undefined &&
                          updatedChainId !==
                            appSelectedChain
                        ) {
                          showError(
                            "Network Switch Failed",
                            `Wallet is still on chain ${updatedChainId}. Please switch to ${networkName}.`
                          );
                          setFunctionResult({
                            data: null,
                            error: `Switch to ${networkName} before executing.`,
                            isLoading: false,
                          });
                          return;
                        }

                        showSuccess(
                          "Network Switched",
                          `Successfully switched to ${networkName}`
                        );
                      } catch (switchError: any) {
                        showError(
                          "Network Switch Failed",
                          `Failed to switch to ${networkName}: ${switchError.message}`
                        );
                        setFunctionResult({
                          data: null,
                          error: `Failed to switch network: ${switchError.message}`,
                          isLoading: false,
                        });
                        return;
                      }
                    } else {
                      showError(
                        "Network Switch Unavailable",
                        `Please manually switch to ${networkName} to execute this function`
                      );
                      setFunctionResult({
                        data: null,
                        error: `Please switch to ${networkName} to execute this function`,
                        isLoading: false,
                      });
                      return;
                    }
                  }

                  if (!isSimulationMode) {
                    // Get a fresh wallet client for the target chain.
                    // The hook-based walletClient may be stale after a switchChain() call
                    // since React hooks don't update mid-execution.
                    let activeWalletClient = walletClient;
                    const targetChainId = selectedNetwork?.id;

                    if (wagmiConfig && targetChainId) {
                      try {
                        activeWalletClient = await getWagmiWalletClient(wagmiConfig, {
                          chainId: targetChainId,
                        });
                      } catch {
                        // Fall back to hook-based client if action fails
                      }
                    }

                    if (!activeWalletClient) {
                      showError(
                        "Wallet Not Available",
                        "No wallet client found. Please connect your wallet and try again."
                      );
                      return;
                    }

                    const resolvedClientChainId =
                      await getWalletChainId(activeWalletClient);

                    if (
                      selectedNetwork &&
                      resolvedClientChainId !== undefined &&
                      resolvedClientChainId !== selectedNetwork.id
                    ) {
                      const expectedName = selectedNetwork.name || "selected network";
                      showError(
                        "Network Mismatch",
                        `Wallet is connected to chain ID ${resolvedClientChainId}, expected ${selectedNetwork.id}. Please switch to ${expectedName}.`
                      );
                      setFunctionResult({
                        data: null,
                        error: `Wallet network mismatch. Expected ${expectedName}.`,
                        isLoading: false,
                      });
                      return;
                    }

                    const hash = await activeWalletClient.writeContract({
                      address: contractAddress as `0x${string}`,
                      abi: contractABI,
                      functionName: selectedFunctionObj.name,
                      args: args,
                      chain: targetChainId ? { id: targetChainId } : undefined,
                    });
                    const networkName =
                      selectedNetwork?.name ||
                      "Unknown Network";
                    const explorerUrl =
                      selectedNetwork?.explorerUrl ||
                      "https://etherscan.io";
                    // Show pending notification while waiting for receipt
                    showNotification({
                      type: "info",
                      title: "Transaction Pending",
                      message: `Waiting for confirmation on ${networkName}...`,
                      duration: 60000,
                      action: {
                        label: "View on Explorer",
                        onClick: () =>
                          window.open(
                            `${explorerUrl}/tx/${hash}`,
                            "_blank"
                          ),
                      },
                    });
                    // Wait for the transaction receipt to check actual status
                    // Use wagmi core's waitForTransactionReceipt with explicit chainId
                    // to avoid stale publicClient closure after chain switch
                    if (wagmiConfig) {
                      try {
                        const receipt = await wagmiWaitForReceipt(wagmiConfig, {
                          hash,
                          chainId: targetChainId,
                          timeout: 120_000,
                        });
                        if (receipt.status === "reverted") {
                          showError(
                            "Transaction Reverted",
                            `Transaction was mined but reverted on ${networkName}.`,
                            10000
                          );
                          setFunctionResult({
                            data: null,
                            error: `Transaction reverted (tx: ${hash})`,
                            isLoading: false,
                          });
                        } else {
                          showNotification({
                            type: "success",
                            title: "Transaction Confirmed",
                            message: `Transaction confirmed on ${networkName}`,
                            duration: 8000,
                            action: {
                              label: "View on Explorer",
                              onClick: () =>
                                window.open(
                                  `${explorerUrl}/tx/${hash}`,
                                  "_blank"
                                ),
                            },
                          });
                        }
                      } catch {
                        // Receipt fetch timed out or failed — let user check manually
                        showNotification({
                          type: "warning",
                          title: "Receipt Unavailable",
                          message: `Transaction sent on ${networkName} but receipt could not be confirmed. Check explorer.`,
                          duration: 8000,
                          action: {
                            label: "View on Explorer",
                            onClick: () =>
                              window.open(
                                `${explorerUrl}/tx/${hash}`,
                                "_blank"
                              ),
                          },
                        });
                      }
                    } else {
                      // No wagmiConfig — fallback to old behavior
                      showNotification({
                        type: "success",
                        title: "Transaction Sent",
                        message: `Transaction submitted on ${networkName}`,
                        duration: 8000,
                        action: {
                          label: "View on Explorer",
                          onClick: () =>
                            window.open(
                              `${explorerUrl}/tx/${hash}`,
                              "_blank"
                            ),
                        },
                      });
                    }
                  }
                } catch (error: any) {
                  const parsedError = parseError(error);
                  const timeout = parsedError.type === 'auth' ? 4000 : 8000;
                  showError(
                    "Transaction Failed",
                    parsedError.message,
                    timeout
                  );
                }
              }
            } catch (overallError: any) {
              const parsedOverall = parseError(overallError);
              if (selectedFunctionType === "read") {
                setFunctionResult({
                  data: null,
                  error: parsedOverall.message,
                  isLoading: false,
                });
              } else {
                showError(
                  "Transaction failed",
                  parsedOverall.message
                );
              }
            }
          }}
        >
          {selectedFunctionType === "read"
              ? isSimulationMode
                ? isSimulating
                  ? "Simulating…"
                  : "Simulate Call"
                : "Call Function"
            : isSimulationMode
              ? isSimulating
                ? "Simulating…"
                : "Run Simulation"
              : !isConnected
                ? "Connect Wallet"
                : "Send Transaction"}
        </Button>

      </div>

      {isSimulationMode &&
        selectedFunctionType === "write" && (
          <div style={{ marginTop: "16px" }}>
            {renderSimulationInsights()}
          </div>
        )}

      {/* Wallet / simulation reminder */}
      {selectedFunctionType === "write" && !isSimulationMode && (!isConnected || !walletClient) && (
        <div
          style={{
            padding: "8px 12px",
            background: "rgba(59, 130, 246, 0.1)",
            border: "1px solid rgba(59, 130, 246, 0.3)",
            borderRadius: "6px",
            fontSize: "13px",
            color: "#93c5fd",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
           Connect your wallet using the button above to
          execute transactions
        </div>
      )}

      {/* Function Result Display - only for read operations, not in simulation mode */}
      {selectedFunctionType === "read" &&
        functionResult &&
        !isSimulationMode && (
          <div style={{ marginTop: "16px" }}>
            <div
              style={{
                fontSize: "15px",
                fontWeight: "600",
                color: "#888",
                marginBottom: "8px",
              }}
            >
              Function Result
            </div>

            {functionResult.isLoading ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  color: "#888",
                  background: "rgba(15, 23, 42, 0.6)",
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  borderRadius: "8px",
                  padding: "12px",
                  fontFamily:
                    "Monaco, Menlo, Ubuntu Mono, monospace",
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    border: "2px solid #333",
                    borderTop: "2px solid #888",
                    borderRadius: "50%",
                    animation: "spin 1s linear infinite",
                  }}
                />
                Executing function...
              </div>
            ) : functionResult.error ? (
              <CopyableResult
                title=" Error"
                tone="error"
                plainText={String(functionResult.error)}
                copyText={String(functionResult.error)}
                monospace
              />
            ) : (
              (() => {
                const hasStructuredOutputs =
                  functionResult.functionABI &&
                  functionResult.functionABI.outputs &&
                  functionResult.functionABI.outputs.length > 0;

                const resultType =
                  functionResult.formattedResult?.type ||
                  "unknown";

                const metadata = hasStructuredOutputs
                  ? deriveResultMetadata(
                      functionResult.functionABI
                    )
                  : undefined;

                const structuredNode =
                  hasStructuredOutputs && metadata
                    ? createNodeFromValue(
                        functionResult.data,
                        metadata
                      )
                    : null;

                const defaultCopySource =
                  functionResult.formattedResult?.displayValue ??
                  functionResult.data ??
                  "";

                const copyText = structuredNode
                  ? serializeNode(structuredNode)
                  : stringifyResultData(defaultCopySource);

                const plainTextFallback =
                  !structuredNode &&
                  !functionResult.formattedResult?.htmlContent
                    ? normalizeResultString(
                        functionResult.formattedResult
                          ?.displayValue ?? functionResult.data
                      )
                    : undefined;

                return (
                  <CopyableResult
                    title={` Result (${resultType})`}
                    tone="success"
                    copyText={copyText}
                    htmlContent={
                      structuredNode
                        ? undefined
                        : functionResult.formattedResult
                            ?.htmlContent || undefined
                    }
                    plainText={plainTextFallback}
                    monospace
                  >
                    {structuredNode && (
                        <ComplexValueViewer
                          node={structuredNode}
                          showControls
                          options={{
                            collapse: {
                            root: true,
                            depth: 3,
                            arrayItems: 12,
                            objectKeys: 12,
                          },
                            previewItems: 4,
                        }}
                      />
                    )}
              </CopyableResult>
            );
          })()
        )}
            {isSimulationMode && (
              <div style={{ marginTop: "16px" }}>
                {renderSimulationInsights()}
              </div>
            )}
          </div>
        )}
    </div>
  );
}
