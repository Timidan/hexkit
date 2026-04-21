import React from "react";
import { Detective } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "../ui/hover-card";

interface Props {
  onSummarize: () => void;
  disabled?: boolean;
}

export const SummarizeButton: React.FC<Props> = ({ onSummarize, disabled }) => (
  <HoverCard>
    <HoverCardTrigger asChild>
      <Button onClick={onSummarize} variant="outline" size="icon" aria-label="Summarize transaction" disabled={disabled}>
        <Detective size={18} />
      </Button>
    </HoverCardTrigger>
    <HoverCardContent>Summarize this transaction with Tx Captain</HoverCardContent>
  </HoverCard>
);
