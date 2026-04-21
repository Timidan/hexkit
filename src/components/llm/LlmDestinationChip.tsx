import React from "react";
import type { LlmProvider } from "../../utils/llm/types";

interface Props {
  provider: LlmProvider;
  mode: "default" | "byok";
  shared: boolean;
}

const PROVIDER_LABEL: Record<LlmProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
  custom: "Custom",
};

export const LlmDestinationChip: React.FC<Props> = ({ provider, mode, shared }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
    sending to <strong className="text-foreground">{PROVIDER_LABEL[provider]}</strong>
    {mode === "byok" ? <span>· your key</span> : null}
    <span>·</span>
    <span className={shared ? "text-amber-600" : "text-emerald-600"}>
      {shared ? "shared to cache" : "not shared"}
    </span>
  </span>
);
