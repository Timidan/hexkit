import { z } from "zod";
import { getAddress, isAddress } from "viem";

export const EXPLOIT_CLASSES = [
  "reentrancy",
  "flashloan-price-manipulation",
  "oracle-manipulation",
  "approval-drain",
  "delegatecall-to-user-controlled",
  "signer-compromise",
  "bridge-message-forgery",
  "governance-takeover",
  "access-control-bypass",
  "math-invariant-manipulation",
] as const;

export const CLASSIFIER_CLASSES = [...EXPLOIT_CLASSES, "unknown"] as const;

export const exploitClassSchema = z.enum(EXPLOIT_CLASSES);
export const classifierClassSchema = z.enum(CLASSIFIER_CLASSES);
export type ExploitClass = z.infer<typeof exploitClassSchema>;
export type ClassifierClass = z.infer<typeof classifierClassSchema>;

export const entityRoleSchema = z.enum([
  "attacker-eoa", "attacker-contract", "victim-contract", "victim-eoa",
  "router", "oracle", "bridge", "signer",
  "implementation", "proxy", "token", "pool",
]);
export type EntityRole = z.infer<typeof entityRoleSchema>;

const EVM_CHAINS = ["ethereum", "bsc", "polygon", "arbitrum", "optimism", "avalanche", "base", "fantom"] as const;

const checksumAddressSchema = z
  .string()
  .refine(
    (a) => isAddress(a) && getAddress(a) === a,
    { message: "address must be EIP-55 checksummed" },
  );

const evmTxHashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/u);

const isoDate2022PlusSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .refine((d) => d >= "2022-01-01", { message: "date must be 2022 or later" });

export const incidentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  chain: z.enum(EVM_CHAINS),
  date: isoDate2022PlusSchema,
  protocol: z.string().nullable(),
  amountUsd: z.number().nonnegative().nullable(),
  canonicalTxs: z.array(evmTxHashSchema),
  exploitClasses: z.array(exploitClassSchema).min(1),
  tldr: z.string().min(1),
  coreContradiction: z.string().min(1),
  attackSteps: z.array(
    z.object({
      order: z.number().int().nonnegative(),
      label: z.string().min(1),
      detail: z.string().min(1),
      sourceIds: z.array(z.string()),
    }),
  ),
  entities: z.array(
    z.object({
      id: z.string().min(1),
      role: entityRoleSchema,
      address: checksumAddressSchema,
      label: z.string().min(1),
    }),
  ),
  fundFlow: z.array(
    z.object({
      fromEntityId: z.string().min(1),
      toEntityId: z.string().min(1),
      tokenSymbol: z.string().nullable(),
      amountHuman: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["post-mortem", "official", "forensic-thread", "database-row"]),
      url: z.string().url(),
      publisher: z.string().min(1),
    }),
  ),
});
export type Incident = z.infer<typeof incidentSchema>;

export function validateCrossRefs(incident: Incident): string[] {
  const errors: string[] = [];
  const entityIds = new Set(incident.entities.map((e) => e.id));
  const sourceIds = new Set(incident.sources.map((s) => s.id));

  for (const f of incident.fundFlow) {
    if (!entityIds.has(f.fromEntityId)) errors.push(`fundFlow.fromEntityId '${f.fromEntityId}' not in entities[]`);
    if (!entityIds.has(f.toEntityId)) errors.push(`fundFlow.toEntityId '${f.toEntityId}' not in entities[]`);
  }
  for (const s of incident.attackSteps) {
    for (const srcId of s.sourceIds) {
      if (!sourceIds.has(srcId)) errors.push(`attackSteps[${s.order}].sourceId '${srcId}' not in sources[]`);
    }
  }
  return errors;
}

export const hackAnalysisSchema = z.object({
  verdict: z.enum(["HACK_CONFIRMED", "HACK_LIKELY", "HACK_UNCERTAIN", "LOOKS_BENIGN"]),
  confidence: z.number().min(0).max(1),
  headline: z.string().min(1),
  coreContradiction: z.string(),
  exploitClasses: z.array(
    z.object({
      class: exploitClassSchema,
      confidence: z.number().min(0).max(1),
      rationale: z.string(),
    }),
  ),
  entities: z.array(
    z.object({
      role: entityRoleSchema,
      address: checksumAddressSchema,
      label: z.string(),
    }),
  ),
  attackSteps: z.array(
    z.object({
      order: z.number().int().nonnegative(),
      label: z.string(),
      detail: z.string(),
      evidenceIds: z.array(z.string()),
    }),
  ),
  fundFlow: z.array(
    z.object({
      fromLabel: z.string(),
      toLabel: z.string(),
      tokenSymbol: z.string().nullable(),
      amountHuman: z.string().nullable(),
    }),
  ),
  analogIncidentIds: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  caveats: z.array(z.string()),
});
export type HackAnalysis = z.infer<typeof hackAnalysisSchema>;

export const toChecksum = (lower: string): string => getAddress(lower as `0x${string}`);
