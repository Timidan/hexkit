import { z } from "zod";

const hex32 = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, "expected 0x-prefixed 32-byte hex");
const hexVar = z.string().regex(/^0x[0-9a-fA-F]+$/, "expected 0x-prefixed hex");
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "expected 20-byte address");

type AbiParam = {
  name?: string;
  type: string;
  indexed?: boolean;
  components?: AbiParam[];
};
const abiParam: z.ZodType<AbiParam> = z.object({
  name: z.string().optional(),
  type: z.string(),
  indexed: z.boolean().optional(),
  components: z.array(z.lazy(() => abiParam)).optional(),
});
const abiEntry = z.object({
  type: z.enum(["function", "event", "error", "constructor", "fallback", "receive"]),
  name: z.string().optional(),
  inputs: z.array(abiParam).optional(),
  outputs: z.array(abiParam).optional(),
  stateMutability: z.string().optional(),
  anonymous: z.boolean().optional(),
});

export const heimdallDecompilationSchema = z.object({
  source: z.string().min(1),
  abi: z.array(abiEntry),
  bytecodeHash: hex32,
  heimdallVersion: z.string(),
  cacheHit: z.boolean(),
  generatedAt: z.number(),
});

export const heimdallStorageSlotSchema = z.object({
  slot: hexVar,
  value: hex32,
  modifiers: z.array(z.string()).optional(),
});

export const heimdallStorageDumpSchema = z.object({
  address,
  chainId: z.number().int().positive(),
  blockNumber: z.number().int().nonnegative(),
  slots: z.array(heimdallStorageSlotSchema),
  heimdallVersion: z.string(),
  cacheHit: z.boolean(),
  generatedAt: z.number(),
});

export const heimdallErrorSchema = z.object({
  error: z.enum([
    "heimdall_not_installed",
    "heimdall_timeout",
    "heimdall_crash",
    "heimdall_invalid_output",
    "heimdall_upstream_error",
    "heimdall_rpc_failed",
    "bad_request",
  ]),
  message: z.string().optional(),
  details: z.string().optional(),
});

export const heimdallVersionSchema = z.object({
  available: z.boolean(),
  version: z.string().optional(),
});

export type HeimdallDecompilation = z.infer<typeof heimdallDecompilationSchema>;
export type HeimdallStorageSlot = z.infer<typeof heimdallStorageSlotSchema>;
export type HeimdallStorageDump = z.infer<typeof heimdallStorageDumpSchema>;
export type HeimdallError = z.infer<typeof heimdallErrorSchema>;
export type HeimdallVersion = z.infer<typeof heimdallVersionSchema>;
