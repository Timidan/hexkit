import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { VaraCase } from "../case";
import type { Trace } from "../model";
import { decodeCall, decodeReply } from "../decode";
import { loadIdlModel } from "../idlForm";
import { diagnoseCase } from "./incident";
import { download, errorText, jsonText } from "./files";
import { scenarioFromCase } from "./scenario";
import { DownloadSimple } from "@phosphor-icons/react";
import { Button } from "../../../components/ui/button";
import { ValueTree } from "../ui/ValueTree";
import { shortHex } from "../ui/HexChip";

export default function IncidentPanel({ c, trace, onTrace }: { c: VaraCase; trace: Trace | null; onTrace: () => void }) {
  const navigate = useNavigate();
  const [application, setApplication] = useState<"ok" | "err" | "unknown">("unknown"), [decodeError, setDecodeError] = useState(""), [error, setError] = useState("");
  const report = diagnoseCase(c, trace, application);
  const payload = report.reply?.payload, success = report.reply?.success;
  useEffect(() => {
    let active = true;
    setApplication("unknown"); setDecodeError("");
    if (c.idl && c.call.payload && payload && success) void loadIdlModel(c.idl).then(({ model, sails }) => {
      const call = decodeCall(c.call.payload!, sails), decoded = decodeReply(payload, call, sails);
      if (!active) return;
      if (call.error || decoded.error) { setDecodeError(call.error ?? decoded.error ?? ""); return; }
      const method = model.services.find((s) => s.name === call.service)?.methods.find((m) => m.name === call.name);
      if (method?.returns.kind === "result" && decoded.value && typeof decoded.value === "object") {
        const keys = Object.keys(decoded.value).map((k) => k.toLowerCase());
        if (keys.length === 1) setApplication(keys[0] === "ok" ? "ok" : keys[0] === "err" ? "err" : "unknown");
      }
    }).catch((err) => { if (active) setDecodeError(errorText(err)); });
    return () => { active = false; };
  }, [c.idl, c.call.payload, payload, success]);
  function scenario() {
    try { sessionStorage.setItem("hexkit.vara.scenario.handoff", jsonText(scenarioFromCase(c))); navigate("/vara/transactions?tool=scenarios"); }
    catch (err) { setError(errorText(err)); }
  }
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{report.statuses.map((s) => <div key={s.stage} className="rounded-lg border border-border/70 bg-card p-4"><p className="text-xs text-muted-foreground">{s.stage}</p><p className="mt-2 text-sm font-medium">{s.status}</p></div>)}</div>
    <p className="text-xs text-muted-foreground">Based on the loaded case and trace through block {report.coveredThrough}. Imported cases are saved evidence, not freshly verified chain state. Transport success, Result::Ok, and business success are separate; application-specific postconditions are not evaluated here.</p>
    {decodeError && <p className="text-sm text-amber-400">Interface interpretation unavailable: {decodeError}</p>}
    {report.findings.length ? report.findings.map((f) => <article key={f.title} className="space-y-2 rounded-lg border border-border/70 bg-card p-4"><h3 className="text-sm font-semibold">{f.title}</h3><p className="break-words font-mono text-xs text-muted-foreground">{f.evidence}</p><p className="text-sm">{f.action}</p></article>) : <p className="text-sm">No failure was identified in the available evidence. Check the application’s expected outcome separately.</p>}
    <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={onTrace}>Inspect message trace</Button><Button size="sm" variant="outline" disabled={!c.call.destination || !c.call.payload || !c.call.signer} onClick={scenario}>Reproduce in Scenario Tests</Button><Button size="sm" variant="outline" onClick={() => download("vara-incident.json", jsonText({ case: c, trace, diagnosis: report }))}><DownloadSimple />Export diagnosis</Button></div>
    <p className="text-xs text-muted-foreground">Scenario handoff preserves the sender and message bytes. Supply the matching WASM, constructor payload, and local setup; historical chain state is not imported.</p>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    {report.timeline.length > 0 && <section className="space-y-3"><h3 className="font-medium">Observed program timeline</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="text-muted-foreground"><tr><th className="p-2">Block</th><th className="p-2">Program / actor</th><th className="p-2">Message</th><th className="p-2">Observation</th></tr></thead><tbody>{report.timeline.map((t,i) => <tr className="border-t border-border" key={i}><td className="p-2 font-mono">{t.block}</td><td className="p-2 font-mono" title={t.program ?? "Unknown"}>{t.program ? shortHex(t.program) : "Unknown"}</td><td className="p-2 font-mono" title={t.message}>{shortHex(t.message)}</td><td className="p-2">{t.event}{t.detail ? ` · ${t.detail}` : ""}</td></tr>)}</tbody></table></div></section>}
    {report.reply && <ValueTree value={report.reply} rootLabel="root reply evidence" />}
  </div>;
}
