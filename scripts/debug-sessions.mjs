// =============================================================================
// Debug Sessions — keep-alive session start, async prep infrastructure
// =============================================================================

import { redactRpcUrl } from "./bridge-security.mjs";

import {
  gatedRunSimulationWithKeepAlive,
} from "./keep-alive-manager.mjs";

function buildDebugAnalysisOptions(params) {
  const incoming =
    params.analysisOptions && typeof params.analysisOptions === "object"
      ? params.analysisOptions
      : {};

  return {
    ...incoming,
    quickMode: false,
    collectCallTree: true,
    collectEvents: true,
    collectStorageDiff: true,
    collectStorageDiffs: true,
    collectSnapshots: true,
  };
}

function getKeepAliveSessionError(result) {
  if (!result || typeof result !== "object") {
    return "Failed to create debug session — simulator returned no keep-alive session";
  }

  const error =
    typeof result.error === "string" && result.error.trim()
      ? result.error.trim()
      : null;
  if (error) {
    return `Failed to create debug session — ${error}`;
  }

  const warning = Array.isArray(result.warnings)
    ? result.warnings.find((entry) => typeof entry === "string" && entry.trim())
    : null;
  if (warning) {
    return `Failed to create debug session — ${warning}`;
  }

  switch (result.debugLevel) {
    case "call-trace":
      return "Failed to create debug session — live debugging is unavailable because the simulator fell back to lightweight call-trace mode";
    case "opcode-trace":
      return "Failed to create debug session — live debugging is unavailable because the simulator fell back to opcode-trace mode";
    case "eth-call-only":
      return "Failed to create debug session — live debugging is unavailable because the simulator fell back to eth_call-only mode";
    default:
      return "Failed to create debug session — simulator returned no keep-alive session";
  }
}

// =============================================================================
// Debug Session CRUD
// =============================================================================

/**
 * Start a debug session via simulator keep-alive mode.
 * @param {import('./bridge-config.mjs').SimulationSemaphore} simulationSemaphore
 * @param {Object} params
 */
export async function startDebugSession(simulationSemaphore, params) {
  const hasTxPayload = Boolean(params.transaction);
  const hasTxHash = Boolean(params.txHash);
  if (!hasTxPayload && !hasTxHash) {
    throw new Error("Missing required debug target: transaction or txHash");
  }

  const payload = {
    mode: hasTxHash ? "onchain" : "local",
    rpcUrl: params.rpcUrl,
    chainId: params.chainId,
    blockTag: params.blockTag || "latest",
    enableDebug: true,
    debugSessionOnly: true,
    analysisOptions: buildDebugAnalysisOptions(params),
  };

  if (hasTxPayload) {
    payload.transaction = params.transaction;
  } else if (hasTxHash) {
    payload.txHash = params.txHash;
  }

  if (params.artifacts_inline && typeof params.artifacts_inline === "object") {
    payload.artifacts_inline = params.artifacts_inline;
  }
  if (Array.isArray(params.artifacts)) {
    payload.artifacts = params.artifacts;
  }

  console.log(
    `[simulator-bridge] starting keep-alive debug session (RPC: ${redactRpcUrl(params.rpcUrl)}, chain: ${params.chainId}, mode: ${payload.mode})`,
  );
  const { result, session } = await gatedRunSimulationWithKeepAlive(simulationSemaphore, JSON.stringify(payload));
  if (!session) {
    const message = getKeepAliveSessionError(result);
    console.warn(
      `[simulator-bridge] keep-alive session was not created (mode=${result?.mode ?? "unknown"}, debugLevel=${result?.debugLevel ?? "unknown"}): ${message}`,
    );
    throw new Error(message);
  }

  return {
    sessionId: session.sessionId,
    rpcPort: session.rpcPort,
    snapshotCount: session.snapshotCount || result?.debugSession?.snapshotCount || 0,
    sourceFiles: result?.sourceFiles || {},
    createdAt: session.createdAt,
  };
}

// =============================================================================
// Async Debug Preparation Infrastructure
// =============================================================================

/**
 * @typedef {Object} PrepareJob
 * @property {string} prepareId
 * @property {'queued'|'preparing'|'ready'|'failed'} status
 * @property {string|null} stage
 * @property {number} progressPct
 * @property {string|null} message
 * @property {string|null} sessionId
 * @property {number|null} snapshotCount
 * @property {Object|null} sourceFiles
 * @property {string|null} error
 * @property {Set<import('node:http').ServerResponse>} sseClients
 * @property {number} createdAt
 * @property {number|null} completedAt
 */

/** @type {Map<string, PrepareJob>} */
export const prepareJobs = new Map();
export const PREPARE_JOB_TTL_MS = 30 * 60 * 1000;
export const PREPARE_JOB_MAX = 10;

export const PREPARE_STAGE_NAMES = {
  1: "replay_and_collect_trace",
  2: "download_verified_sources",
  3: "analyze_source",
  4: "instrument_and_recompile",
  5: "capture_opcode_snapshots",
  6: "tweak_bytecode",
  7: "capture_hook_snapshots",
  8: "start_debug_rpc",
};

