// Starknet Summary tab: transaction I/O and token movement rollups.

import { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import type { StarknetNetwork } from "@/config/networkConfig";
import type {
  AbiTypeDef,
  FunctionInvocation,
  SimulationEvent,
  SimulationResult,
} from "@/chains/starknet/simulatorTypes";
import {
  TOKEN_META,
  contractLabel,
  decodeU256,
  eventName,
  formatTokenAmount,
  frameLabel,
  normalizeAddr,
  selectorName,
  shortHex,
  walkInvocations,
} from "./decoders";
import { useContractName } from "@/chains/starknet/contractNameClient";
import {
  buildDecodedArgs,
  buildDecodedSignature,
  buildRawFeltSummary,
} from "./decodeFunctionSig";
import { ContractAddress } from "./ContractAddress";
import { TokenIcon } from "./TokenIcon";
import {
  computeUsdValue,
  formatUsdValue,
  getStarknetTokenRegistryEntry,
  getTokenPriceUsd,
  useStarknetTokenPriceRegistry,
} from "@/lib/starknet-token-prices";
import { useTokenIcon } from "@/lib/starknet-token-icons";

interface DecodedTransfer {
  token: string;
  from: string;
  to: string;
  kind: string;
  amount: bigint;
  tokenId?: bigint;
  frame: FunctionInvocation;
  order: number;
}

function isZero(a: string): boolean {
  try {
    return BigInt(a) === 0n;
  } catch {
    return false;
  }
}

function safeFeltLen(felt: string | undefined): number {
  try {
    const n = Number(BigInt(felt ?? "0x0"));
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, 256);
  } catch {
    return 0;
  }
}

function decodedEventFieldNames(ev: SimulationEvent): string[] {
  return (ev.decodedEventAbi?.fields ?? []).map((field) =>
    field.name.toLowerCase(),
  );
}

function isLikelyErc721Transfer(ev: SimulationEvent, data: string[]): boolean {
  const fields = decodedEventFieldNames(ev);
  if (
    fields.some((field) =>
      field === "token_id" ||
      field === "tokenid" ||
      field.endsWith("::token_id") ||
      field.endsWith("::tokenid")
    )
  ) {
    return true;
  }
  if (fields.some((field) => field === "value" || field === "amount")) {
    return false;
  }
  return data.length === 1;
}

function deriveTransfers(result: SimulationResult): DecodedTransfer[] {
  const out: DecodedTransfer[] = [];
  let order = 0;
  for (const f of walkInvocations(result)) {
    for (const ev of (f.events || []) as SimulationEvent[]) {
      const name = eventName(ev);
      if (name === "Transfer" && ev.keys.length >= 3) {
        const data = ev.data || [];
        const isErc721 = isLikelyErc721Transfer(ev, data);
        const tokenId = isErc721
          ? data.length >= 2
            ? decodeU256(data[0], data[1])
            : BigInt(data[0] ?? "0")
          : undefined;
        const amount = isErc721 ? 1n : decodeU256(data[0], data[1]);
        out.push({
          token: ev.fromAddress,
          from: ev.keys[1],
          to: ev.keys[2],
          kind: isErc721 ? `ERC721 #${tokenId}` : "ERC20",
          amount,
          tokenId,
          frame: f,
          order: order++,
        });
      } else if (name === "TransferSingle" && ev.keys.length >= 4) {
        const d = ev.data || [];
        const tokenId = decodeU256(d[0], d[1]);
        const value = decodeU256(d[2], d[3]);
        out.push({
          token: ev.fromAddress,
          from: ev.keys[2],
          to: ev.keys[3],
          kind: `ERC1155 #${tokenId}`,
          amount: value,
          tokenId,
          frame: f,
          order: order++,
        });
      } else if (name === "TransferBatch" && ev.keys.length >= 4) {
        const d = ev.data || [];
        let i = 0;
        const idsLen = safeFeltLen(d[i++]);
        const ids: bigint[] = [];
        for (let j = 0; j < idsLen; j++) ids.push(decodeU256(d[i++], d[i++]));
        const valuesLen = safeFeltLen(d[i++]);
        const values: bigint[] = [];
        for (let j = 0; j < valuesLen; j++) values.push(decodeU256(d[i++], d[i++]));
        for (let j = 0; j < ids.length; j++) {
          out.push({
            token: ev.fromAddress,
            from: ev.keys[2],
            to: ev.keys[3],
            kind: `ERC1155 #${ids[j]} (batch)`,
            amount: values[j] ?? 0n,
            tokenId: ids[j],
            frame: f,
            order: order++,
          });
        }
      }
    }
  }
  return out;
}

