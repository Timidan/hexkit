import { ethers } from 'ethers';
import type { RevertDetails } from './types';
import { PANIC_CODE_MESSAGES } from './types';

export const ensureHexPrefix = (value: string) => {
  if (!value) {
    return '0x';
  }
  return value.startsWith('0x') || value.startsWith('0X')
    ? value
    : `0x${value}`;
};

export function parseReasonFromString(input?: string | null): string | null {
  if (!input) {
    return null;
  }

  const cleaned = `${input}`.replace(/\0/g, '').trim();
  if (!cleaned) {
    return null;
  }

  const patterns = [
    /execution reverted(?::|\s)+(.*)$/i,
    /reverted with reason string\s*"(.*)"/i,
    /revert(?:ed)?(?::|\s)+(.*)$/i,
    /VM Exception while processing transaction:\s*(?:revert|panic)\s*(.*)$/i,
    /reason[:=]\s*"?([^"]+)"?/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].replace(/(^[:\s"]+)|([:"\s]+$)/g, '').trim();
      if (candidate) {
        return candidate;
      }
    }
  }

  if (/execution reverted/i.test(cleaned)) {
    return 'Execution reverted';
  }

  if (/transfer amount exceeds balance/i.test(cleaned)) {
    return 'Transfer amount exceeds balance';
  }

  if (/insufficient allowance/i.test(cleaned)) {
    return 'Insufficient allowance';
  }

  if (/insufficient funds/i.test(cleaned)) {
    return 'Insufficient funds';
  }

  return null;
}

export function normalizeErrorArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (ethers.BigNumber.isBigNumber(arg)) {
      return arg.toString();
    }
    if (typeof arg === 'bigint') {
      return arg.toString();
    }
    return arg;
  });
}

const HEX_DATA_REGEX = /0x[0-9a-fA-F]{8,}/;

export function findRevertDataInError(error: any): string | null {
  if (!error) {
    return null;
  }

  const visited = new Set<any>();
  const stack: any[] = [error];
  let iterations = 0;

  while (stack.length && iterations < 200) {
    iterations += 1;
    const current = stack.pop();
    if (current === null || current === undefined) {
      continue;
    }

    if (typeof current === 'string') {
      const match = current.match(HEX_DATA_REGEX);
      if (match && match[0]) {
        return ensureHexPrefix(match[0]);
      }
      continue;
    }

    if (typeof current !== 'object') {
      continue;
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (key === 'config' || key === 'request') {
        continue;
      }

      if (typeof value === 'string') {
        const trimmed = value.trim();
        const match = trimmed.match(HEX_DATA_REGEX);
        if (match && match[0]) {
          return ensureHexPrefix(match[0]);
        }

        if (
          (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
          trimmed.length <= 10_000
        ) {
          try {
            const parsed = JSON.parse(trimmed);
            stack.push(parsed);
          } catch {
            // ignore JSON parse errors
          }
        }
      } else if (typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return null;
}

export function decodeRevertData(hexData: string): {
  message: string | null;
  signature: string | null;
} {
  if (!hexData) {
    return { message: null, signature: null };
  }

  const normalized = ensureHexPrefix(hexData);
  if (normalized.length < 10) {
    return { message: null, signature: null };
  }

  if (normalized.startsWith('0x08c379a0')) {
    const encodedReason = `0x${normalized.slice(10)}`;
    try {
      const [reason] = ethers.utils.defaultAbiCoder.decode(
        ['string'],
        encodedReason
      );
      return {
        message: typeof reason === 'string' ? reason : null,
        signature: 'Error(string)',
      };
    } catch {
      // Failed to decode revert reason string
    }
  }

  if (normalized.startsWith('0x4e487b71')) {
    const codeHex = normalized.slice(10).padStart(64, '0').slice(0, 64);
    const code = parseInt(codeHex, 16);
    const description = PANIC_CODE_MESSAGES[code];
    const message = description
      ? `Panic (0x${code.toString(16)}): ${description}`
      : `Panic code 0x${code.toString(16)}`;
    return { message, signature: 'Panic(uint256)' };
  }

  return { message: null, signature: null };
}

export function extractRevertDetails(error: any): RevertDetails {
  const encodedData = findRevertDataInError(error);
  const decoded = encodedData ? decodeRevertData(encodedData) : null;

  const errorName =
    typeof error?.errorName === 'string' ? error.errorName : null;
  const errorSignature =
    typeof error?.errorSignature === 'string'
      ? error.errorSignature
      : decoded?.signature ?? null;

  const rawArgs =
    Array.isArray(error?.errorArgs)
      ? error.errorArgs
      : Array.isArray(error?.args)
      ? error.args
      : null;
  const errorArgs = rawArgs ? normalizeErrorArgs(rawArgs) : null;

  const messageCandidates = [
    decoded?.message,
    parseReasonFromString(
      typeof error === 'string' ? (error as string) : undefined
    ),
    parseReasonFromString(error?.reason),
    parseReasonFromString(error?.shortMessage),
    parseReasonFromString(error?.message),
    parseReasonFromString(error?.error?.message),
    parseReasonFromString(error?.error?.reason),
    parseReasonFromString(error?.data?.message),
    parseReasonFromString(error?.data?.reason),
    parseReasonFromString(
      typeof error?.body === 'string' ? error.body : undefined
    ),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let message = messageCandidates.length > 0 ? messageCandidates[0] : null;

  if (!message && errorName) {
    const formattedArgs = errorArgs
      ? errorArgs.map((arg) => `${arg}`).join(', ')
      : '';
    message = formattedArgs
      ? `${errorName}(${formattedArgs})`
      : `${errorName}()`;
  }

  if (!message && errorSignature) {
    message = `Reverted with ${errorSignature}`;
  }

  if (!message && encodedData) {
    message = `Reverted with data ${encodedData}`;
  }

  return {
    message,
    encodedData,
    errorSignature,
    errorName,
    errorArgs,
  };
}

export function buildFailureRawTrace(
  details: RevertDetails,
  fallbackMessage?: string
): Record<string, unknown> | null {
  const trace: Record<string, unknown> = {};

  if (fallbackMessage) {
    trace.errorMessage = fallbackMessage;
  }

  if (details.message && details.message !== fallbackMessage) {
    trace.decodedReason = details.message;
  }

  if (details.encodedData) {
    trace.revertData = details.encodedData;
  }

  if (details.errorSignature) {
    trace.errorSignature = details.errorSignature;
  }

  if (details.errorName) {
    trace.errorName = details.errorName;
  }

  if (details.errorArgs && details.errorArgs.length > 0) {
    trace.errorArgs = details.errorArgs;
  }

  return Object.keys(trace).length > 0 ? trace : null;
}
