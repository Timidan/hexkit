import { decodeTrace } from "../utils/traceDecoder";

type DecodeRequest = {
  id: string;
  raw: unknown;
  rawText?: string;
};

type DecodeResponse = {
  id: string;
  decoded?: ReturnType<typeof decodeTrace>;
  error?: string;
};

const parseJson = (rawText: string) => {
  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("Failed to parse trace JSON");
  }
};

const normalizeRawTrace = (rawInput: unknown, fallbackRawText?: string) => {
  let raw: any = rawInput;
  let originalRawText: string | undefined;

  if (typeof raw === "string") {
    originalRawText = raw;
    raw = parseJson(raw);
  }

  if (raw && typeof raw === "object" && raw.rawTrace) {
    const inner = raw.rawTrace;
    if (typeof inner === "string") {
      originalRawText = inner;
      raw = parseJson(inner);
    } else {
      raw = inner;
    }
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid trace payload");
  }

  if (!originalRawText && typeof fallbackRawText === "string") {
    originalRawText = fallbackRawText;
  }

  const normalized = { ...raw };
  if (originalRawText) {
    normalized.__rawText = originalRawText;
  }
  return normalized;
};

// Web Worker global scope type
declare const self: Worker & typeof globalThis;
const ctx = self;

ctx.onmessage = (event: MessageEvent<DecodeRequest>) => {
  const { id, raw, rawText } = event.data;
  try {
    const normalized = normalizeRawTrace(raw, rawText);
    const decoded = decodeTrace(normalized);
    const response: DecodeResponse = { id, decoded };
    ctx.postMessage(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decode trace";
    const response: DecodeResponse = { id, error: message };
    ctx.postMessage(response);
  }
};
