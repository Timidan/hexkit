import type { DecodedTraceRow } from "../utils/traceDecoder";

export type TraceVaultHeavyRow = {
  id: number;
  stack?: string[];
  memory?: number[];
};

export type TraceVaultDecodedTrace = {
  rows: DecodedTraceRow[];
  sourceLines: string[];
  sourceTexts: Record<string, string>;
  callMeta?: any;
  rawEvents?: any[];
  implementationToProxy?: Map<string, string>;
};

type TraceVaultLiteBundle = {
  version: number;
  simulationId: string;
  createdAt: number;
  rows: DecodedTraceRow[];
};

type TraceVaultHeavyBundle = {
  version: number;
  simulationId: string;
  rows: TraceVaultHeavyRow[];
};

type TraceVaultMetaBundle = {
  version: number;
  simulationId: string;
  sourceLines: string[];
  sourceTexts: Record<string, string>;
  callMeta?: any;
  rawEvents?: any[];
  implementationToProxy?: Array<[string, string]>;
};

const TRACE_DIR = "trace-vault";
const TRACE_VERSION = 1;

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

const gzip = async (value: Uint8Array) => {
  const stream = new Blob([value]).stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
};

const ungzip = async (value: ArrayBuffer) => {
  const stream = new Blob([value]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).arrayBuffer();
};

const getTraceDirectory = async (simulationId: string) => {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(TRACE_DIR, { create: true });
  return await base.getDirectoryHandle(simulationId, { create: true });
};

const writeJsonFile = async (
  dir: FileSystemDirectoryHandle,
  baseName: string,
  data: unknown
) => {
  const useGzip = supportsCompression();
  const fileName = useGzip ? `${baseName}.json.gz` : `${baseName}.json`;
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  try {
    const raw = jsonToUint8(data);
    if (useGzip) {
      const compressed = await gzip(raw);
      await writable.write(compressed);
    } else {
      await writable.write(raw);
    }
  } finally {
    await writable.close();
  }
};

const readJsonFile = async (dir: FileSystemDirectoryHandle, baseName: string) => {
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
        if (!supportsCompression()) {
          return null;
        }
        const inflated = await ungzip(buffer);
        return uint8ToJson(inflated);
      }
      return uint8ToJson(buffer);
    } catch (error: any) {
      if (error?.name === "NotFoundError") {
        continue;
      }
      throw error;
    }
  }

  return null;
};

export const splitDecodedTraceRows = (rows: DecodedTraceRow[]) => {
  const heavyRows: TraceVaultHeavyRow[] = [];
  const liteRows = rows.map((row) => {
    const stack = Array.isArray(row.stack) ? row.stack : undefined;
    const memory = Array.isArray(row.memory) ? row.memory : undefined;
    const stackDepth =
      stack?.length ??
      (row as any).stackDepth ??
      undefined;
    const stackTop =
      stack && stack.length > 0
        ? stack[stack.length - 1]
        : (row as any).stackTop ?? undefined;

    if (stack || memory) {
      heavyRows.push({ id: row.id, stack, memory });
    }

    const { stack: _stack, memory: _memory, ...rest } = row as any;
    return {
      ...rest,
      stackDepth,
      stackTop,
    } as DecodedTraceRow;
  });

  return { liteRows, heavyRows };
};

export const createLiteDecodedTrace = (decoded: TraceVaultDecodedTrace) => {
  const { liteRows } = splitDecodedTraceRows(decoded.rows);
  return {
    ...decoded,
    rows: liteRows,
  } as TraceVaultDecodedTrace;
};

const mergeHeavyRows = (
  liteRows: DecodedTraceRow[],
  heavyRows: TraceVaultHeavyRow[]
) => {
  const heavyById = new Map<number, TraceVaultHeavyRow>();
  heavyRows.forEach((row) => heavyById.set(row.id, row));
  return liteRows.map((row) => {
    const heavy = heavyById.get(row.id);
    if (!heavy) return row;
    return {
      ...row,
      stack: heavy.stack,
      memory: heavy.memory,
    } as DecodedTraceRow;
  });
};

/**
 * Recompute hasChildren and childEndId from depth relationships.
 * This fixes traces loaded from history where hasChildren wasn't computed
 * correctly for nested call frames.
 *
 * A row has children if any following row (before returning to same/lower depth)
 * has a higher depth than the current row.
 */
