// Demo page that loads the same fixture the static mock uses and renders
// it through the React port. Lets us verify the components produce
// identical output. Drop any /simulate response JSON into the textarea
// to render arbitrary fixtures.

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { SimulateResponse } from "@/chains/starknet/simulatorTypes";
import { StarknetSimulationResults } from "./StarknetSimulationResults";

const STARTER_HINT = `// Paste a /simulate JSON response here, or click 'Load sample' to fetch
// docs/sample-sim-response.json from starknet-sim/.`;

export function StarknetSimDemoPage() {
  const [raw, setRaw] = useState<string>(STARTER_HINT);
  const [response, setResponse] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const loadSample = async () => {
    setLoading(true);
    try {
      // Local first (dev server serves /sample-sim.json from public/),
      // then fall back to GitHub raw if the local copy isn't there.
      let r = await fetch("/sample-sim.json");
      if (!r.ok) {
        r = await fetch(
          "https://raw.githubusercontent.com/Timidan/starknet-sim/main/docs/sample-sim-response.json",
        );
      }
      const text = await r.text();
      setRaw(text);
      const parsed = JSON.parse(text) as SimulateResponse;
      setResponse(parsed);
      setError(null);
    } catch (e) {
      setError(`Failed to fetch sample: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-[1400px] mx-auto space-y-4">
        <Card className="p-4 gap-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg text-foreground font-semibold">Starknet sim — React demo</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" loading={loading} onClick={loadSample}>
                Load sample fixture
              </Button>
              <Button variant="outline" size="sm" onClick={parseRaw}>
                Render →
              </Button>
            </div>
          </div>
          <Textarea
            className="h-32 font-mono text-xs"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Parse failed</AlertTitle>
              <AlertDescription className="font-mono text-[11px]">{error}</AlertDescription>
            </Alert>
          )}
        </Card>

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
