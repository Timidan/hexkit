export type StreamEvent =
  | { type: "text"; value: string }
  | { type: "done" }
  | { type: "error"; message: string };

function linesOf(chunk: string): string[] {
  return chunk.split(/\r?\n/);
}

function dataPayloads(chunk: string): string[] {
  return linesOf(chunk)
    .filter((l) => l.startsWith("data: "))
    .map((l) => l.slice(6).trim())
    .filter(Boolean);
}

export function parseAnthropicSseChunk(chunk: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const payload of dataPayloads(chunk)) {
    try {
      const msg = JSON.parse(payload);
      if (msg.type === "content_block_delta" && msg.delta?.type === "text_delta") {
        events.push({ type: "text", value: msg.delta.text });
      } else if (msg.type === "message_stop") {
        events.push({ type: "done" });
      }
    } catch { /* ignore */ }
  }
  return events;
}

export function parseOpenAISseChunk(chunk: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const payload of dataPayloads(chunk)) {
    if (payload === "[DONE]") {
      events.push({ type: "done" });
      continue;
    }
    try {
      const msg = JSON.parse(payload);
      const delta = msg?.choices?.[0]?.delta?.content;
      if (typeof delta === "string") events.push({ type: "text", value: delta });
    } catch { /* ignore */ }
  }
  return events;
}

export function parseGeminiSseChunk(chunk: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  for (const payload of dataPayloads(chunk)) {
    try {
      const msg = JSON.parse(payload);
      const parts = msg?.candidates?.[0]?.content?.parts ?? [];
      for (const p of parts) {
        if (typeof p?.text === "string") events.push({ type: "text", value: p.text });
      }
    } catch { /* ignore */ }
  }
  return events;
}
