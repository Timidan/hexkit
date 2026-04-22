// Thinking/chat models often return JSON wrapped in code fences or preceded
// by prose. Try progressively looser parses: raw → fence-stripped → first-`{`
// to last-`}` slice. Returns null when nothing parses.
export function parseLlmJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const stripped = text
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    try {
      return JSON.parse(stripped);
    } catch {
      const first = stripped.indexOf("{");
      const last = stripped.lastIndexOf("}");
      if (first >= 0 && last > first) {
        try {
          return JSON.parse(stripped.slice(first, last + 1));
        } catch {
          /* fall through */
        }
      }
      return null;
    }
  }
}
