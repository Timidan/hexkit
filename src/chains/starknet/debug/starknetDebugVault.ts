import type { StarknetDebugTrace } from "./starknetDebugTypes";

const DEBUG_TRACE_DIR = "starknet-debug-vault";
const DEBUG_TRACE_VERSION = 1;

const supportsOpfs = () =>
  typeof navigator !== "undefined" &&
  !!navigator.storage?.getDirectory;

const supportsCompression = () =>
  typeof CompressionStream !== "undefined" &&
  typeof DecompressionStream !== "undefined";

const jsonToUint8 = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value));

const uint8ToJson = (value: ArrayBuffer) =>
  JSON.parse(new TextDecoder().decode(value));

const isNotFoundError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "name" in error &&
  (error as { name?: unknown }).name === "NotFoundError";

const gzip = async (value: Uint8Array) => {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
};

const ungzip = async (value: ArrayBuffer) => {
  const stream = new Blob([value]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
};

const getDebugDirectory = async (simulationId: string) => {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(DEBUG_TRACE_DIR, { create: true });
  return await base.getDirectoryHandle(simulationId, { create: true });
};

const writeJsonFile = async (
  dir: FileSystemDirectoryHandle,
  baseName: string,
  data: unknown,
) => {
  const useGzip = supportsCompression();
  const fileName = useGzip ? `${baseName}.json.gz` : `${baseName}.json`;
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  try {
    const raw = jsonToUint8(data);
    await writable.write(useGzip ? await gzip(raw) : raw);
  } finally {
    await writable.close();
  }
};

const readJsonFile = async (
  dir: FileSystemDirectoryHandle,
  baseName: string,
) => {
  const useGzip = supportsCompression();
  const candidates = useGzip
    ? [`${baseName}.json.gz`, `${baseName}.json`]
    : [`${baseName}.json`, `${baseName}.json.gz`];

  for (const fileName of candidates) {
    try {
      const handle = await dir.getFileHandle(fileName, { create: false });
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      if (fileName.endsWith(".gz")) {
        if (!supportsCompression()) return null;
        return uint8ToJson(await ungzip(buffer));
      }
      return uint8ToJson(buffer);
    } catch (error: unknown) {
      if (isNotFoundError(error)) continue;
      throw error;
    }
  }
  return null;
};

export interface StarknetDebugTraceHandle {
  kind: "opfs";
  simulationId: string;
  version: number;
}

export interface StarknetDebugTraceMeta {
  version: number;
  source: string;
  stepCount: number;
  frameCount: number;
  initialStepIndex: number;
  failureStepIndex?: number | null;
  warnings: string[];
}

export function summarizeStarknetDebugTrace(
  trace: StarknetDebugTrace,
): StarknetDebugTraceMeta {
  return {
    version: trace.version,
    source: trace.source,
    stepCount: trace.steps?.length ?? 0,
    frameCount: trace.frames?.length ?? 0,
    initialStepIndex: trace.initialStepIndex ?? 0,
    failureStepIndex: trace.failureStepIndex ?? null,
    warnings: trace.warnings ?? [],
  };
}

class StarknetDebugVault {
  isSupported() {
    return supportsOpfs();
  }

  async saveDebugTrace(
    simulationId: string,
    trace: StarknetDebugTrace,
  ): Promise<{ handle: StarknetDebugTraceHandle; meta: StarknetDebugTraceMeta } | null> {
    if (!supportsOpfs()) return null;
    const dir = await getDebugDirectory(simulationId);
    const bundle = {
      version: DEBUG_TRACE_VERSION,
      simulationId,
      createdAt: Date.now(),
      trace,
    };
    await writeJsonFile(dir, "debug-trace", bundle);
    return {
      handle: { kind: "opfs", simulationId, version: DEBUG_TRACE_VERSION },
      meta: summarizeStarknetDebugTrace(trace),
    };
  }

  async loadDebugTrace(simulationId: string): Promise<StarknetDebugTrace | null> {
    if (!supportsOpfs()) return null;
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await getDebugDirectory(simulationId);
    } catch (error: unknown) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
    const bundle = await readJsonFile(dir, "debug-trace");
    return (bundle as { trace?: StarknetDebugTrace } | null)?.trace ?? null;
  }
}

export const starknetDebugVault = new StarknetDebugVault();
export default starknetDebugVault;
