import type { EvidencePacket } from "../../tx-analysis/types";
import { extractTriageBits } from "./features";

export interface TriageResult {
  classBits: number;
  severity: number;
}

const CLASS_LABELS: ReadonlyArray<readonly [number, string]> = [
  [1 << 0, "flashloan-price-manipulation"],
  [1 << 1, "delegatecall-to-user-controlled"],
  [1 << 2, "approval-drain"],
  [1 << 3, "signer-compromise"],
  [1 << 4, "access-control-bypass"],
];

export function classBitsToLabels(bits: number): string[] {
  const out: string[] = [];
  for (const [mask, label] of CLASS_LABELS) {
    if (bits & mask) out.push(label);
  }
  return out;
}

export function packFeatures(packet: EvidencePacket): number {
  return extractTriageBits(packet);
}