interface SummaryPanelProps {
  result: SimulationResult;
  frames: FunctionInvocation[];
  types?: Record<string, AbiTypeDef>;
  network?: StarknetNetwork;
  onJumpToFrame?: (frame: FunctionInvocation) => void;
}

export function SummaryPanel({
  result,
  types,
  network,
}: SummaryPanelProps) {
  const transfers = useMemo(() => deriveTransfers(result), [result]);
  const topFrame = result.executeInvocation || result.validateInvocation || null;

  return (
    <div className="space-y-5">
      <InputOutputSection frame={topFrame} result={result} types={types} />
      <TokenMovementsSection transfers={transfers} network={network} />
    </div>
  );
}

function FlatSectionHeader({
  title,
  count,
  right,
}: {
  title: string;
  count?: number;
  right?: React.ReactNode;
}) {
  return (
    <div className="starknet-flat-section-header flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2">
        <h3 className="m-0 text-[0.9125rem] font-semibold uppercase tracking-[0.05em] text-foreground">
          {title}
        </h3>
        {typeof count === "number" && count > 0 && (
          <span
            className="px-2 py-0.5 rounded text-xs font-semibold"
            style={{
              background: "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#d4d4d4",
            }}
          >
            {count}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

function InputOutputSection({
  frame,
  result,
  types,
}: {
  frame: FunctionInvocation | null;
  result: SimulationResult;
  types?: Record<string, AbiTypeDef>;
}) {
  const [inputView, setInputView] = useState<"decoded" | "raw">("decoded");
  const [outputView, setOutputView] = useState<"decoded" | "raw">("decoded");
  const [inputExpanded, setInputExpanded] = useState(true);
  const [outputExpanded, setOutputExpanded] = useState(true);

  if (!frame) {
    return (
      <section data-summary-section="io" className="exec-io-section">
        <div className="exec-io-empty">
          <p>No execute / validate invocation present in this result.</p>
        </div>
      </section>
    );
  }

  const calldata = frame.calldata || [];
  const returnFelts = (frame.result || []) as string[];
  const innerCalls = (frame.calls || []) as FunctionInvocation[];
  const decodedTargets = innerCalls.length > 0 ? innerCalls : [frame];

  const decodedRawJson = JSON.stringify(
    decodedTargets.map((c) => ({
      contract: frameLabel(c) || c.contractAddress,
      function: selectorName(c) || c.entryPointSelector,
      args: c.decodedFunctionAbi?.inputs?.length
        ? buildDecodedArgs(
            c.decodedFunctionAbi.inputs,
            c.calldata || [],
            types,
          )
        : { rawFelts: (c.calldata || []) as string[] },
      returns: (c.result || []) as string[],
    })),
    null,
    2,
  );

  return (
    <section data-summary-section="io" className="exec-io-section">
      <div className="exec-io-container">
        {/* INPUT panel */}
        <div className="exec-io-panel">
          <div className="exec-io-header">
            <span>INPUT</span>
            <div className="exec-io-header-actions">
              <div className="exec-io-view-toggle">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`exec-io-view-btn ${
                    inputView === "decoded" ? "active" : ""
                  }`}
                  onClick={() => setInputView("decoded")}
                >
                  Decoded
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`exec-io-view-btn ${
                    inputView === "raw" ? "active" : ""
                  }`}
                  onClick={() => setInputView("raw")}
                >
                  Raw
                </Button>
              </div>
              <CopyButton
                ariaLabel={`Copy ${inputView} input`}
                value={
                  inputView === "decoded"
                    ? decodedRawJson
                    : JSON.stringify(calldata)
                }
              />
            </div>
          </div>
          <div className="exec-io-content">
            {inputView === "decoded" ? (
              <>
                <div
                  className="exec-io-tree-toggle"
                  onClick={() => setInputExpanded((v) => !v)}
                >
                  <span className={`exec-io-caret ${inputExpanded ? "expanded" : ""}`}>
                    {inputExpanded ? (
                      <CaretDown size={12} />
                    ) : (
                      <CaretRight size={12} />
                    )}
                  </span>
                  <span className="exec-io-bracket">{"{"}</span>
                </div>
                {inputExpanded && (
                  <div className="exec-io-tree-content">
                    <DecodedCallsView calls={decodedTargets} types={types} />
                  </div>
                )}
                <span className="exec-io-bracket">{"}"}</span>
              </>
            ) : (
              <RawFeltList felts={calldata} />
            )}
          </div>
        </div>

        {/* OUTPUT panel */}
        <div className="exec-io-panel">
          <div className="exec-io-header">
            <span>OUTPUT</span>
            <div className="exec-io-header-actions">
              <div className="exec-io-view-toggle">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`exec-io-view-btn ${
                    outputView === "decoded" ? "active" : ""
                  }`}
                  onClick={() => setOutputView("decoded")}
                >
                  Decoded
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`exec-io-view-btn ${
                    outputView === "raw" ? "active" : ""
                  }`}
                  onClick={() => setOutputView("raw")}
                >
                  Raw
                </Button>
              </div>
              <CopyButton
                ariaLabel={`Copy ${outputView} output`}
                value={
                  outputView === "decoded"
                    ? JSON.stringify(
                        decodedTargets.map((c) => ({
                          call:
                            (frameLabel(c) || c.contractAddress) +
                            "." +
                            (selectorName(c) || c.entryPointSelector),
                          returns: decodedReturnsForCall(c, types),
                        })),
                        null,
                        2,
                      )
                    : JSON.stringify(returnFelts)
                }
              />
            </div>
          </div>
          <div className="exec-io-content">
            {outputView === "decoded" ? (
              <>
                <div
                  className="exec-io-tree-toggle"
                  onClick={() => setOutputExpanded((v) => !v)}
                >
                  <span className={`exec-io-caret ${outputExpanded ? "expanded" : ""}`}>
                    {outputExpanded ? (
                      <CaretDown size={12} />
                    ) : (
                      <CaretRight size={12} />
                    )}
                  </span>
                  <span className="exec-io-bracket">{"{"}</span>
                </div>
                {outputExpanded && (
                  <div className="exec-io-tree-content">
                    <DecodedReturnsView calls={decodedTargets} types={types} />
                  </div>
                )}
                <span className="exec-io-bracket">{"}"}</span>
              </>
            ) : (
              <RawFeltList felts={returnFelts} />
            )}
          </div>
        </div>
      </div>

      {result.revertReason && (
        <div
          style={{
            marginTop: 8,
            padding: 8,
            border: "1px solid rgba(239,68,68,0.4)",
            background: "rgba(239,68,68,0.05)",
            borderRadius: 4,
            fontFamily: "var(--font-mono, monospace)",
            fontSize: 12,
            color: "rgb(239,68,68)",
            wordBreak: "break-all",
          }}
        >
          {result.revertReason}
        </div>
      )}
    </section>
  );
}

