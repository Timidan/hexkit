import { BTL_DEFAULT_MODEL } from "./models";
import type { BtlRuntimeMeta } from "./client";

export interface BtlTool { name: string; description: string; parameters: object; run: (args: any) => Promise<unknown> }

export async function runBtlAgent(opts: {
  system: string; userText: string; tools: BtlTool[]; model?: string; maxIters?: number;
  callBtl: (body: unknown) => Promise<{ data: unknown; meta: BtlRuntimeMeta }>;
}) {
  const { system, userText, tools, model = BTL_DEFAULT_MODEL, maxIters = 4, callBtl } = opts;
  const toolSpecs = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const messages: any[] = [ { role: "system", content: system }, { role: "user", content: userText } ];
  const metas: BtlRuntimeMeta[] = [];
  const toolRuns: Array<{ name: string; args: unknown; result: unknown }> = [];

  for (let i = 0; i < maxIters; i++) {
    const { data, meta } = await callBtl({ model, messages, tools: toolSpecs, tool_choice: "auto", temperature: 0.2 });
    metas.push(meta);
    const choice = (data as any)?.choices?.[0];
    const msg = choice?.message;
    if (!msg) break;
    messages.push(msg);
    const calls = msg.tool_calls as Array<{ id: string; function: { name: string; arguments: string } }> | undefined;
    if (!calls || calls.length === 0) {
      return { finalText: typeof msg.content === "string" ? msg.content : null, metas, toolRuns };
    }
    for (const c of calls) {
      const tool = tools.find((t) => t.name === c.function.name);
      let result: unknown;
      try { result = tool ? await tool.run(JSON.parse(c.function.arguments || "{}")) : { error: "unknown tool" }; }
      catch (e: any) { result = { error: e?.message ?? "tool failed" }; }
      toolRuns.push({ name: c.function.name, args: c.function.arguments, result });
      messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
    }
  }
  return { finalText: null, metas, toolRuns };
}
