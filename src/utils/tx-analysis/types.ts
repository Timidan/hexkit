import { z } from "zod";

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/u, "invalid address");

export const bytes32Schema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{1,64}$/u, "invalid hex value");

export const evidenceKindSchema = z.enum(["write", "read", "trigger", "profit"]);

export const writeEvidenceSchema = z.object({
  id: z.string(),
  contract: addressSchema,
  slot: bytes32Schema,
  valueBefore: bytes32Schema.nullable(),
  valueAfter: bytes32Schema,
  label: z.string().nullable(),
  typeHint: z.string().nullable(),
  opcodeIndex: z.number().int().nonnegative(),
  sourceLine: z.number().int().nullable(),
  sourceFile: z.string().nullable(),
});

export const readEvidenceSchema = z.object({
  id: z.string(),
  contract: addressSchema,
  slot: bytes32Schema,
  value: bytes32Schema,
  label: z.string().nullable(),
  opcodeIndex: z.number().int().nonnegative(),
  sourceLine: z.number().int().nullable(),
  sourceFile: z.string().nullable(),
  followsWriteId: z.string().nullable(),
});

export const triggerEvidenceSchema = z.object({
  id: z.string(),
  contract: addressSchema,
  kind: z.enum(["CALL", "DELEGATECALL", "STATICCALL", "CREATE", "CREATE2", "LOG"]),
  selector: z.string().nullable(),
  function: z.string().nullable(),
  args: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
  logTopics: z.array(z.string()).default([]),
  opcodeIndex: z.number().int().nonnegative(),
});

export const profitEvidenceSchema = z.object({
  id: z.string(),
  token: addressSchema.nullable(),
  asset: z.enum(["ETH", "ERC20", "ERC721", "ERC1155"]),
  holder: addressSchema,
  delta: z.string(),
  direction: z.enum(["in", "out"]),
  opcodeIndex: z.number().int().nonnegative(),
});

export const heuristicHitSchema = z.object({
  name: z.enum([
    "revert_on_path",
    "sload_after_sstore",
    "large_delta",
    "accumulator",
    "zero_address_transfer",
    "balance_zeroed",
    "self_destruct",
  ]),
  evidenceId: z.string(),
  reason: z.string(),
});

export const contractMetaSchema = z.object({
  address: addressSchema,
  name: z.string().nullable(),
  proxyImplementation: addressSchema.nullable(),
  verified: z.boolean(),
  sourceProvider: z.enum(["sourcify", "etherscan", "blockscout", "heimdall", "none"]),
});

export const evidencePacketSchema = z.object({
  txHash: z.string().nullable(),
  simulationId: z.string(),
  chainId: z.number().int(),
  from: addressSchema,
  to: addressSchema,
  success: z.boolean(),
  revertReason: z.string().nullable(),
  writes: z.array(writeEvidenceSchema),
  reads: z.array(readEvidenceSchema),
  triggers: z.array(triggerEvidenceSchema),
  profit: z.array(profitEvidenceSchema),
  contracts: z.array(contractMetaSchema),
  heuristics: z.array(heuristicHitSchema),
  truncated: z.object({
    writes: z.boolean(),
    reads: z.boolean(),
    triggers: z.boolean(),
    profit: z.boolean(),
  }),
});

export const causalStepSchema = z.object({
  step: z.enum(["Write", "Read", "Trigger", "Profit"]),
  description: z.string(),
  evidenceId: z.string(),
});

export const gateSchema = z.object({
  name: z.string(),
  bypassedBy: z.string().nullable(),
});

export const riskBoundSchema = z.object({
  upperBoundEth: z.string(),
  rationale: z.string(),
});

export const deepDiveSchema = z.object({
  trustBoundaries: z.array(
    z.object({
      contract: addressSchema,
      sourceQuality: z.enum(["verified", "reconstructed", "heuristic", "none"]),
      findings: z.array(z.string()),
    }),
  ),
  verdictUpgrade: z.enum(["CONFIRMED", "OPEN", "INSUFFICIENT"]),
  additionalRiskBound: riskBoundSchema.nullable(),
});

export const verdictSchema = z.object({
  verdict: z.enum(["CONFIRMED", "OPEN", "INSUFFICIENT"]),
  confidence: z.number().min(0).max(1),
  coreContradiction: z
    .object({ expected: z.string(), actual: z.string() })
    .nullish()
    .transform((v) => v ?? null),
  causalChain: z.array(causalStepSchema).default([]),
  gates: z.array(gateSchema).default([]),
  deepDive: deepDiveSchema.nullish().transform((v) => v ?? null),
  riskBound: riskBoundSchema.nullish().transform((v) => v ?? null),
  missingEvidence: z.array(z.string()).default([]),
});

export type EvidencePacket = z.infer<typeof evidencePacketSchema>;
export type WriteEvidence = z.infer<typeof writeEvidenceSchema>;
export type ReadEvidence = z.infer<typeof readEvidenceSchema>;
export type TriggerEvidence = z.infer<typeof triggerEvidenceSchema>;
export type ProfitEvidence = z.infer<typeof profitEvidenceSchema>;
export type HeuristicHit = z.infer<typeof heuristicHitSchema>;
export type ContractMeta = z.infer<typeof contractMetaSchema>;
export type Verdict = z.infer<typeof verdictSchema>;
export type CausalStep = z.infer<typeof causalStepSchema>;
export type Gate = z.infer<typeof gateSchema>;
export type RiskBound = z.infer<typeof riskBoundSchema>;
export type DeepDive = z.infer<typeof deepDiveSchema>;

export const EVIDENCE_ROW_CAPS = {
  writes: 200,
  reads: 200,
  triggers: 150,
  profit: 100,
} as const;
