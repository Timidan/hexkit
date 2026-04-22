import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { getDefaultValue } from '../components/ContractInputComponent';
import type { ABIInput } from '../components/ContractInputComponent';
import { useLiveRef } from './useLiveRef';

interface InputState {
  value: any;
  isValid: boolean;
}

interface UseContractInputsOptions {
  inputs: ABIInput[];
  onValuesChange?: (values: Record<string, any>, allValid: boolean) => void;
  onCalldataGenerated?: (calldata: string) => void;
  selectedFunction?: any; // ethers.utils.FunctionFragment
  initialValues?: Record<string, any>; // Initial values for restoration
}

export function useContractInputs({ inputs, onValuesChange, onCalldataGenerated, selectedFunction, initialValues }: UseContractInputsOptions) {
  // Track if we've applied initial values to prevent infinite loops
  const appliedInitialValuesRef = useRef<string | null>(null);
  // Bumped by forceReapply() to make the effect re-run even when the function
  // name hasn't changed (e.g. re-simulation of the same function).
  const [applyTrigger, setApplyTrigger] = useState(0);

  const [inputStates, setInputStates] = useState<Record<string, InputState>>(() => {
    const initialStates: Record<string, InputState> = {};
    inputs.forEach(input => {
      // Use initial value if provided, otherwise use default
      const initialValue = initialValues?.[input.name] ?? initialValues?.[`${selectedFunction?.name}_${inputs.indexOf(input)}`];
      initialStates[input.name] = {
        value: initialValue !== undefined ? initialValue : getDefaultValue(input.type),
        isValid: true
      };
    });
    return initialStates;
  });

  // Re-initialize when selected function changes (not when initialValues change to avoid loops)
  // Also re-runs when forceReapply() bumps applyTrigger.
  useEffect(() => {
    // Create a stable key for the current function to track if we need to re-apply
    const functionKey = selectedFunction?.name || '';

    // Only apply initial values if:
    // 1. We have a new function (different from what we last applied)
    // 2. We have initial values to apply
    if (functionKey && functionKey !== appliedInitialValuesRef.current && initialValues && Object.keys(initialValues).length > 0) {
      appliedInitialValuesRef.current = functionKey;

      setInputStates(() => {
        const newStates: Record<string, InputState> = {};
        inputs.forEach(input => {
          // Try direct name match or indexed name match
          const value = initialValues[input.name] ?? initialValues[`${selectedFunction?.name}_${inputs.indexOf(input)}`];
          newStates[input.name] = {
            value: value !== undefined ? value : getDefaultValue(input.type),
            isValid: true
          };
        });
        return newStates;
      });
    } else if (!functionKey) {
      // Reset tracking when no function is selected
      appliedInitialValuesRef.current = null;
    }
  }, [selectedFunction?.name, inputs, applyTrigger]);

  const onValuesChangeRef = useLiveRef(onValuesChange);
  const onCalldataGeneratedRef = useLiveRef(onCalldataGenerated);
  const inputsRef = useLiveRef(inputs);

  const iface = useMemo(
    () => (selectedFunction ? new ethers.utils.Interface([selectedFunction]) : null),
    [selectedFunction]
  );

  const handleInputChange = useCallback((inputName: string, value: any, isValid: boolean) => {
    setInputStates(prev => ({
      ...prev,
      [inputName]: { value, isValid }
    }));
  }, []);

  useEffect(() => {
    const currentValues: Record<string, any> = {};
    let allValid = true;
    for (const [name, state] of Object.entries(inputStates)) {
      currentValues[name] = state.value;
      if (!state.isValid) allValid = false;
    }

    onValuesChangeRef.current?.(currentValues, allValid);

    if (iface && selectedFunction && allValid && onCalldataGeneratedRef.current) {
      try {
        const formattedArgs = inputsRef.current.map(input => {
          const state = inputStates[input.name];
          if (!state) return formatValueForContract(getDefaultValue(input.type), input.type);
          return formatValueForContract(state.value, input.type);
        });
        const calldata = iface.encodeFunctionData(selectedFunction.name, formattedArgs);
        onCalldataGeneratedRef.current(calldata);
      } catch (error) {
        console.error('Failed to generate calldata:', error);
        onCalldataGeneratedRef.current('0x');
      }
    }
  }, [inputStates, iface, selectedFunction]);

  const getCurrentValues = useCallback((): Record<string, any> => {
    const values: Record<string, any> = {};
    Object.entries(inputStates).forEach(([name, state]) => {
      values[name] = state.value;
    });
    return values;
  }, [inputStates]);

  const getFormattedArgs = useCallback((): any[] => {
    const formattedArgs = inputs.map(input => {
      const state = inputStates[input.name];
      if (!state) {
        return getDefaultValue(input.type);
      }
      return formatValueForContract(state.value, input.type);
    });
    return formattedArgs;
  }, [inputs, inputStates]);

  const isAllValid = useMemo((): boolean => {
    return Object.values(inputStates).every(state => state.isValid);
  }, [inputStates]);

  const resetInputs = useCallback(() => {
    const resetStates: Record<string, InputState> = {};
    inputs.forEach(input => {
      resetStates[input.name] = {
        value: getDefaultValue(input.type),
        isValid: true
      };
    });
    setInputStates(resetStates);
  }, [inputs]);

  const setInputValues = useCallback((values: Record<string, any>) => {
    setInputStates(prev => {
      const newStates = { ...prev };

      Object.entries(values).forEach(([name, value]) => {
        if (newStates[name]) {
          newStates[name] = {
            ...newStates[name],
            value
          };
        }
      });

      return newStates;
    });
  }, []);

  /** Clear the dedup guard and bump the trigger so the apply-initial-values
   *  effect re-runs even when the function name hasn't changed (re-simulation). */
  const forceReapply = useCallback(() => {
    appliedInitialValuesRef.current = null;
    setApplyTrigger(t => t + 1);
  }, []);

  return {
    inputStates,
    handleInputChange,
    getCurrentValues,
    getFormattedArgs,
    isAllValid,
    resetInputs,
    setInputValues,
    forceReapply
  };
}

function formatValueForContract(value: any, type: string): any {
  if (value === null || value === undefined || value === '') {
    if (type.includes('uint') || type.includes('int')) {
      return 0;
    } else if (type === 'bool') {
      return false;
    } else if (type === 'address') {
      return '0x0000000000000000000000000000000000000000';
    } else {
      return '';
    }
  }
  
  if (type.endsWith('[]')) {
    if (!Array.isArray(value)) {
      return [];
    }
    const baseType = type.replace('[]', '');
    const result = value.map(item => formatValueForContract(item, baseType));
    return result;
  } else if (type.includes('uint') || type.includes('int')) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new Error(`Invalid integer for ${type}: ${value}`);
      }
      return value;
    }
    const str = value.toString().trim();
    if (!/^-?\d+$/.test(str)) {
      throw new Error(`Invalid integer for ${type}: "${str}"`);
    }
    return parseInt(str, 10);
  } else if (type === 'bool') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === true;
  } else if (type === 'tuple') {
    return value || {};
  } else {
    return value?.toString() || '';
  }
}
