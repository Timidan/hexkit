// Demo page that loads the same fixture the docs/sample-sim-ui.html mock
// uses and renders it through the React port. Lets us verify the components
// produce identical output to the static mock — and serves as a paste-in
// scratchpad: drop any /simulate response JSON into the textarea to render.

import { useState } from "react";
import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";
import { StarknetSimulationResults } from "./StarknetSimulationResults";

const STARTER_HINT =
  "// Paste a /simulate JSON response here, or click 'Load sample' to fetch\n// docs/sample-sim-response.json from starknet-sim/.";

export function StarknetSimDemoPage() {
  const [raw, setRaw] = useState<string>(STARTER_HINT);
  const [response, setResponse] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSample = async () => {
    try {
      const r = await fetch(
        "https://raw.githubusercontent.com/Timidan/starknet-sim/main/docs/sample-sim-response.json",
      );
      const text = await r.text();
      setRaw(text);
      const parsed = JSON.parse(text) as SimulateResponse;
      setResponse(parsed);
      setError(null);
    } catch (e) {
      setError(`Failed to fetch sample: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const parseRaw = () => {
    try {
      const parsed = JSON.parse(raw) as SimulateResponse;
      setResponse(parsed);
      setError(null);
    } catch (e) {
      setError(`JSON parse error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg text-zinc-100 font-semibold">Starknet sim — React demo</h1>
            <div className="flex gap-2">
              <button
                className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm hover:bg-zinc-800 text-zinc-300"
                onClick={loadSample}
              >
                Load sample fixture
              </button>
              <button
                className="rounded-md border border-emerald-700 bg-emerald-900/40 hover:bg-emerald-900/60 px-3 py-1.5 text-sm text-emerald-200"
                onClick={parseRaw}
              >
                Render →
              </button>
            </div>
          </div>
          <textarea
            className="w-full h-32 bg-zinc-950 border border-zinc-800 rounded p-2 text-xs text-zinc-300 font-mono"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          {error && <div className="text-xs text-red-300">{error}</div>}
        </div>

        {response && (
          <StarknetSimulationResults
            response={response}
            source="React port — demo route"
            onResimulate={() => alert("Re-simulate would call StarknetSimulator.simulate() with the same body")}
            onExplainTransaction={() => alert("LLM whole-tx summary affordance — wire to your endpoint")}
            onExplainFrame={(f) =>
              alert(`LLM per-frame explainer for ${f.contractAddress} → ${f.entryPointSelector}`)
            }
          />
        )}
      </div>
    </div>
  );
}
