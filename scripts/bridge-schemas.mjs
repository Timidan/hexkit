// =============================================================================
// Bridge request body schemas — Zod
// =============================================================================
// Validates incoming POST bodies at the /simulate, /trace/*, /debug/* endpoints
// so downstream code can trust shape without ad-hoc `typeof` guards.
// =============================================================================

import { z } from "zod";
import { readBody } from "./simulation-runner.mjs";

const HexStringSchema = z.string().regex(/^0x[0-9a-fA-F]*$/);
const TxHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const SessionIdSchema = z.string().min(1).max(256);

const TxLikeSchema = z
  .object({
    from: HexStringSchema.optional(),
    to: HexStringSchema.nullable().optional(),
    value: z.union([z.string(), z.number()]).optional(),
    data: HexStringSchema.optional(),
    input: HexStringSchema.optional(),
    gas: z.union([z.string(), z.number()]).optional(),
    gasLimit: z.union([z.string(), z.number()]).optional(),
    gasPrice: z.union([z.string(), z.number()]).optional(),
    maxFeePerGas: z.union([z.string(), z.number()]).optional(),
    maxPriorityFeePerGas: z.union([z.string(), z.number()]).optional(),
    nonce: z.union([z.string(), z.number()]).optional(),
    chainId: z.union([z.string(), z.number()]).optional(),
    type: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const ArtifactSchema = z
  .object({
    address: HexStringSchema.optional(),
    name: z.string().optional(),
    sources: z.record(z.unknown()).optional(),
  })
  .passthrough();

const AnalysisOptionsSchema = z.record(z.unknown()).optional();

export const SimulateSchema = z
  .object({
    rpcUrl: z.string().url(),
    chainId: z.union([z.number().int().positive(), z.string()]).optional(),
    transaction: TxLikeSchema.optional(),
    txHash: TxHashSchema.optional(),
    mode: z.enum(["local", "onchain"]).optional(),
    enableDebug: z.boolean().optional(),
    analysisOptions: AnalysisOptionsSchema,
    artifacts: z.array(ArtifactSchema).optional(),
    artifacts_inline: z.record(z.unknown()).optional(),
    blockNumber: z.union([z.number(), z.string()]).optional(),
    blockTag: z.string().optional(),
  })
  .passthrough()
  .refine((b) => !!b.transaction || !!b.txHash, {
    message: "transaction or txHash is required",
  });

export const TraceDetailSchema = z.object({
  id: z.string().min(1).max(128),
});

const DebugPreparePayloadSchema = SimulateSchema.innerType()
  .extend({
    chainId: z.union([z.number().int().positive(), z.string()]),
  })
  .passthrough()
  .refine((b) => !!b.transaction || !!b.txHash, {
    message: "transaction or txHash is required",
  });

export const DebugPrepareSchema = DebugPreparePayloadSchema;
export const DebugStartSchema = DebugPreparePayloadSchema;

export const DebugRpcSchema = z
  .object({
    sessionId: SessionIdSchema,
    method: z.string().min(1).max(128),
    params: z.array(z.unknown()).optional(),
  })
  .passthrough();

export const DebugEndSchema = z.object({
  sessionId: SessionIdSchema,
});

/**
 * Read JSON body and validate against a schema.
 * Returns `{ ok: true, data }` on success or `{ ok: false, issues }` on failure.
 * @template T
 * @param {import('node:http').IncomingMessage} req
 * @param {z.ZodType<T>} schema
 * @returns {Promise<{ ok: true, data: T } | { ok: false, issues: unknown }>}
 */
export async function readAndValidate(req, schema) {
  const raw = await readBody(req);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues };
  }
  return { ok: true, data: parsed.data };
}
