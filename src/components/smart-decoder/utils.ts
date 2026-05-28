import { ethers } from 'ethers';
import {
  getCachedSignatures,
  getCustomSignatures,
} from '../../utils/signatureDatabase';
import { shortenAddress } from '../shared/AddressDisplay';

export { shortenAddress };

export const getAbiCacheKey = (address: string, chainId?: string) => {
  return `${address.toLowerCase()}|${chainId ?? 'multi'}`;
};

export const isAbortError = (error: unknown) => {
  return (error as { name?: string })?.name === 'AbortError';
};

export const sanitizeDecodedValue = (value: any): any => {
  if (Array.isArray(value)) {
    return Array.from(value, sanitizeDecodedValue);
  }

  if (value && typeof value === 'object') {
    if (ethers.BigNumber.isBigNumber(value)) {
      return value.toString();
    }

    if (value instanceof Uint8Array) {
      return ethers.utils.hexlify(value);
    }
  }

  return value;
};

export const getParameterType = (value: any): string => {
  if (value === null || value === undefined) return 'unknown';

  const str = String(value);

  if (str.match(/^0x[a-fA-F0-9]{40}$/)) {
    return 'address';
  }

  if (str.match(/^\d+$/) && str.length > 10) {
    return 'uint256';
  }

  if (str.match(/^\d+$/) && str.length <= 10) {
    return 'uint32';
  }

  if (str.startsWith('0x') && str.length > 2) {
    const hexLength = str.length - 2;
    if (hexLength % 2 === 0) {
      const byteLength = hexLength / 2;
      if (byteLength <= 32) {
        return `bytes${byteLength}`;
      }
      return 'bytes';
    }
  }

  if (str === 'true' || str === 'false') {
    return 'bool';
  }

  if (Array.isArray(value)) {
    const hasStructuredChildren = value.some(
      (item) =>
        Array.isArray(item) ||
        (item &&
          typeof item === 'object' &&
          !ethers.BigNumber.isBigNumber(item) &&
          !(item instanceof Uint8Array))
    );
    if (hasStructuredChildren) {
      return 'tuple[]';
    }
    return 'array';
  }

  return 'string';
};

export const extractFunctionSelector = (calldataHex: string): string | null => {
  try {
    if (!calldataHex.startsWith('0x')) {
      calldataHex = '0x' + calldataHex;
    }
    if (calldataHex.length < 10) {
      throw new Error('Calldata too short');
    }
    return calldataHex.slice(0, 10);
  } catch {
    return null;
  }
};

export const suggestFunctionSignature = (targetSelector: string): string => {
  const commonSignatures = [
    'transfer(address,uint256)',
    'approve(address,uint256)',
    'transferFrom(address,address,uint256)',
    'mint(address,uint256)',
    'burn(uint256)',
    'deposit()',
    'withdraw(uint256)',
    'execute(bytes)',
    'multicall(bytes[])',
    'diamondCut((address,uint8,bytes4[])[],address,bytes)',
  ];

  for (const sig of commonSignatures) {
    const hash = ethers.utils.id(sig);
    const selector = hash.slice(0, 10);
    if (selector.toLowerCase() === targetSelector.toLowerCase()) {
      return sig;
    }
  }

  return `Unknown function - selector ${targetSelector}`;
};

