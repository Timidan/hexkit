import React, { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { useLlmConfig } from "../../contexts/LlmConfigContext";
import type { LlmProvider } from "../../utils/llm/types";

interface Props {
  onClose: () => void;
}

const MODEL_HINTS: Record<LlmProvider, string[]> = {
  anthropic: ["claude-opus-4-7", "claude-sonnet-4-6"],
  openai: ["gpt-5.4", "gpt-5.4-mini"],
  gemini: ["gemini-2.5-pro", "gemini-3.1-pro-preview"],
  custom: [],
};

const PROVIDERS: LlmProvider[] = ["gemini", "anthropic", "openai", "custom"];

const PROVIDER_LABELS: Record<LlmProvider, string> = {
  gemini: "Gemini",
  anthropic: "Anthropic",
  openai: "OpenAI",
  custom: "Custom",
};

const LlmSettingsPanel: React.FC<Props> = ({ onClose }) => {
  const { config, saveConfig } = useLlmConfig();
  const [draft, setDraft] = useState(config);
  const [activeTab, setActiveTab] = useState<LlmProvider>(config.defaultProvider);

  const save = () => {
    saveConfig(draft);
    onClose();
  };

  return (
    <div className="flex flex-col gap-2 pt-3">
      <p className="text-xs text-muted-foreground">
        Default provider is Gemini via the hexkit proxy. Bring your own key for Anthropic, OpenAI,
        or a custom endpoint.
      </p>
      <div className="inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground">
        {PROVIDERS.map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={activeTab === p}
            onClick={() => setActiveTab(p)}
            className={`inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none ${activeTab === p ? "bg-background text-foreground shadow-sm" : ""}`}
          >
            {PROVIDER_LABELS[p]}
          </button>
        ))}
      </div>
      {PROVIDERS.map((p) => (
        <div key={p} hidden={activeTab !== p} className="space-y-3 pt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">
              {p === "gemini"
                ? "Gemini 3.1 Pro Preview · free via hexkit proxy"
                : "BYOK"}
            </span>
            {draft.defaultProvider === p ? (
              <span className="text-xs font-medium text-primary">Default provider</span>
            ) : (
              <button
                type="button"
                className="text-xs underline text-muted-foreground hover:text-foreground"
                onClick={() => setDraft({ ...draft, defaultProvider: p })}
              >
                Set as default
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${p}-model`}>Model</Label>
            <Input
              id={`${p}-model`}
              value={draft.providers[p].model}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  providers: {
                    ...draft.providers,
                    [p]: { ...draft.providers[p], model: e.target.value },
                  },
                })
              }
              list={`${p}-models`}
            />
            <datalist id={`${p}-models`}>
              {MODEL_HINTS[p].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          {p !== "gemini" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-key`}>
                {p === "anthropic" ? "Anthropic" : p === "openai" ? "OpenAI" : "Custom"} API Key
              </Label>
              <Input
                id={`${p}-key`}
                type="password"
                value={draft.providerKeys[p] ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providerKeys: { ...draft.providerKeys, [p]: e.target.value },
                  })
                }
                placeholder={p === "anthropic" ? "sk-ant-…" : p === "openai" ? "sk-…" : "…"}
              />
            </div>
          ) : null}
          {p === "custom" ? (
            <div className="space-y-1.5">
              <Label htmlFor="custom-url">Custom Base URL (browser-direct, not proxied)</Label>
              <Input
                id="custom-url"
                value={draft.providers.custom.customBaseUrl ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    providers: {
                      ...draft.providers,
                      custom: { ...draft.providers.custom, customBaseUrl: e.target.value },
                    },
                  })
                }
                placeholder="https://openrouter.ai/api/v1"
              />
              <p className="text-xs text-amber-600">
                Custom endpoints are called from your browser with your key. They never go through
                the hexkit proxy.
              </p>
            </div>
          ) : null}
        </div>
      ))}
      <div className="flex justify-end gap-2 pt-3 border-t mt-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save}>Save</Button>
      </div>
    </div>
  );
};

export default LlmSettingsPanel;