export const PREPARE_STAGE_LABELS = {
  1: "Replaying transaction to collect call trace...",
  2: "Downloading verified source code...",
  3: "Analyzing source code...",
  4: "Instrumenting and recompiling contracts...",
  5: "Collecting opcode-level snapshots...",
  6: "Replacing bytecode with instrumented versions...",
  7: "Capturing hook-level snapshots...",
  8: "Starting debug RPC server...",
};

export function broadcastPrepareEvent(prepareId, event, data) {
  const job = prepareJobs.get(prepareId);
  if (!job) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of job.sseClients) {
    try {
      client.write(payload);
    } catch {
      job.sseClients.delete(client);
    }
  }
}

export function pruneStalePrepareSessions() {
  const now = Date.now();
  for (const [id, job] of prepareJobs) {
    if (job.completedAt && (now - job.completedAt) > PREPARE_JOB_TTL_MS) {
      prepareJobs.delete(id);
    }
  }
  if (prepareJobs.size > PREPARE_JOB_MAX) {
    const sorted = Array.from(prepareJobs.entries()).sort(
      (a, b) => a[1].createdAt - b[1].createdAt,
    );
    while (prepareJobs.size > PREPARE_JOB_MAX && sorted.length > 0) {
      const [id] = sorted.shift();
      prepareJobs.delete(id);
    }
  }
}

/**
 * Run async debug preparation in the background
 * Spawns edb-simulator and streams progress via SSE
 * @param {import('./bridge-config.mjs').SimulationSemaphore} simulationSemaphore
 * @param {string} prepareId
 * @param {Object} params
 */
export async function runAsyncDebugPrep(simulationSemaphore, prepareId, params) {
  const job = prepareJobs.get(prepareId);
  if (!job) return;

  job.status = "preparing";
  job.message = "Starting debug preparation...";
  broadcastPrepareEvent(prepareId, "stage", {
    stage: "queued",
    progressPct: 0,
    message: job.message,
  });

  const payload = {
    mode: params.txHash ? "onchain" : "local",
    rpcUrl: params.rpcUrl,
    chainId: params.chainId,
    blockTag: params.blockTag || "latest",
    enableDebug: true,
    debugSessionOnly: true,
    analysisOptions: buildDebugAnalysisOptions(params),
  };

  if (params.transaction) payload.transaction = params.transaction;
  if (params.txHash) payload.txHash = params.txHash;
  if (params.artifacts_inline) payload.artifacts_inline = params.artifacts_inline;
  if (Array.isArray(params.artifacts)) payload.artifacts = params.artifacts;

  console.log(
    `[simulator-bridge] async debug prep starting: ${prepareId} (RPC: ${redactRpcUrl(params.rpcUrl)}, chain: ${params.chainId})`,
  );

  try {
    const { result, session } = await gatedRunSimulationWithKeepAlive(
      simulationSemaphore,
      JSON.stringify(payload),
      {
        onProgress: (msg) => {
          const step = msg.current_step;
          const total = msg.total_steps || 8;
          const stageName = PREPARE_STAGE_NAMES[step] || `step_${step}`;
          const stageLabel = PREPARE_STAGE_LABELS[step] || msg.message;
          const pct = Math.round((step / total) * 100);

          job.stage = stageName;
          job.progressPct = pct;
          job.message = stageLabel;

          broadcastPrepareEvent(prepareId, "stage", {
            stage: stageName,
            progressPct: pct,
            message: stageLabel,
            currentStep: step,
            totalSteps: total,
          });
        },
      },
    );

    if (session) {
      job.status = "ready";
      job.sessionId = session.sessionId;
      job.snapshotCount = session.snapshotCount || 0;
      job.sourceFiles = result?.sourceFiles || {};
      job.progressPct = 100;
      job.stage = "ready";
      job.message = "Debug session ready";
      job.completedAt = Date.now();

      console.log(
        `[simulator-bridge] async debug prep ready: ${prepareId} → session ${session.sessionId}`,
      );

      broadcastPrepareEvent(prepareId, "ready", {
        sessionId: session.sessionId,
        snapshotCount: job.snapshotCount,
        sourceFiles: job.sourceFiles,
      });
    } else {
      const message = getKeepAliveSessionError(result);
      console.warn(
        `[simulator-bridge] async debug prep missing keep-alive session (mode=${result?.mode ?? "unknown"}, debugLevel=${result?.debugLevel ?? "unknown"}): ${message}`,
      );
      throw new Error(message);
    }
  } catch (err) {
    job.status = "failed";
    job.error = err.message || "Unknown error during debug preparation";
    job.completedAt = Date.now();
    console.error(`[simulator-bridge] async debug prep failed: ${prepareId}:`, err.message);

    broadcastPrepareEvent(prepareId, "failed", { error: job.error });
  }

  for (const client of job.sseClients) {
    try {
      client.end();
    } catch {}
  }
  job.sseClients.clear();
}