export const recomputeHierarchy = (rows: DecodedTraceRow[]): DecodedTraceRow[] => {
  if (!rows || rows.length === 0) return rows;

  // Work on a copy to avoid mutating the original
  const result = rows.map((row) => ({ ...row }));
  const n = result.length;
  const depths = result.map((r) => {
    // Normalize to a finite number: a non-finite depth (NaN) would behave
    // differently between the old forward-scan and the new stack pass.
    const d = r.visualDepth ?? (r as any).depth ?? 0;
    return Number.isFinite(d) ? d : 0;
  });

  // Single O(n) monotonic-stack pass replacing the old O(n^2) per-row look-ahead.
  // boundary[i] = the first index j > i whose depth is <= depths[i] (or n).
  // The old loop included rows i+1..boundary[i]-1 (the contiguous deeper run) and
  // set childEndId to the last one — identical output, no quadratic scan.
  const boundary = new Array<number>(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    while (stack.length > 0 && depths[stack[stack.length - 1]] >= depths[i]) {
      boundary[stack.pop() as number] = i;
    }
    stack.push(i);
  }
  while (stack.length > 0) boundary[stack.pop() as number] = n;

  for (let i = 0; i < n; i++) {
    const row = result[i];
    const hasChildren = boundary[i] > i + 1; // a deeper run exists at i+1..boundary[i]-1
    if (hasChildren) {
      row.hasChildren = true;
      (row as any).childEndId = result[boundary[i] - 1].id;
      (row as any).isLeafCall = false;
    } else if (row.hasChildren === undefined) {
      // Only set to false if not already set
      row.hasChildren = false;
      (row as any).isLeafCall = true;
    }
  }

  return result;
};

class TraceVaultService {
  isSupported() {
    return supportsOpfs();
  }

  async saveDecodedTrace(simulationId: string, decoded: TraceVaultDecodedTrace) {
    if (!supportsOpfs()) {
      console.warn("[TraceVault] OPFS not supported; skipping trace persistence.");
      return { lite: createLiteDecodedTrace(decoded) };
    }

    const dir = await getTraceDirectory(simulationId);
    const { liteRows, heavyRows } = splitDecodedTraceRows(decoded.rows);
    const liteBundle: TraceVaultLiteBundle = {
      version: TRACE_VERSION,
      simulationId,
      createdAt: Date.now(),
      rows: liteRows,
    };
    const heavyBundle: TraceVaultHeavyBundle = {
      version: TRACE_VERSION,
      simulationId,
      rows: heavyRows,
    };
    const metaBundle: TraceVaultMetaBundle = {
      version: TRACE_VERSION,
      simulationId,
      sourceLines: decoded.sourceLines || [],
      sourceTexts: decoded.sourceTexts || {},
      callMeta: decoded.callMeta,
      rawEvents: decoded.rawEvents || [],
      implementationToProxy: decoded.implementationToProxy
        ? Array.from(decoded.implementationToProxy.entries())
        : [],
    };

    await writeJsonFile(dir, "lite", liteBundle);
    await writeJsonFile(dir, "heavy", heavyBundle);
    await writeJsonFile(dir, "meta", metaBundle);

    return { lite: { ...decoded, rows: liteRows } as TraceVaultDecodedTrace };
  }

  async loadDecodedTrace(
    simulationId: string,
    options?: { includeHeavy?: boolean }
  ): Promise<TraceVaultDecodedTrace | null> {
    if (!supportsOpfs()) {
      return null;
    }

    let dir: FileSystemDirectoryHandle;
    try {
      dir = await getTraceDirectory(simulationId);
    } catch (error: any) {
      if (error?.name === "NotFoundError") return null;
      throw error;
    }

    const liteBundle = (await readJsonFile(dir, "lite")) as TraceVaultLiteBundle | null;
    if (!liteBundle?.rows) {
      return null;
    }

    const metaBundle = (await readJsonFile(dir, "meta")) as TraceVaultMetaBundle | null;
    let rows = liteBundle.rows;

    if (options?.includeHeavy) {
      const heavyBundle = (await readJsonFile(dir, "heavy")) as TraceVaultHeavyBundle | null;
      if (heavyBundle?.rows) {
        rows = mergeHeavyRows(rows, heavyBundle.rows);
      }
    }

    const implementationToProxy = new Map<string, string>(
      metaBundle?.implementationToProxy ?? []
    );

    // Recompute hierarchy from depth relationships to fix traces where
    // hasChildren wasn't computed correctly for nested call frames
    const fixedRows = recomputeHierarchy(rows);

    return {
      rows: fixedRows,
      sourceLines: metaBundle?.sourceLines ?? [],
      sourceTexts: metaBundle?.sourceTexts ?? {},
      callMeta: metaBundle?.callMeta,
      rawEvents: metaBundle?.rawEvents ?? [],
      implementationToProxy,
    };
  }

  async deleteDecodedTrace(simulationId: string): Promise<void> {
    if (!supportsOpfs()) {
      return;
    }

    const root = await navigator.storage.getDirectory();
    let base: FileSystemDirectoryHandle;
    try {
      base = await root.getDirectoryHandle(TRACE_DIR, { create: false });
    } catch (error: any) {
      if (error?.name === "NotFoundError") return;
      throw error;
    }

    try {
      await base.removeEntry(simulationId, { recursive: true });
    } catch (error: any) {
      if (error?.name === "NotFoundError") return;
      throw error;
    }
  }
}

export const traceVaultService = new TraceVaultService();
export default traceVaultService;