function DecodedCallsView({
  calls,
  types,
}: {
  calls: FunctionInvocation[];
  types?: Record<string, AbiTypeDef>;
}) {
  if (calls.length === 0) {
    return <div className="exec-io-empty"><p>No calls</p></div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {calls.length > 1 && (
        <div
          style={{
            fontSize: 11,
            opacity: 0.7,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Multicall · {calls.length} calls
        </div>
      )}
      {calls.map((c, i) => {
        const contract = frameLabel(c) || shortHex(c.contractAddress, 8, 6);
        const fnName = selectorName(c) || `unknown(${shortHex(c.entryPointSelector, 6, 4)})`;
        const sigBody = c.decodedFunctionAbi?.inputs?.length
          ? buildDecodedSignature(
              "",
              c.decodedFunctionAbi.inputs,
              c.calldata || [],
              types,
              999,
            )
          : buildRawFeltSummary("", c.calldata || [], 999);
        return (
          <div
            key={i}
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            <div style={{ opacity: 0.85 }}>
              {calls.length > 1 && (
                <span style={{ opacity: 0.55, marginRight: 6 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
              )}
              <span style={{ color: "var(--accent-foreground, #93c5fd)" }}>{contract}</span>
              <span style={{ opacity: 0.5 }}>.</span>
              <span style={{ fontWeight: 600 }}>{fnName}</span>
            </div>
            <div
              style={{
                marginTop: 4,
                paddingLeft: 18,
                opacity: 0.92,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {sigBody || "()"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function decodedReturnsForCall(
  call: FunctionInvocation,
  types?: Record<string, AbiTypeDef>,
) {
  const ret = (call.result || []) as string[];
  const outputs = call.decodedFunctionAbi?.outputs ?? [];
  if (outputs.length === 0) return ret;
  return buildDecodedArgs(outputs, ret, types);
}

function formatDecodedReturns(
  call: FunctionInvocation,
  types?: Record<string, AbiTypeDef>,
): string {
  const ret = (call.result || []) as string[];
  const outputs = call.decodedFunctionAbi?.outputs ?? [];
  if (ret.length === 0) return "()";
  if (outputs.length === 0) return ret.join(", ");
  const decoded = buildDecodedArgs(outputs, ret, types);
  if (decoded.length === 1 && !outputs[0]?.name) {
    return decoded[0].value;
  }
  return decoded
    .map((item) => `${item.name || "return"}: ${item.value}`)
    .join(", ");
}

function DecodedReturnsView({
  calls,
  types,
}: {
  calls: FunctionInvocation[];
  types?: Record<string, AbiTypeDef>;
}) {
  if (calls.length === 0) {
    return <div className="exec-io-empty"><p>No return data</p></div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {calls.map((c, i) => {
        const ret = (c.result || []) as string[];
        const fnName = selectorName(c) || `unknown(${shortHex(c.entryPointSelector, 6, 4)})`;
        const rendered = formatDecodedReturns(c, types);
        return (
          <div
            key={i}
            style={{
              fontFamily: "var(--font-mono, monospace)",
              fontSize: 12,
              lineHeight: 1.5,
            }}
          >
            {calls.length > 1 && (
              <span style={{ opacity: 0.55, marginRight: 6 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
            )}
            <span style={{ fontWeight: 600 }}>{fnName}</span>
            <span style={{ opacity: 0.5 }}> → </span>
            {ret.length === 0 ? (
              <span style={{ opacity: 0.5 }}>()</span>
            ) : (
              <span style={{ wordBreak: "break-all" }}>{rendered}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RawFeltList({ felts }: { felts: string[] }) {
  if (felts.length === 0) {
    return <div className="exec-io-empty"><p>—</p></div>;
  }
  return (
    <div
      style={{
        fontFamily: "var(--font-mono, monospace)",
        fontSize: 11,
        lineHeight: 1.5,
        maxHeight: 240,
        overflow: "auto",
      }}
    >
      <div
        style={{
          fontSize: 10,
          opacity: 0.6,
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {felts.length} felt{felts.length === 1 ? "" : "s"}
      </div>
      {felts.map((f, i) => (
        <div key={i} style={{ display: "flex", gap: 8, wordBreak: "break-all" }}>
          <span style={{ opacity: 0.5, fontVariantNumeric: "tabular-nums" }}>
            {String(i).padStart(2, "0")}
          </span>
          <span>{f}</span>
        </div>
      ))}
    </div>
  );
}

type GroupMode = "address" | "chronological";

interface TokenMeta {
  symbol: string;
  name: string | null;
  decimals: number;
}

function fallbackTokenDecimals(kind: string): number {
  return kind.startsWith("ERC721") || kind.startsWith("ERC1155") ? 0 : 18;
}

function tokenMetaFor(token: string, kind: string): TokenMeta {
  const registry = getStarknetTokenRegistryEntry(token);
  const staticMeta = TOKEN_META[normalizeAddr(token)] ?? TOKEN_META[token.toLowerCase()];
  const knownLabel = contractLabel(token);
  const symbol =
    registry?.symbol ??
    staticMeta?.symbol ??
    knownLabel ??
    shortHex(token, 6, 4);
  return {
    symbol,
    name: registry?.name ?? staticMeta?.name ?? knownLabel ?? null,
    decimals:
      registry?.decimals ??
      staticMeta?.decimals ??
      fallbackTokenDecimals(kind),
  };
}

function usableSymbol(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "?") return null;
  if (/^0x/i.test(trimmed) || trimmed.includes("…")) return null;
  return trimmed;
}

function TokenMovementsSection({
  transfers,
  network,
}: {
  transfers: DecodedTransfer[];
  network?: StarknetNetwork;
}) {
  const [groupMode, setGroupMode] = useState<GroupMode>("address");
  const [expanded, setExpanded] = useState(true);

  useStarknetTokenPriceRegistry();

  type Row = {
    address: string;
    token: string;
    symbol: string;
    decimals: number;
    delta: bigint;
    kind: string;
    order: number;
    direction: "in" | "out";
  };
  const rows: Row[] = [];
  for (const t of transfers) {
    const meta = tokenMetaFor(t.token, t.kind);
    const addAccount = (
      acc: string,
      sign: 1n | -1n,
      direction: "in" | "out",
    ) => {
      if (isZero(acc)) return;
      rows.push({
        address: acc,
        token: t.token,
        symbol: meta.symbol,
        decimals: meta.decimals,
        delta: sign * t.amount,
        kind: t.kind,
        order: t.order,
        direction,
      });
    };
    addAccount(t.from, -1n, "out");
    addAccount(t.to, 1n, "in");
  }
  const erc20Count = rows.filter((r) => r.kind === "ERC20").length;
  const erc721Count = rows.filter((r) => r.kind.startsWith("ERC721")).length;
  const erc1155Count = rows.filter((r) => r.kind.startsWith("ERC1155")).length;

  const sortedRows =
    groupMode === "chronological"
      ? [...rows].sort((a, b) => a.order - b.order)
      : [...rows].sort((a, b) => {
          const aa = a.address.toLowerCase();
          const bb = b.address.toLowerCase();
          if (aa !== bb) return aa < bb ? -1 : 1;
          if (a.order !== b.order) return a.order - b.order;
          return a.symbol.localeCompare(b.symbol);
        });

  return (
    <section data-summary-section="tokens">
      <FlatSectionHeader
        title="Token Movements"
        count={rows.length}
        right={
          transfers.length > 0 && (
            <div className="starknet-token-toolbar flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                data-testid="toggle-token-movements"
              >
                {expanded ? (
                  <CaretDown size={12} className="mr-1" />
                ) : (
                  <CaretRight size={12} className="mr-1" />
                )}
                {expanded ? "Fold" : "Show"}
              </Button>
              <NetUsdIndicator transfers={transfers} />
              {erc20Count > 0 && (
                <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                  ERC-20({erc20Count})
                </Badge>
              )}
              {erc721Count > 0 && (
                <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                  ERC-721({erc721Count})
                </Badge>
              )}
              {erc1155Count > 0 && (
                <Badge variant="outline" size="sm" className="font-mono text-[10px]">
                  ERC-1155({erc1155Count})
                </Badge>
              )}
              <GroupByToggle value={groupMode} onChange={setGroupMode} />
            </div>
          )
        }
      />
      {transfers.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No <span className="font-mono">Transfer</span> events emitted.
        </div>
      ) : expanded ? (
        <div className="sim-balance-changes">
          <table className="sim-balance-changes__table">
            <thead>
              <tr>
                <th>Address</th>
                <th>Asset</th>
                <th className="text-right">Balance Change</th>
                <th className="text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              <TokenMovementsBody rows={sortedRows} network={network} />
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          {rows.length.toLocaleString()} movement{rows.length === 1 ? "" : "s"} hidden.
        </div>
      )}
    </section>
  );
}

interface MovementRow {
  address: string;
  token: string;
  symbol: string;
  decimals: number;
  delta: bigint;
  kind: string;
  order: number;
  direction: "in" | "out";
}

function TokenMovementsBody({
  rows,
  network,
}: {
  rows: MovementRow[];
  network?: StarknetNetwork;
}) {
  return (
    <>
      {rows.map((r, i) => (
        <TokenMovementRow key={i} row={r} network={network} />
      ))}
    </>
  );
}

function TokenMovementRow({
  row,
  network,
}: {
  row: MovementRow;
  network?: StarknetNetwork;
}) {
  const tokenInfo = useTokenIcon(row.token);
  const { name: onchainLabel } = useContractName(row.token, network);
  const displaySymbol =
    usableSymbol(tokenInfo?.symbol) ??
    usableSymbol(row.symbol) ??
    onchainLabel ??
    row.symbol;
  const displayName = tokenInfo?.name || onchainLabel || row.symbol;
  const decimals = tokenInfo?.decimals ?? row.decimals;
  const priceUsd = getTokenPriceUsd(row.token);
  const negative = row.delta < 0n;
  const positive = row.delta > 0n;
  const absDelta = negative ? -row.delta : row.delta;
  const sign = negative ? "-" : positive ? "+" : "";
  const amountClass = positive
    ? "sim-amount--positive"
    : negative
    ? "sim-amount--negative"
    : "";

  const usdValue =
    row.kind === "ERC20"
      ? computeUsdValue(row.delta, decimals, priceUsd)
      : null;
  const usdLabel = formatUsdValue(usdValue);
  const usdClass =
    usdValue === null
      ? "text-muted-foreground"
      : usdValue > 0
      ? "sim-amount--positive"
      : usdValue < 0
      ? "sim-amount--negative"
      : "";

  const friendly = contractLabel(row.address);
  const DirectionIcon = row.direction === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <tr>
      <td className="sim-address">
        <span className="inline-flex items-center gap-2">
          <span
            className={`inline-flex h-4 w-4 items-center justify-center rounded-sm ${
              row.direction === "in"
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
            title={row.direction === "in" ? "Incoming" : "Outgoing"}
          >
            <DirectionIcon size={11} weight="bold" />
          </span>
          <ContractAddress
            addr={row.address}
            precomputedLabel={friendly}
            head={8}
            tail={6}
            network={network}
          />
        </span>
      </td>
      <td>
        <span className="inline-flex items-center gap-2" title={displayName}>
          <TokenIcon addr={row.token} size={16} symbol={displaySymbol} />
          <span className="font-semibold">{displaySymbol}</span>
          <span className="text-muted-foreground text-[10px]">{row.kind}</span>
        </span>
      </td>
      <td className={`text-right ${amountClass}`}>
        {sign}
        {formatTokenAmount(absDelta, decimals)}
      </td>
      <td className={`text-right ${usdClass}`}>{usdLabel}</td>
    </tr>
  );
}

function NetUsdIndicator({ transfers }: { transfers: DecodedTransfer[] }) {
  type Key = string;
  const deltas = new Map<Key, { token: string; decimals: number; delta: bigint; kind: string }>();
  for (const t of transfers) {
    const meta = tokenMetaFor(t.token, t.kind);
    const apply = (acc: string, sign: 1n | -1n) => {
      if (isZero(acc)) return;
      const k = `${acc.toLowerCase()}|${t.token.toLowerCase()}`;
      const cur = deltas.get(k) || {
        token: t.token,
        decimals: meta.decimals,
        delta: 0n,
        kind: t.kind,
      };
      cur.delta += sign * t.amount;
      deltas.set(k, cur);
    };
    apply(t.from, -1n);
    apply(t.to, 1n);
  }

  let total = 0;
  let priced = 0;
  for (const v of deltas.values()) {
    if (v.kind !== "ERC20") continue;
    const price = getTokenPriceUsd(v.token);
    if (price === null) continue;
    const usd = computeUsdValue(v.delta, v.decimals, price);
    if (usd === null) continue;
    total += usd;
    priced += 1;
  }
  if (priced === 0) return null;

  const cls =
    total > 0
      ? "sim-amount--positive"
      : total < 0
      ? "sim-amount--negative"
      : "text-muted-foreground";
  const sign = total > 0 ? "+" : "";
  return (
    <span
      className={`font-mono text-[11px] ${cls}`}
      title="Net USD value across all Transfer events in this transaction"
    >
      Net: {sign}
      {formatUsdValue(total, { signed: false })}
    </span>
  );
}

function GroupByToggle({
  value,
  onChange,
}: {
  value: GroupMode;
  onChange: (v: GroupMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="uppercase tracking-[0.08em]">Group by:</span>
      <div className="inline-flex rounded-md border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => onChange("address")}
          aria-pressed={value === "address"}
          className={`px-2 py-0.5 text-[11px] ${
            value === "address"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Address
        </button>
        <button
          type="button"
          onClick={() => onChange("chronological")}
          aria-pressed={value === "chronological"}
          className={`px-2 py-0.5 text-[11px] border-l border-border ${
            value === "chronological"
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Chronologically
        </button>
      </div>
    </div>
  );
}

export function CallTypeBadge({ kind }: { kind: string }) {
  const k = (kind || "CALL").toUpperCase();
  const variant: React.ComponentProps<typeof Badge>["variant"] =
    k === "DELEGATE" || k === "LIBRARY_CALL"
      ? "warning"
      : k === "L1_HANDLER"
      ? "info"
      : k === "CONSTRUCTOR"
      ? "success"
      : "outline";
  return (
    <Badge
      variant={variant}
      size="sm"
      className="font-mono text-[9px] tracking-wider uppercase"
    >
      {k.replace("_", " ")}
    </Badge>
  );
}

export function CallTypeGutterBadge({ kind }: { kind: string }) {
  const k = (kind || "CALL").toUpperCase();
  const colors: Record<string, { bg: string; border: string; text: string }> = {
    CALL: {
      bg: "rgba(34,197,94,0.10)",
      border: "rgba(34,197,94,0.45)",
      text: "#86efac",
    },
    DELEGATE: {
      bg: "rgba(251,146,60,0.10)",
      border: "rgba(251,146,60,0.45)",
      text: "#fdba74",
    },
    LIBRARY_CALL: {
      bg: "rgba(168,85,247,0.10)",
      border: "rgba(168,85,247,0.45)",
      text: "#d8b4fe",
    },
    STATIC: {
      bg: "rgba(96,165,250,0.10)",
      border: "rgba(96,165,250,0.45)",
      text: "#93c5fd",
    },
    L1_HANDLER: {
      bg: "rgba(34,211,238,0.10)",
      border: "rgba(34,211,238,0.45)",
      text: "#67e8f9",
    },
    CONSTRUCTOR: {
      bg: "rgba(132,204,22,0.10)",
      border: "rgba(132,204,22,0.45)",
      text: "#bef264",
    },
  };
  const c = colors[k] || colors.CALL;
  const label = k.replace("_", " ");
  return (
    <span
      className="inline-flex items-center justify-center font-mono text-[10px] font-semibold uppercase tracking-[0.05em] rounded-sm"
      style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        padding: "2px 6px",
        minWidth: 80,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
