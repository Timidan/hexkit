import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../ui/dialog";
import { Button } from "../ui/button";
import { useLlmConsent } from "../../hooks/useLlmConsent";

interface Props {
  open: boolean;
  onAcknowledge: () => void;
  onClose: () => void;
  providerName?: string;
}

export const LlmConsentModal: React.FC<Props> = ({ open, onAcknowledge, onClose, providerName }) => {
  const { requestAck } = useLlmConsent();
  const handleAck = () => {
    requestAck();
    onAcknowledge();
  };
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Sending data to an LLM</DialogTitle>
          <DialogDescription>
            Hexkit is about to send transaction and contract data to {providerName ?? "a language model"} for analysis.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p>
            When you run simple or complex transaction analysis with BYOK keys (Anthropic, OpenAI, or a custom
            endpoint), the following data leaves your browser:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Decoded trace rows (SSTOREs, SLOADs, calls, events, balance deltas) for the selected transaction</li>
            <li>Verified or decompiled Solidity source for contracts on the execution path</li>
            <li>The prompt we author (methodology instructions)</li>
          </ul>
          <p>
            <strong>BYOK runs stay private:</strong> reports generated with your own keys are <em>not</em> shared with
            the hexkit cache unless you explicitly opt in per run.
          </p>
          <p>
            <strong>The free Gemini 3.1 Pro Preview default</strong> routes through hexkit&apos;s proxy; by using it you
            agree that resulting reports may be cached and shown to other hexkit users.
          </p>
          <p className="text-xs text-muted-foreground">
            You can change providers or disable LLM calls in LLM Settings at any time.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Not now</Button>
          <Button onClick={handleAck}>I understand, continue</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
