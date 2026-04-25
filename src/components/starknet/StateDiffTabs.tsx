import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import type { StateDiff } from "@/chains/starknet/simulatorTypes";

interface Props {
  diff: StateDiff;
}

const EmptyHint: React.FC<{ label: string }> = ({ label }) => (
  <p className="text-xs text-muted-foreground italic py-3">No {label} changed.</p>
);

const StateDiffTabs: React.FC<Props> = ({ diff }) => {
  const storageCount = diff.storageDiffs.reduce(
    (acc, d) => acc + d.storageEntries.length,
    0,
  );
  const nonceCount = diff.nonceUpdates.length;
  const classCount = diff.declaredClasses.length + diff.classHashUpdates.length;

  return (
    <Tabs defaultValue="storage">
      <TabsList className="w-full">
        <TabsTrigger value="storage" className="flex-1">
          Storage ({storageCount})
        </TabsTrigger>
        <TabsTrigger value="nonces" className="flex-1">
          Nonces ({nonceCount})
        </TabsTrigger>
        <TabsTrigger value="classes" className="flex-1">
          Classes ({classCount})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="storage" className="mt-2 text-xs">
        {diff.storageDiffs.length === 0 && <EmptyHint label="storage" />}
        {diff.storageDiffs.map((d) => (
          <div key={d.address} className="mb-3 rounded border border-border/40 p-2">
            <div className="font-mono text-[11px] text-muted-foreground mb-1">
              {d.address}
            </div>
            <table className="w-full text-[11px] font-mono">
              <tbody>
                {d.storageEntries.map((e) => (
                  <tr key={e.key} className="border-t border-border/20">
                    <td className="py-1 pr-2 text-muted-foreground">{e.key}</td>
                    <td className="py-1 text-foreground break-all">{e.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </TabsContent>

      <TabsContent value="nonces" className="mt-2 text-xs">
        {nonceCount === 0 && <EmptyHint label="nonces" />}
        <table className="w-full text-[11px] font-mono">
          <tbody>
            {diff.nonceUpdates.map((n) => (
              <tr key={n.contractAddress} className="border-t border-border/20">
                <td className="py-1 pr-2 text-muted-foreground break-all">
                  {n.contractAddress}
                </td>
                <td className="py-1 text-foreground">{n.nonce}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabsContent>

      <TabsContent value="classes" className="mt-2 text-xs">
        {classCount === 0 && <EmptyHint label="classes" />}
        {diff.declaredClasses.length > 0 && (
          <div className="mb-2">
            <div className="text-[11px] text-muted-foreground mb-1">Declared</div>
            <ul className="space-y-1">
              {diff.declaredClasses.map((c) => (
                <li
                  key={c.classHash}
                  className="font-mono text-[11px] break-all"
                >
                  {c.classHash} · compiled {c.compiledClassHash}
                </li>
              ))}
            </ul>
          </div>
        )}
        {diff.classHashUpdates.length > 0 && (
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Replaced</div>
            <ul className="space-y-1">
              {diff.classHashUpdates.map((c) => (
                <li
                  key={c.contractAddress}
                  className="font-mono text-[11px] break-all"
                >
                  {c.contractAddress} → {c.classHash}
                </li>
              ))}
            </ul>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
};

export default StateDiffTabs;
