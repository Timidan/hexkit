import { useState, useCallback, useMemo } from 'react';
import type { ABIInput } from '../components/ContractInputComponent';

interface InputState {
  value: any;
  isValid: boolean;
}

interface UseContractInputsOptions {
  inputs: ABIInput[];
  onValuesChange?: (values: Record<string, any>, allValid: boolean) => void;
  onCalldataGenerated?: (calldata: string) => void;
  selectedFunction?: any; // ethers.utils.FunctionFragment
}

export function useContractInputs({ inputs, onValuesChange, onCalldataGenerated, selectedFunction }: UseContractInputsOptions) {
  const [inputStates, setInputStates] = useState<Record<string, InputState>>(() => {
    const initialStates: Record<string, InputState> = {};
    inputs.forEach(input => {
      initialStates[input.name] = {
        value: getDefaultValueForType(input.type),
        isValid: true
      };
    });
    return initialStates;
  });

  const handleInputChange = useCallback((inputName: string, value: any, isValid: boolean) => {
    console.log(`[useContractInputs] handleInputChange: ${inputName}`);
    console.log(`[useContractInputs] Received value:`, value, typeof value);
    console.log(`[useContractInputs] Value is array:`, Array.isArray(value));
    if (Array.isArray(value)) {
      console.log(`[useContractInputs] Array length:`, value.length);
      console.log(`[useContractInputs] Array contents:`, JSON.stringify(value));
    }
    console.log(`[useContractInputs] Is valid:`, isValid);
    
    setInputStates(prev => {
      const newStates = {
        ...prev,
        [inputName]: { value, isValid }
      };
      
      console.log(`[useContractInputs] New input states:`, newStates);
      
      // Extract current values and validity
      const currentValues: Record<string, any> = {};
      let allValid = true;
      
      Object.entries(newStates).forEach(([name, state]) => {
        currentValues[name] = state.value;
        if (!state.isValid) {
          allValid = false;
        }
      });
      
      console.log(`[useContractInputs] Current values:`, currentValues);
      console.log(`[useContractInputs] All valid:`, allValid);
      
      // Notify parent of changes
      if (onValuesChange) {
        onValuesChange(currentValues, allValid);
      }
      
      // Generate calldata if function is available
      if (onCalldataGenerated && selectedFunction && allValid) {
        try {
          // Import ethers dynamically to avoid issues
          import('ethers').then(({ ethers }) => {
            const formattedArgs = inputs.map(input => {
              const state = newStates[input.name];
              if (!state) return formatValueForContract(getDefaultValueForType(input.type), input.type);
              return formatValueForContract(state.value, input.type);
            });
            
            const iface = new ethers.utils.Interface([selectedFunction]);
            const calldata = iface.encodeFunctionData(selectedFunction.name, formattedArgs);
            onCalldataGenerated(calldata);
          }).catch(error => {
            console.error('Failed to generate calldata:', error);
            onCalldataGenerated("0x");
          });
        } catch (error) {
          console.error('Failed to generate calldata:', error);
          onCalldataGenerated("0x");
        }
      }
      
      return newStates;
    });
  }, [onValuesChange]);

  const getCurrentValues = useCallback((): Record<string, any> => {
    const values: Record<string, any> = {};
    Object.entries(inputStates).forEach(([name, state]) => {
      values[name] = state.value;
    });
    return values;
  }, [inputStates]);

  const getFormattedArgs = useCallback((): any[] => {
    console.log(`[useContractInputs] getFormattedArgs called`);
    console.log(`[useContractInputs] Input states:`, inputStates);
    console.log(`[useContractInputs] Input state keys:`, Object.keys(inputStates));
    
    const formattedArgs = inputs.map(input => {
      const state = inputStates[input.name];
      console.log(`[useContractInputs] Processing ${input.name} (${input.type})`);
      console.log(`[useContractInputs] State:`, state);
      console.log(`[useContractInputs] State value type:`, typeof state?.value);
      console.log(`[useContractInputs] State value is array:`, Array.isArray(state?.value));
      
      if (!state) {
        const defaultValue = getDefaultValueForType(input.type);
        console.log(`[useContractInputs] No state, using default:`, defaultValue);
        return defaultValue;
      }
      
      const formatted = formatValueForContract(state.value, input.type);
      console.log(`[useContractInputs] Formatted value:`, formatted, typeof formatted);
      return formatted;
    });
    
    console.log(`[useContractInputs] Final formatted args:`, formattedArgs);
    return formattedArgs;
  }, [inputs, inputStates]);

  const isAllValid = useMemo((): boolean => {
    return Object.values(inputStates).every(state => state.isValid);
  }, [inputStates]);

  const resetInputs = useCallback(() => {
    const resetStates: Record<string, InputState> = {};
    inputs.forEach(input => {
      resetStates[input.name] = {
        value: getDefaultValueForType(input.type),
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

  return {
    inputStates,
    handleInputChange,
    getCurrentValues,
    getFormattedArgs,
    isAllValid,
    resetInputs,
    setInputValues
  };
}

function getDefaultValueForType(type: string): any {
  if (type.endsWith('[]')) {
    return [];
  } else if (type === 'tuple') {
    return {};
  } else if (type.includes('uint') || type.includes('int')) {
    return '';
  } else if (type === 'bool') {
    return '';
  } else if (type === 'address') {
    return '';
  } else {
    return '';
  }
}

function formatValueForContract(value: any, type: string): any {
  console.log(`[formatValueForContract] Processing: ${type}, value:`, value, typeof value);
  
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
    console.log(` [formatValueForContract] Array processing: isArray=${Array.isArray(value)}`);
    console.log(` [formatValueForContract] CRITICAL: Original array value:`, JSON.stringify(value));
    if (!Array.isArray(value)) {
      console.log(` [formatValueForContract] CRITICAL: Value is not array, returning empty array`);
      return [];
    }
    const baseType = type.replace('[]', '');
    console.log(` [formatValueForContract] CRITICAL: Base type:`, baseType);
    const result = value.map(item => formatValueForContract(item, baseType));
    console.log(` [formatValueForContract] CRITICAL: Final array result:`, JSON.stringify(result));
    return result;
  } else if (type.includes('uint') || type.includes('int')) {
    const num = typeof value === 'number' ? value : parseInt(value.toString(), 10);
    console.log(` [formatValueForContract] Integer conversion: ${value} -> ${num}`);
    return isNaN(num) ? 0 : num;
  } else if (type === 'bool') {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === true;
  } else if (type === 'tuple') {
    return value || {};
  } else {
    return value?.toString() || '';
  }
}