export const searchCustomSignatures = (selector: string): string | null => {
  const cachedFunctions = getCachedSignatures('function');
  if (cachedFunctions[selector]) {
    return cachedFunctions[selector].name;
  }

  const customSignatures = getCustomSignatures();
  for (const customSig of customSignatures) {
    try {
      const hash = ethers.utils.id(customSig.signature);
      const computedSelector = hash.slice(0, 10);
      if (computedSelector.toLowerCase() === selector.toLowerCase()) {
        return customSig.signature;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      continue;
    }
  }

  return null;
};

export const expandTupleType = (input: any): string => {
  if (input.type === 'tuple' && input.components) {
    const componentTypes = input.components.map((comp: any) => expandTupleType(comp));
    return `(${componentTypes.join(',')})`;
  } else if (input.type === 'tuple[]' && input.components) {
    const componentTypes = input.components.map((comp: any) => expandTupleType(comp));
    return `(${componentTypes.join(',')})[]`;
  } else {
    return input.type;
  }
};

export const findMatchingFunctionInABI = (abi: any[], selector: string): any => {
  for (const item of abi) {
    if (item.type === 'function' && item.name) {
      try {
        if (item.stateMutability && !['pure', 'view', 'nonpayable', 'payable'].includes(item.stateMutability)) {
          continue;
        }

        const inputs = item.inputs?.map((input: any) => expandTupleType(input)).join(',') || '';
        const signature = `${item.name}(${inputs})`;
        const hash = ethers.utils.id(signature);
        const computedSelector = hash.slice(0, 10);

        if (computedSelector.toLowerCase() === selector.toLowerCase()) {
          return { ...item, signature };
        }
      } catch {
        continue;
      }
    }
  }

  return null;
};

export const formatProxyType = (proxyType?: string): string => {
  const types: Record<string, string> = {
    'eip1967': 'EIP-1967 Transparent Proxy',
    'transparent': 'Transparent Proxy',
    'eip1967-beacon': 'Beacon Proxy',
    'eip1167': 'EIP-1167 Minimal Proxy',
    'eip1822': 'UUPS Proxy',
    'gnosis-safe': 'Gnosis Safe Proxy',
    'diamond': 'Diamond Proxy'
  };
  return types[proxyType || ''] || 'Proxy Contract';
};

export const normalizeCalldataHex = (calldataHex: string, addStep: (step: string) => void): string => {
  const trimmed = calldataHex.trim();

  if (!trimmed) {
    throw new Error('Calldata is empty.');
  }

  const withoutWhitespace = trimmed
    .replace(/\s+/g, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');

  if (!withoutWhitespace) {
    throw new Error('Calldata is empty.');
  }

  let prefixed = withoutWhitespace;
  if (!(prefixed.startsWith('0x') || prefixed.startsWith('0X'))) {
    addStep('Added missing 0x prefix to calldata input.');
    prefixed = `0x${prefixed}`;
  }

  const rawHexBody = prefixed.slice(2);
  let sanitizedHexBody = '';
  let removedInvalid = 0;

  for (const char of rawHexBody) {
    if (/^[0-9a-fA-F]$/.test(char)) {
      sanitizedHexBody += char;
    } else {
      removedInvalid++;
    }
  }

  if (!sanitizedHexBody) {
    throw new Error('Calldata must contain hexadecimal characters (0-9, a-f).');
  }

  if (removedInvalid > 0) {
    addStep(`Removed ${removedInvalid} non-hex character${removedInvalid === 1 ? '' : 's'} from calldata input.`);
  }

  if (sanitizedHexBody.length % 2 !== 0) {
    const selectorPart = sanitizedHexBody.slice(0, 8);
    let parameterPart = sanitizedHexBody.slice(8);

    if (!parameterPart) {
      sanitizedHexBody = sanitizedHexBody + '0';
    } else {
      parameterPart = `${parameterPart}0`;
      sanitizedHexBody = selectorPart + parameterPart;
    }

    addStep('Calldata length was odd; appended a 0 nibble to parameter data to restore 32-byte alignment.');
  }

  return `0x${sanitizedHexBody}`;
};

export const decodeWithSignature = (calldataHex: string, signature: string, addStep: (step: string) => void): any => {
  try {
    const abi = [`function ${signature}`];
    const iface = new ethers.utils.Interface(abi);
    const normalizedCalldata = normalizeCalldataHex(calldataHex, addStep);
    return iface.parseTransaction({ data: normalizedCalldata });
  } catch (error: any) {
    const reason = typeof error?.reason === 'string' ? error.reason : undefined;
    const message = typeof error?.message === 'string' ? error.message : undefined;

    if (reason && reason.includes('hex data is odd-length')) {
      throw new Error('Calldata hex must contain an even number of characters after the 0x prefix.');
    }

    if (message && message.includes('hex data is odd-length')) {
      throw new Error('Calldata hex must contain an even number of characters after the 0x prefix.');
    }

    throw new Error(`Failed to decode with signature ${signature}: ${message ?? error}`);
  }
};
