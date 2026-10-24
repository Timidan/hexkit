import { parseVaraInput } from "../links";
import { parseInput } from "../dryRun";
import type { CallInput } from "./CallComposer";
import type { VaraCase } from "../case";

export function sampleCall(c: VaraCase, messageId: string): CallInput {
  const { signer, destination, payload, value, gasLimit } = c.call;
  if (!c.result.success || c.message?.id.toLowerCase() !== messageId.toLowerCase() || !signer || !destination || payload === null || value === null || gasLimit === null || destination.toLowerCase() !== c.message.programId.toLowerCase()) {
    throw new Error("This message cannot be reconstructed as a supported signed program call. Open it in the explorer to inspect it.");
  }
  // A pre-block snapshot is useful for re-running a call, but is not an exact
  // transaction replay: earlier extrinsics within the same block are excluded.
  return { program: destination, origin: signer, payload, value, gasLimit, block: String(Math.max(0, c.block.number - 1)) };
}

export function prepareCall(input: CallInput) {
  const program = parseVaraInput(input.program, "program"), origin = parseVaraInput(input.origin, "program");
  if (program?.kind !== "program") throw new Error("Enter a valid program id or explorer link");
  if (origin?.kind !== "program") throw new Error("Enter a valid sender address");
  return { programId: program.id, input: parseInput({ ...input, origin: origin.id, payload: input.payload.trim(), block: input.block.trim() }) };
}
