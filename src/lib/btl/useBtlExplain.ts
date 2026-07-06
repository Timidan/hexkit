import { useCallback, useState } from "react";
import { buildBtlChatRequest, extractOpenAiText, type BtlRuntimeMeta } from "./client";
import { postLlmRecommend } from "@/components/integrations/lifi-earn/earnApi";

// Tiny, generic weave engine: one-shot BTL call → text (or raw JSON) + cost
// meta. Shared by any surface that wants an "explain this" call. Pass
// { jsonMode: true } for surfaces that want structured JSON back (e.g. the
// storage slot chips), which then parse `text` themselves.
export function useBtlExplain(opts?: { jsonMode?: boolean; maxTokens?: number }) {
  const jsonMode = opts?.jsonMode ?? false;
  const maxTokens = opts?.maxTokens ?? 700;
  const [text, setText] = useState<string | null>(null);
  const [meta, setMeta] = useState<BtlRuntimeMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const explain = useCallback(async (system: string, userText: string) => {
    setText(null);
    setMeta(null);
    setError(null);
    setLoading(true);
    try {
      // Hard cap the user text so the JSON-serialized chat body stays under
      // the proxy's 64KB limit even after escaping (30k chars leaves ~2x
      // headroom). Per-weave caps can stay; this is the safety net all
      // weaves pass through.
      const cappedUserText = userText.slice(0, 30000);
      const { data, meta } = await postLlmRecommend(
        buildBtlChatRequest(system, cappedUserText, { jsonMode, maxTokens }),
      );
      setText(extractOpenAiText(data));
      setMeta(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get an explanation.");
    } finally {
      setLoading(false);
    }
  }, [jsonMode, maxTokens]);

  const reset = useCallback(() => {
    setText(null);
    setMeta(null);
    setError(null);
  }, []);

  return { explain, text, meta, loading, error, reset };
}
