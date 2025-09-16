import { useState } from 'react';
import { useAccount, useWalletClient, usePublicClient } from 'wagmi';
import { ethers } from 'ethers';
import { parseErrorMessage } from '../utils/errorParser';

export interface ExecutionResult {
  success: boolean;
  data?: any;
  hash?: string;
  error?: string;
  gasUsed?: string;
}

export interface FunctionExecutionParams {
  contractAddress: string;
  abi: any[];
  functionName: string;
  args: any[];
  value?: string; // ETH value in wei
  gasLimit?: string;
  gasPrice?: string;
}

export const useFunctionExecution = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const executeReadFunction = async (params: FunctionExecutionParams): Promise<ExecutionResult> => {
    try {
      setIsExecuting(true);
      setExecutionResult(null);

      if (!publicClient) {
        throw new Error('Public client not available');
      }

      // Create ethers provider from wagmi public client
      const provider = new ethers.providers.JsonRpcProvider(publicClient.transport.url);
      const contract = new ethers.Contract(params.contractAddress, params.abi, provider);

      // Execute read function
      const result = await contract[params.functionName](...params.args);
      
      const executionResult: ExecutionResult = {
        success: true,
        data: result,
      };

      setExecutionResult(executionResult);
      return executionResult;

    } catch (error: any) {
      console.error('Read function execution failed:', error);
      const parsedError = parseErrorMessage(error);
      
      const executionResult: ExecutionResult = {
        success: false,
        error: parsedError,
      };

      setExecutionResult(executionResult);
      return executionResult;
    } finally {
      setIsExecuting(false);
    }
  };

  const executeWriteFunction = async (params: FunctionExecutionParams): Promise<ExecutionResult> => {
    try {
      setIsExecuting(true);
      setExecutionResult(null);

      if (!isConnected || !address) {
        throw new Error('Wallet not connected');
      }

      if (!walletClient || !publicClient) {
        throw new Error('Wallet client not available');
      }

      // Create ethers signer from wagmi wallet client
      const provider = new ethers.providers.JsonRpcProvider(publicClient.transport.url);
      
      // Use wagmi's wallet client with ethers
      const signer = provider.getSigner(address);
      const contract = new ethers.Contract(params.contractAddress, params.abi, signer);

      // Prepare transaction options
      const txOptions: any = {};
      if (params.value) {
        txOptions.value = ethers.BigNumber.from(params.value);
      }
      if (params.gasLimit) {
        txOptions.gasLimit = ethers.BigNumber.from(params.gasLimit);
      }
      if (params.gasPrice) {
        txOptions.gasPrice = ethers.BigNumber.from(params.gasPrice);
      }

      // Execute write function
      const tx = await contract[params.functionName](...params.args, txOptions);
      const receipt = await tx.wait();

      const executionResult: ExecutionResult = {
        success: true,
        hash: receipt.transactionHash,
        gasUsed: receipt.gasUsed.toString(),
      };

      setExecutionResult(executionResult);
      return executionResult;

    } catch (error: any) {
      console.error('Write function execution failed:', error);
      const parsedError = parseErrorMessage(error);
      
      const executionResult: ExecutionResult = {
        success: false,
        error: parsedError,
      };

      setExecutionResult(executionResult);
      return executionResult;
    } finally {
      setIsExecuting(false);
    }
  };

  const estimateGas = async (params: FunctionExecutionParams): Promise<string | null> => {
    try {
      if (!publicClient) return null;

      const provider = new ethers.providers.JsonRpcProvider(publicClient.transport.url);
      const contract = new ethers.Contract(params.contractAddress, params.abi, provider);

      const txOptions: any = {};
      if (params.value) {
        txOptions.value = ethers.BigNumber.from(params.value);
      }

      const estimatedGas = await contract.estimateGas[params.functionName](...params.args, txOptions);
      return estimatedGas.toString();
    } catch (error) {
      console.error('Gas estimation failed:', error);
      return null;
    }
  };

  return {
    isExecuting,
    executionResult,
    executeReadFunction,
    executeWriteFunction,
    estimateGas,
    clearResult: () => setExecutionResult(null),
  };
};