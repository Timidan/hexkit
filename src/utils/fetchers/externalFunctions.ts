import type { ContractInfoResult } from '../../types/contractInfo';

export const extractExternalFunctions = (
  abi: any[]
): ContractInfoResult['externalFunctions'] => {
  if (!abi || !Array.isArray(abi)) return [];

  return abi
    .filter(
      (item) =>
        item.type === 'function' &&
        (item.stateMutability === 'view' ||
          item.stateMutability === 'pure' ||
          item.stateMutability === 'nonpayable' ||
          item.stateMutability === 'payable')
    )
    .map((func) => ({
      name: func.name,
      signature: `${func.name}(${func.inputs
        ?.map((input: any) => input.type)
        .join(',') || ''})`,
      inputs:
        func.inputs?.map((input: any) => ({
          name: input.name || '',
          type: input.type,
        })) || [],
      outputs:
        func.outputs?.map((output: any) => ({
          name: output.name || '',
          type: output.type,
        })) || [],
      stateMutability: func.stateMutability,
    }));
};
