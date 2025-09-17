import React, { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import { Play, Eye, Edit, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, Button, Input, LoadingSpinner, ErrorDisplay, Badge } from '../shared';
import MinimalArgInput from '../MinimalArgInput';
import type { Chain } from '../../types';
import '../../styles/ContractComponents.css';

export interface FunctionCallerProps {
  /** Contract interface for encoding/decoding */
  contractInterface: ethers.utils.Interface;
  /** Contract address */
  contractAddress: string;
  /** Selected network */
  network: Chain;
  /** Function to execute */
  selectedFunction: ethers.utils.FunctionFragment | null;
  /** Whether to show gas estimation */
  showGasEstimation?: boolean;
  /** Whether to show transaction value input */
  showValueInput?: boolean;
  /** Callback when function is called successfully */
  onFunctionCalled?: (result: FunctionCallResult) => void;
  /** Callback when function call fails */
  onCallError?: (error: string) => void;
  /** Custom provider (defaults to window.ethereum) */
  provider?: ethers.providers.Provider;
  /** Additional CSS classes */
  className?: string;
}

export interface FunctionCallResult {
  functionName: string;
  args: any[];
  result?: any;
  transactionHash?: string;
  gasUsed?: string;
  gasLimit?: string;
  value?: string;
  success: boolean;
  error?: string;
}

export interface GasEstimation {
  gasLimit: string;
  gasPrice: string;
  estimatedCost: string;
  error?: string;
}

const FunctionCaller: React.FC<FunctionCallerProps> = ({
  contractInterface,
  contractAddress,
  network,
  selectedFunction,
  showGasEstimation = true,
  showValueInput = true,
  onFunctionCalled,
  onCallError,
  provider,
  className = ''
}) => {
  const [functionInputs, setFunctionInputs] = useState<{ [key: string]: any }>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [isEstimatingGas, setIsEstimatingGas] = useState(false);
  const [gasEstimation, setGasEstimation] = useState<GasEstimation | null>(null);
  const [transactionValue, setTransactionValue] = useState('0');
  const [executionResult, setExecutionResult] = useState<FunctionCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useCustomGas, setUseCustomGas] = useState(false);
  const [customGasLimit, setCustomGasLimit] = useState('');
  const [customGasPrice, setCustomGasPrice] = useState('');

  const isReadFunction = selectedFunction?.stateMutability === 'view' || selectedFunction?.stateMutability === 'pure';
  const isPayableFunction = selectedFunction?.stateMutability === 'payable';

  const resetState = useCallback(() => {
    setError(null);
    setExecutionResult(null);
    setGasEstimation(null);
  }, []);

  const handleInputChange = useCallback((paramName: string, value: any) => {
    setFunctionInputs(prev => ({
      ...prev,
      [paramName]: value
    }));
    // Reset gas estimation when inputs change
    setGasEstimation(null);
  }, []);

  const validateInputs = useCallback((): string | null => {
    if (!selectedFunction) return 'No function selected';
    
    for (const input of selectedFunction.inputs) {
      const value = functionInputs[input.name];
      if (value === undefined || value === null || value === '') {
        return `Parameter "${input.name}" is required`;
      }
    }
    
    if (isPayableFunction && showValueInput) {
      try {
        ethers.utils.parseEther(transactionValue || '0');
      } catch {
        return 'Invalid transaction value';
      }
    }
    
    return null;
  }, [selectedFunction, functionInputs, isPayableFunction, showValueInput, transactionValue]);

  const estimateGas = useCallback(async () => {
    if (!selectedFunction || !provider || isReadFunction) return;
    
    const validationError = validateInputs();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setIsEstimatingGas(true);
    setError(null);
    
    try {
      // Encode function call
      const args = selectedFunction.inputs.map(input => functionInputs[input.name]);
      const data = contractInterface.encodeFunctionData(selectedFunction.name, args);
      
      // Get signer for gas estimation
      const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
      const signer = web3Provider.getSigner();
      
      // Estimate gas
      const gasLimit = await signer.estimateGas({
        to: contractAddress,
        data,
        value: isPayableFunction ? ethers.utils.parseEther(transactionValue || '0') : undefined
      });
      
      // Get gas price
      const gasPrice = await web3Provider.getGasPrice();
      
      // Calculate estimated cost
      const estimatedCost = gasLimit.mul(gasPrice);
      
      setGasEstimation({
        gasLimit: gasLimit.toString(),
        gasPrice: ethers.utils.formatUnits(gasPrice, 'gwei'),
        estimatedCost: ethers.utils.formatEther(estimatedCost)
      });
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Gas estimation failed';
      setGasEstimation({
        gasLimit: 'Unknown',
        gasPrice: 'Unknown',
        estimatedCost: 'Unknown',
        error: errorMessage
      });
    } finally {
      setIsEstimatingGas(false);
    }
  }, [selectedFunction, provider, contractInterface, contractAddress, functionInputs, transactionValue, isReadFunction, isPayableFunction, validateInputs]);

  const executeFunction = useCallback(async () => {
    if (!selectedFunction) return;
    
    const validationError = validateInputs();
    if (validationError) {
      setError(validationError);
      return;
    }
    
    setIsExecuting(true);
    resetState();
    
    try {
      const args = selectedFunction.inputs.map(input => functionInputs[input.name]);
      
      if (isReadFunction) {
        // Read function - call directly
        if (!provider) {
          throw new Error('Provider required for read functions');
        }
        
        const contract = new ethers.Contract(contractAddress, contractInterface, provider);
        const result = await contract[selectedFunction.name](...args);
        
        const callResult: FunctionCallResult = {
          functionName: selectedFunction.name,
          args,
          result,
          success: true
        };
        
        setExecutionResult(callResult);
        
        if (onFunctionCalled) {
          onFunctionCalled(callResult);
        }
        
      } else {
        // Write function - send transaction
        if (!window.ethereum) {
          throw new Error('Wallet not connected');
        }
        
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = web3Provider.getSigner();
        const contract = new ethers.Contract(contractAddress, contractInterface, signer);
        
        // Prepare transaction options
        const txOptions: any = {};
        
        if (isPayableFunction && transactionValue && transactionValue !== '0') {
          txOptions.value = ethers.utils.parseEther(transactionValue);
        }
        
        if (useCustomGas) {
          if (customGasLimit) {
            txOptions.gasLimit = customGasLimit;
          }
          if (customGasPrice) {
            txOptions.gasPrice = ethers.utils.parseUnits(customGasPrice, 'gwei');
          }
        } else if (gasEstimation && !gasEstimation.error) {
          txOptions.gasLimit = gasEstimation.gasLimit;
        }
        
        // Send transaction
        const tx = await contract[selectedFunction.name](...args, txOptions);
        const receipt = await tx.wait();
        
        const callResult: FunctionCallResult = {
          functionName: selectedFunction.name,
          args,
          transactionHash: receipt.transactionHash,
          gasUsed: receipt.gasUsed.toString(),
          gasLimit: txOptions.gasLimit?.toString(),
          value: txOptions.value?.toString(),
          success: true
        };
        
        setExecutionResult(callResult);
        
        if (onFunctionCalled) {
          onFunctionCalled(callResult);
        }
      }
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Function execution failed';
      setError(errorMessage);
      
      const failedResult: FunctionCallResult = {
        functionName: selectedFunction.name,
        args: selectedFunction.inputs.map(input => functionInputs[input.name]),
        success: false,
        error: errorMessage
      };
      
      setExecutionResult(failedResult);
      
      if (onCallError) {
        onCallError(errorMessage);
      }
    } finally {
      setIsExecuting(false);
    }
  }, [selectedFunction, contractInterface, contractAddress, functionInputs, transactionValue, isReadFunction, isPayableFunction, provider, gasEstimation, useCustomGas, customGasLimit, customGasPrice, validateInputs, resetState, onFunctionCalled, onCallError]);

  if (!selectedFunction) {
    return (
      <div className={`function-caller ${className}`}>
        <Card>
          <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
            Select a function to execute
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className={`function-caller ${className}`}>
      <Card 
        title={`${selectedFunction.name} (${isReadFunction ? 'read' : 'write'})`}
        variant="default"
      >
        {/* Function Inputs */}
        {selectedFunction.inputs.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <h4 style={{ marginBottom: 'var(--space-3)', color: 'var(--text-primary)' }}>
              Parameters
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <MinimalArgInput
                abi={[selectedFunction]}
                functionName={selectedFunction.name}
                onDataChange={(args) => {
                  const newInputs: { [key: string]: any } = {};
                  selectedFunction.inputs.forEach((input, index) => {
                    newInputs[input.name] = args[index];
                  });
                  setFunctionInputs(newInputs);
                }}
                initialData={selectedFunction.inputs.map(input => functionInputs[input.name] || '')}
              />
            </div>
          </div>
        )}

        {/* Transaction Value (for payable functions) */}
        {isPayableFunction && showValueInput && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Input
              label="Transaction Value (ETH)"
              value={transactionValue}
              onChange={(e) => setTransactionValue(e.target.value)}
              placeholder="0"
              hint="Amount of ETH to send with transaction"
            />
          </div>
        )}

        {/* Gas Estimation */}
        {!isReadFunction && showGasEstimation && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Card title="Gas Estimation" variant="glass" padding="sm">
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={estimateGas}
                  loading={isEstimatingGas}
                  disabled={!selectedFunction}
                  icon={<Zap size={16} />}
                >
                  Estimate Gas
                </Button>
                
                <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <input
                    type="checkbox"
                    checked={useCustomGas}
                    onChange={(e) => setUseCustomGas(e.target.checked)}
                  />
                  <span style={{ fontSize: 'var(--text-sm)' }}>Custom Gas</span>
                </label>
              </div>

              {gasEstimation && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 'var(--space-2)' }}>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Gas Limit</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                      {gasEstimation.gasLimit}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Gas Price (Gwei)</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                      {gasEstimation.gasPrice}
                    </div>
                  </div>
                  <div>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Est. Cost (ETH)</span>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}>
                      {gasEstimation.estimatedCost}
                    </div>
                  </div>
                </div>
              )}

              {gasEstimation?.error && (
                <ErrorDisplay error={gasEstimation.error} variant="inline" />
              )}

              {useCustomGas && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
                  <Input
                    label="Gas Limit"
                    value={customGasLimit}
                    onChange={(e) => setCustomGasLimit(e.target.value)}
                    placeholder="Auto"
                  />
                  <Input
                    label="Gas Price (Gwei)"
                    value={customGasPrice}
                    onChange={(e) => setCustomGasPrice(e.target.value)}
                    placeholder="Auto"
                  />
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Execute Button */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <Button
            onClick={executeFunction}
            loading={isExecuting}
            disabled={!selectedFunction}
            variant={isReadFunction ? 'primary' : 'secondary'}
            icon={isReadFunction ? <Eye size={16} /> : <Play size={16} />}
            fullWidth
          >
            {isExecuting 
              ? (isReadFunction ? 'Reading...' : 'Sending Transaction...') 
              : (isReadFunction ? 'Read Function' : 'Execute Function')
            }
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <ErrorDisplay error={error} variant="banner" showRetry onRetry={() => setError(null)} />
        )}

        {/* Execution Result */}
        {executionResult && (
          <Card 
            title={`Execution Result (${executionResult.success ? 'Success' : 'Failed'})`}
            variant={executionResult.success ? 'accent' : 'default'}
            padding="md"
          >
            {executionResult.success ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {executionResult.result !== undefined && (
                  <div>
                    <strong>Return Value:</strong>
                    <pre style={{ 
                      fontSize: 'var(--text-sm)', 
                      fontFamily: 'var(--font-mono)',
                      background: 'var(--bg-secondary)',
                      padding: 'var(--space-2)',
                      borderRadius: 'var(--radius-md)',
                      marginTop: 'var(--space-1)',
                      overflow: 'auto'
                    }}>
                      {typeof executionResult.result === 'object' 
                        ? JSON.stringify(executionResult.result, null, 2)
                        : String(executionResult.result)
                      }
                    </pre>
                  </div>
                )}
                
                {executionResult.transactionHash && (
                  <div>
                    <strong>Transaction Hash:</strong>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                      {executionResult.transactionHash}
                    </div>
                  </div>
                )}
                
                {executionResult.gasUsed && (
                  <div>
                    <strong>Gas Used:</strong>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                      {executionResult.gasUsed}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ErrorDisplay error={executionResult.error || 'Unknown error'} variant="inline" />
            )}
          </Card>
        )}
      </Card>
    </div>
  );
};

export default FunctionCaller;