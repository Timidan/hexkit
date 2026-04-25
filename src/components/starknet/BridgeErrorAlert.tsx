// Drop-in error renderer for bridge calls. Takes whatever the simulator
// client throws, runs it through the copy mapper, and renders a clear
// title + plain-language hint on top of the raw bridge code/message
// line. Used by Trace, Speculative, and Estimate fee.

import React from "react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { resolveBridgeError } from "@/chains/starknet/simulatorErrorCopy";

interface Props {
  /** Either the thrown error itself or a pre-resolved string. The
   *  mapper dispatches on StarknetSimulatorBridgeError to read the
   *  `code` field; falls back to a generic copy block for anything
   *  else. */
  error: unknown;
  /** Tab-specific prefix shown in the alert title — e.g. "Trace"
   *  becomes "Trace failed: Nonce mismatch". */
  context?: string;
}

export const BridgeErrorAlert: React.FC<Props> = ({ error, context }) => {
  if (!error) return null;
  const resolved = resolveBridgeError(error);
  const heading = context ? `${context} failed — ${resolved.title}` : resolved.title;
  return (
    <Alert variant="destructive" data-testid="bridge-error-alert">
      <AlertTitle>{heading}</AlertTitle>
      <AlertDescription className="space-y-1.5">
        <p className="text-xs leading-snug">{resolved.hint}</p>
        <p className="font-mono text-[10px] text-muted-foreground break-words">
          <span className="uppercase">{resolved.code}</span>
          {resolved.message ? `: ${resolved.message}` : ""}
        </p>
      </AlertDescription>
    </Alert>
  );
};

export default BridgeErrorAlert;
