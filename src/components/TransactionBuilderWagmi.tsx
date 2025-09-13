import React, { useState, useEffect, useMemo } from "react";
import {
  useAccount,
  useWalletClient,
  usePublicClient,
  useChainId,
} from "wagmi";
import { parseEther, encodeFunctionData, createPublicClient, http } from "viem";
import type {
  TransactionRequest,
  SimulationResult,
  TransactionReceipt,
} from "../types/transaction";
import type { Chain } from "../types";
import WalletConnectionNew from "./WalletConnectionNew";
import ABIFetcher from "./ABIFetcher";
import ContractInfoDisplay from "./ContractInfoDisplay";
import { SUPPORTED_CHAINS } from "../utils/chains";
import { simulateTransaction } from "../utils/transactionSimulation";
import {
  parseTransactionError,
  formatErrorForUser,
} from "../utils/errorParser";

const TransactionBuilderWagmi: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const chainId = useChainId();

  // Transaction building state
  const [contractAddress, setContractAddress] = useState("");
  const [abi, setAbi] = useState("");
  const [selectedFunction, setSelectedFunction] = useState("");
  const [functionInputs, setFunctionInputs] = useState<Record<string, string>>(
    {}
  );
  const [ethValue, setEthValue] = useState("");
  const [gasLimit, setGasLimit] = useState("");

  // Transaction execution state
  const [builtTransaction, setBuiltTransaction] =
    useState<TransactionRequest | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Find current chain
  const currentChain = useMemo(() => {
    return (
      SUPPORTED_CHAINS.find((chain) => chain.id === chainId) ||
      SUPPORTED_CHAINS[0]
    );
  }, [chainId]);

  // Create ethers provider for compatibility with existing functions
  const ethersProvider = useMemo(() => {
    if (!publicClient) return undefined;

    // Create a simple ethers-compatible provider wrapper
    return {
      connection: { url: publicClient?.transport?.url || "unknown" },
      estimateGas: async (transaction: any) => {
        const gas = await publicClient.estimateGas({
          account: transaction.from,
          to: transaction.to,
          data: transaction.data,
          value: transaction.value ? BigInt(transaction.value) : BigInt(0),
        });
        return { toString: () => gas.toString() };
      },
      call: async (transaction: any) => {
        return await publicClient.call({
          account: transaction.from,
          to: transaction.to,
          data: transaction.data,
          value: transaction.value ? BigInt(transaction.value) : BigInt(0),
        });
      },
    };
  }, [publicClient]);

  const buildTransaction = () => {
    try {
      if (!abi || !selectedFunction || !contractAddress) {
        setError(
          "Please provide ABI, select function, and enter contract address"
        );
        return;
      }

      const parsedAbi = JSON.parse(abi);
      const func = parsedAbi.find((f: any) => f.name === selectedFunction);

      if (!func) {
        setError("Selected function not found in ABI");
        return;
      }

      // Build function arguments
      const args = func.inputs.map((input: any) => {
        const value = functionInputs[input.name] || "";
        if (input.type.includes("uint") || input.type.includes("int")) {
          return BigInt(value || "0");
        }
        if (input.type === "bool") {
          return value === "true";
        }
        if (input.type.includes("[]")) {
          try {
            return JSON.parse(value || "[]");
          } catch {
            return [];
          }
        }
        return value;
      });

      // Encode function data using viem
      const data = encodeFunctionData({
        abi: parsedAbi,
        functionName: selectedFunction,
        args,
      });

      // Build transaction
      const transaction: TransactionRequest = {
        to: contractAddress,
        data,
        value: ethValue ? parseEther(ethValue).toString() : "0",
        gasLimit: gasLimit || undefined,
      };

      setBuiltTransaction(transaction);
      setSimulation(null);
      setReceipt(null);
      setError(null);
    } catch (err: any) {
      setError(`Failed to build transaction: ${err.message}`);
    }
  };

  const simulateTransactionCall = async () => {
    if (!builtTransaction || !address) {
      setError("Please build transaction and connect wallet first");
      return;
    }

    setIsSimulating(true);
    setError(null);

    try {
      const result = await simulateTransaction(
        builtTransaction,
        currentChain,
        address,
        ethersProvider as any
      );
      setSimulation(result);
    } catch (err: any) {
      const parsedError = parseTransactionError(err);
      setError(formatErrorForUser(parsedError));
    } finally {
      setIsSimulating(false);
    }
  };

  const sendTransaction = async () => {
    if (!builtTransaction || !walletClient || !address) {
      setError("Please build transaction and connect wallet first");
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const hash = await walletClient.sendTransaction({
        account: address,
        to: builtTransaction.to as `0x${string}`,
        data: builtTransaction.data as `0x${string}`,
        value: builtTransaction.value
          ? BigInt(builtTransaction.value)
          : BigInt(0),
        gas: builtTransaction.gasLimit
          ? BigInt(builtTransaction.gasLimit)
          : undefined,
      });

      // Wait for transaction receipt
      if (publicClient) {
        const txReceipt = await publicClient.waitForTransactionReceipt({
          hash,
        });

        const receipt: TransactionReceipt = {
          hash: txReceipt.transactionHash,
          blockNumber: Number(txReceipt.blockNumber),
          gasUsed: txReceipt.gasUsed.toString(),
          effectiveGasPrice: txReceipt.effectiveGasPrice?.toString() || "0",
          status: txReceipt.status === "success" ? 1 : 0,
          explorerUrl: `${currentChain.explorerUrl}/tx/${txReceipt.transactionHash}`,
        };

        setReceipt(receipt);
      }
    } catch (err: any) {
      const parsedError = parseTransactionError(err);
      setError(formatErrorForUser(parsedError));
    } finally {
      setIsSending(false);
    }
  };

  const resetBuilder = () => {
    setBuiltTransaction(null);
    setSimulation(null);
    setReceipt(null);
    setError(null);
    setContractAddress("");
    setSelectedFunction("");
    setFunctionInputs({});
    setEthValue("");
    setGasLimit("");
  };

  return (
    <div className="transaction-builder">
      <h2>🔨 Transaction Builder</h2>

      <WalletConnectionNew />

      {isConnected && (
        <div className="builder-content">
          {/* Contract and ABI Section */}
          <div className="builder-section">
            <h3>📋 Contract Setup</h3>

            <ABIFetcher
              onABIFetched={setAbi}
              initialContractAddress={contractAddress}
              onContractAddressChange={setContractAddress}
            />

            {abi && contractAddress && (
              <ContractInfoDisplay
                abi={abi}
                contractAddress={contractAddress}
                chain={currentChain}
                provider={ethersProvider as any}
              />
            )}
          </div>

          {/* Function Selection Section */}
          {abi && (
            <div className="builder-section">
              <h3>⚙️ Function Selection</h3>

              <div className="form-group">
                <label>Select Function</label>
                <select
                  value={selectedFunction}
                  onChange={(e) => {
                    setSelectedFunction(e.target.value);
                    const func = JSON.parse(abi).find(
                      (f: any) => f.name === e.target.value
                    );
                    if (func) {
                      const newInputs: Record<string, string> = {};
                      func.inputs.forEach((input: any) => {
                        newInputs[input.name] = "";
                      });
                      setFunctionInputs(newInputs);
                    }
                  }}
                >
                  <option value="">Choose function...</option>
                  {JSON.parse(abi)
                    .filter((item: any) => item.type === "function")
                    .map((func: any) => (
                      <option key={func.name} value={func.name}>
                        {func.name}(
                        {func.inputs
                          .map((i: any) => `${i.type} ${i.name}`)
                          .join(", ")}
                        )
                      </option>
                    ))}
                </select>
              </div>

              {selectedFunction &&
                Object.keys(functionInputs).map((name) => {
                  const func = JSON.parse(abi).find(
                    (f: any) => f.name === selectedFunction
                  );
                  const input = func?.inputs.find((i: any) => i.name === name);

                  return (
                    <div key={name} className="form-group">
                      <label>
                        {name} ({input?.type})
                      </label>
                      <input
                        value={functionInputs[name]}
                        onChange={(e) =>
                          setFunctionInputs({
                            ...functionInputs,
                            [name]: e.target.value,
                          })
                        }
                        placeholder={`Enter ${input?.type} value`}
                      />
                    </div>
                  );
                })}

              <div className="form-group">
                <label>ETH Value (optional)</label>
                <input
                  type="number"
                  step="0.01"
                  value={ethValue}
                  onChange={(e) => setEthValue(e.target.value)}
                  placeholder="0.0"
                />
              </div>

              <div className="form-group">
                <label>Gas Limit (optional)</label>
                <input
                  value={gasLimit}
                  onChange={(e) => setGasLimit(e.target.value)}
                  placeholder="Auto-estimate"
                />
              </div>

              <button onClick={buildTransaction} className="build-btn">
                🔨 Build Transaction
              </button>
            </div>
          )}

          {/* Transaction Preview Section */}
          {builtTransaction && (
            <div className="builder-section">
              <h3>📄 Transaction Preview</h3>

              <div className="transaction-preview">
                <div className="tx-field">
                  <label>To:</label>
                  <code>{builtTransaction.to}</code>
                </div>
                <div className="tx-field">
                  <label>Data:</label>
                  <code className="truncate">{builtTransaction.data}</code>
                </div>
                {builtTransaction.value !== "0" && (
                  <div className="tx-field">
                    <label>Value:</label>
                    <code>
                      {(
                        parseFloat(builtTransaction.value || "0") / 1e18
                      ).toFixed(4)}{" "}
                      ETH
                    </code>
                  </div>
                )}
              </div>

              <div className="transaction-actions">
                <button
                  onClick={simulateTransactionCall}
                  disabled={isSimulating}
                  className="simulate-btn"
                >
                  {isSimulating ? "Simulating..." : "🔍 Simulate Transaction"}
                </button>

                <button
                  onClick={sendTransaction}
                  disabled={
                    isSending || (simulation ? !simulation.success : false)
                  }
                  className="send-btn"
                  style={{
                    opacity: simulation && !simulation.success ? 0.5 : 1,
                  }}
                >
                  {isSending ? "Sending..." : "🚀 Send Transaction"}
                </button>

                <button onClick={resetBuilder} className="reset-btn">
                  🔄 Reset
                </button>
              </div>
            </div>
          )}

          {/* Simulation Results */}
          {simulation && (
            <div className="builder-section">
              <h3>🔍 Simulation Results</h3>

              <div
                className={`simulation-result ${simulation.success ? "success" : "error"}`}
              >
                {simulation.success ? (
                  <div>
                    <p>✅ Simulation successful!</p>
                    <div className="simulation-details">
                      <div>Gas Used: {simulation.gasUsed}</div>
                      <div>Gas Limit: {simulation.gasLimit}</div>
                      {simulation.changes && simulation.changes.length > 0 && (
                        <div className="asset-changes">
                          <h4>Asset Changes:</h4>
                          {simulation.changes.map((change, index) => (
                            <div key={index} className="asset-change">
                              {change.changeType}{" "}
                              {Math.abs(parseFloat(change.amount))}{" "}
                              {change.symbol}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div>
                    <p>❌ Simulation failed!</p>
                    <div className="simulation-error">{simulation.error}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transaction Receipt */}
          {receipt && (
            <div className="builder-section">
              <h3>✅ Transaction Sent</h3>

              <div className="transaction-receipt success">
                <p>Transaction successfully sent!</p>
                <div className="receipt-details">
                  <div>
                    Hash:{" "}
                    <a
                      href={receipt.explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {receipt.hash}
                    </a>
                  </div>
                  <div>Block: {receipt.blockNumber}</div>
                  <div>Gas Used: {receipt.gasUsed}</div>
                  <div>
                    Status: {receipt.status === 1 ? "Success" : "Failed"}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="builder-section">
              <div className="error-message">❌ {error}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TransactionBuilderWagmi;
