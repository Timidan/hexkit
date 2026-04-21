import React from "react";

// HexKit design-system samples page.
// Tokens mirror /tmp/anthropic-design-v2/hexkit-design-system/project/colors_and_type.css.
// All styles are scoped under `.hk-root.dark` so they don't leak into the rest of the app.

const KIT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&display=swap');

.hk-root.dark {
  --bg-primary: #0a0a0a;
  --bg-secondary: #171717;
  --bg-tertiary: #262626;
  --bg-elevated: #1c1c1c;
  --bg-glass: rgba(23,23,23,0.9);
  --bg-card: rgba(38,38,38,0.95);

  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --text-tertiary: #71717a;
  --text-muted: #52525b;
  --text-accent: #d4d4d4;

  --border-primary: rgba(255,255,255,0.10);
  --border-secondary: rgba(255,255,255,0.05);
  --border-accent: rgba(255,255,255,0.30);
  --border-focus: rgba(255,255,255,0.50);

  --accent-primary-10: rgba(255,255,255,0.10);
  --accent-primary-20: rgba(255,255,255,0.20);
  --accent-primary-30: rgba(255,255,255,0.30);

  --success: #22c55e;
  --warning: #f59e0b;
  --error: #ef4444;

  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, monospace;

  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-body);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: 'cv11','ss01';
}

.hk-root * { box-sizing: border-box; }

.hk-root .mono { font-family: var(--font-mono); }
.hk-root .brand-wordmark {
  font-family: var(--font-mono);
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.hk-root .label-caps {
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
  color: var(--text-tertiary);
  font-weight: 500;
}

.hk-root .constellation {
  position: absolute; inset: 0; pointer-events: none; z-index: 0;
  background-image:
    radial-gradient(circle at 1px 1px, rgba(255,255,255,0.055) 1px, transparent 0),
    radial-gradient(circle at 18px 18px, rgba(255,255,255,0.03) 1px, transparent 0);
  background-size: 36px 36px, 72px 72px;
  -webkit-mask-image: radial-gradient(ellipse at 50% 0%, black 55%, transparent 95%);
          mask-image: radial-gradient(ellipse at 50% 0%, black 55%, transparent 95%);
}

.hk-root .topbar {
  position: sticky; top: 0; z-index: 10;
  background: var(--bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border-primary);
}

.hk-root .hk-card {
  background: var(--bg-card);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.3);
}
.hk-root .hk-card-elevated {
  background: var(--bg-elevated);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: 0 10px 15px rgba(0,0,0,0.3);
}
.hk-root .hk-card-accent {
  background: rgba(255,255,255,0.05);
  border: 1px solid var(--accent-primary-20);
  border-radius: 12px;
}
.hk-root .hk-card-glass {
  background: var(--bg-glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
}

.hk-root .hk-btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-family: var(--font-body); font-weight: 500; font-size: 13px;
  border-radius: 8px; padding: 9px 14px;
  border: 1px solid transparent; cursor: pointer;
  transition: all 150ms ease; white-space: nowrap; line-height: 1;
}
.hk-root .hk-btn-primary { background: #fafafa; color: #0a0a0a; }
.hk-root .hk-btn-primary:hover { background: rgba(250,250,250,0.9); }
.hk-root .hk-btn-secondary { background: #262626; color: #fafafa; border-color: rgba(255,255,255,0.10); }
.hk-root .hk-btn-secondary:hover { background: #2e2e2e; }
.hk-root .hk-btn-outline { background: transparent; color: #fafafa; border-color: rgba(255,255,255,0.20); }
.hk-root .hk-btn-outline:hover { background: rgba(255,255,255,0.05); }
.hk-root .hk-btn-ghost { background: transparent; color: #a1a1aa; }
.hk-root .hk-btn-ghost:hover { background: #262626; color: #fafafa; }
.hk-root .hk-btn:active { transform: scale(0.96); }

.hk-root .hk-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px; border-radius: 9999px;
  font-size: 11px; font-weight: 500;
  border: 1px solid; line-height: 1;
}
.hk-root .pill-default { background: #262626; color: #a1a1aa; border-color: rgba(255,255,255,0.10); }
.hk-root .pill-success { background: rgba(34,197,94,0.18); color: #bbf7d0; border-color: rgba(34,197,94,0.30); }
.hk-root .pill-warning { background: rgba(245,158,11,0.15); color: #facc15; border-color: rgba(245,158,11,0.35); }
.hk-root .pill-error   { background: rgba(239,68,68,0.18); color: #fecaca; border-color: rgba(239,68,68,0.35); }
.hk-root .pill-accent  { background: rgba(255,255,255,0.08); color: #ffffff; border-color: rgba(255,255,255,0.20); }
.hk-root .pill-mono {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.hk-root .dot { width: 6px; height: 6px; border-radius: 9999px; background: currentColor; }
.hk-root .dot-glow { box-shadow: 0 0 8px currentColor; }

.hk-root .hk-kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 6px;
  border: 1px solid rgba(255,255,255,0.15); background: #262626; color: #a1a1aa;
  border-radius: 4px; font-family: var(--font-mono); font-size: 11px;
}

.hk-root .hk-input {
  width: 100%;
  background: #171717;
  border: 1px solid rgba(255,255,255,0.10);
  border-radius: 12px;
  padding: 11px 14px;
  color: #fafafa;
  font-family: var(--font-body);
  font-size: 13px; outline: none;
  transition: all 150ms ease;
}
.hk-root .hk-input:focus { border-color: rgba(255,255,255,0.50); box-shadow: 0 0 0 2px rgba(255,255,255,0.20); }

.hk-root .divider-h { height: 1px; background: var(--border-primary); width: 100%; }
.hk-root .divider-dash { border-top: 1px dashed var(--border-primary); width: 100%; }
`;

// ─────────────────────────────────────────────────────────────────────────────
// Mock sample payload — a Yearn yvWETH deposit on Ethereum mainnet.
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE = {
  txHash: "0x329528b97cdb193f3f1c65689b8341ef33db4c04958172a6665f1381bfd1378f",
  chainId: 1,
  chainName: "Ethereum",
  block: 23127448,
  ts: "2026-04-17 14:12:07 UTC",
  status: "SUCCESS" as const,
  from: { addr: "0x1F26…9c42", label: "User (EOA)" },
  to:   { addr: "0x5f18…c3A1", label: "yvWETH · Yearn V3 Vault" },
  txType: "Vault deposit" as const,
  txCategory: "DeFi · Yield" as const,
  narrative:
    "User wrapped 2 ETH into WETH, approved the Yearn v3 yvWETH vault, then deposited the WETH and received 1.9712 yvWETH shares representing their position in the strategy.",
  transferred: [
    { dir: "OUT", token: "WETH", amount: "2.0000", usd: "$6,284.10", from: "User", to: "yvWETH" },
    { dir: "IN",  token: "yvWETH", amount: "1.9712", usd: "$6,284.10", from: "yvWETH", to: "User" },
  ],
  gas: { used: "187,432", priceGwei: "24.7", totalEth: "0.00463", totalUsd: "$14.57" },
  contracts: [
    { name: "WETH9", addr: "0xC02a…6Cc2", verified: true },
    { name: "yvWETH", addr: "0x5f18…c3A1", verified: true },
  ],
  selectors: [
    { sig: "deposit(uint256,address)", sel: "0x6e553f65" },
    { sig: "transfer(address,uint256)", sel: "0xa9059cbb" },
    { sig: "approve(address,uint256)",  sel: "0x095ea7b3" },
  ],
  confidence: 0.96,
  steps: [
    { i: 1, label: "WETH.deposit{value: 2 ETH}()",            detail: "User wraps 2 ETH → WETH9" },
    { i: 2, label: "WETH.approve(yvWETH, 2e18)",              detail: "Grants vault spending allowance" },
    { i: 3, label: "yvWETH.deposit(2e18, user)",              detail: "Transfers WETH in, mints shares" },
    { i: 4, label: "yvWETH.transfer(user, 1.9712e18)",        detail: "Shares delivered to user" },
  ],
  // A fuller activity trace — mix of transfers, calls, events, approvals —
  // used by Sample 10's right-rail feed to prove it scales past 2 rows.
  activities: [
    { kind: "eth",      dir: "out", label: "ETH wrapped into WETH",      sub: "User → WETH9",             value: "2.0000 ETH",        valueSub: "$6,284.10" },
    { kind: "call",                label: "WETH.deposit{value:2e18}()",  sub: "wrap native · WETH9",      value: "0xd0e30db0" },
    { kind: "event",               label: "Deposit(dst, wad)",           sub: "WETH9 · topic0 0xe1ff…",   value: "log #14" },
    { kind: "approve",             label: "Allowance set → yvWETH",      sub: "User · WETH9.approve",     value: "2.0000 WETH" },
    { kind: "call",                label: "yvWETH.deposit(2e18, user)",  sub: "Yearn V3 vault entrypoint", value: "0x6e553f65" },
    { kind: "call",                label: "ERC20.transferFrom pull",     sub: "yvWETH ← User (WETH9)",    value: "0x23b872dd" },
    { kind: "transfer", dir: "out", label: "WETH sent to yvWETH",         sub: "User → yvWETH",            value: "2.0000 WETH",       valueSub: "$6,284.10" },
    { kind: "event",               label: "Transfer(User, yvWETH, 2e18)", sub: "WETH9 · topic0 0xddf2…",   value: "log #27" },
    { kind: "transfer", dir: "in",  label: "yvWETH shares minted",        sub: "yvWETH → User",            value: "1.9712 yvWETH",     valueSub: "$6,284.10" },
    { kind: "event",               label: "Deposit(sender, owner, assets, shares)", sub: "yvWETH · topic0 0xdcbc…", value: "log #31" },
    { kind: "call",                label: "Strategy harvest hook",       sub: "yvWETH · delegatecall",    value: "0x4641257d" },
    { kind: "transfer", dir: "in",  label: "Reward dust",                 sub: "yvWETH → User",            value: "0.0001 CRV",        valueSub: "$0.12" },
    { kind: "approve",             label: "Allowance cleared",           sub: "User · WETH9.approve",     value: "0" },
    { kind: "event",               label: "Harvested(strategy, profit)", sub: "yvWETH · topic0 0x4c09…",  value: "log #34" },
  ] as ReadonlyArray<{
    kind: "transfer" | "eth" | "call" | "event" | "approve";
    dir?: "in" | "out";
    label: string;
    sub?: string;
    value?: string;
    valueSub?: string;
  }>,
};

// Small inline icons (phosphor-style 2px stroke).
const I = {
  arrowUp: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
  ),
  arrowDown: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
  ),
  arrowRight: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
  ),
  copy: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  hex: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7Z"/></svg>
  ),
  spark: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v6"/><path d="M12 16v6"/><path d="M4.93 4.93l4.24 4.24"/><path d="M14.83 14.83l4.24 4.24"/><path d="M2 12h6"/><path d="M16 12h6"/><path d="M4.93 19.07l4.24-4.24"/><path d="M14.83 9.17l4.24-4.24"/></svg>
  ),
  flow: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h13"/><path d="M16 6l-3 -3"/><path d="M16 6l-3 3"/><path d="M21 18H8"/><path d="M8 18l3 -3"/><path d="M8 18l3 3"/></svg>
  ),
  check: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
  ),
  clock: (p: { size?: number } = {}) => (
    <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared fragments
// ─────────────────────────────────────────────────────────────────────────────

const TxTypeBadge: React.FC = () => (
  <span className="hk-pill pill-accent">
    <I.hex size={11} /> {SAMPLE.txType}
  </span>
);

const StatusBadge: React.FC = () => (
  <span className="hk-pill pill-success">
    <span className="dot dot-glow" /> {SAMPLE.status}
  </span>
);

const ConfidenceChip: React.FC = () => (
  <span className="hk-pill pill-mono pill-default">
    CONF {(SAMPLE.confidence * 100).toFixed(0)}%
  </span>
);

const AddrMono: React.FC<{ addr: string; label?: string }> = ({ addr, label }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "#a1a1aa" }}>
    {label && <span style={{ color: "#fafafa", fontFamily: "var(--font-body)", fontWeight: 500, fontSize: 12 }}>{label}</span>}
    <span>{addr}</span>
    <button
      className="hk-btn hk-btn-ghost"
      style={{ padding: 4, color: "#71717a" }}
      aria-label="copy"
    >
      <I.copy size={11} />
    </button>
  </span>
);

const MicroLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="label-caps">{children}</div>
);

// ─────────────────────────────────────────────────────────────────────────────
// 10 sample layouts
// ─────────────────────────────────────────────────────────────────────────────

type SampleShell = React.FC<{ id: string; title: string; children: React.ReactNode }>;

const Shell: SampleShell = ({ id, title, children }) => (
  <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span className="mono" style={{ fontSize: 11, color: "#52525b", letterSpacing: "0.08em" }}>{id}</span>
        <span style={{ fontSize: 14, color: "#fafafa", fontWeight: 500 }}>{title}</span>
      </div>
      <button className="hk-btn hk-btn-outline" style={{ fontSize: 12 }}>
        Pick this <I.arrowRight size={12} />
      </button>
    </div>
    {children}
  </section>
);

// ── Sample 01 · Verdict Header ─────────────────────────────────────────────
const Sample01: React.FC = () => (
  <div className="hk-card" style={{ padding: 20 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
      <TxTypeBadge />
      <StatusBadge />
      <ConfidenceChip />
      <div style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "#71717a" }}>
        {SAMPLE.ts} · block {SAMPLE.block.toLocaleString()}
      </div>
    </div>
    <div style={{ fontSize: 22, fontWeight: 600, color: "#fafafa", letterSpacing: "-0.01em", marginBottom: 6 }}>
      Deposited <span className="mono" style={{ color: "#fafafa" }}>2.0000 WETH</span> into <span className="mono">yvWETH</span>
    </div>
    <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6, marginBottom: 16, maxWidth: 680 }}>
      {SAMPLE.narrative}
    </div>
    <div className="divider-h" style={{ marginBottom: 14 }} />
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
      <div><MicroLabel>From</MicroLabel><div className="mono" style={{ fontSize: 12, color: "#fafafa", marginTop: 4 }}>{SAMPLE.from.label}</div><div className="mono" style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{SAMPLE.from.addr}</div></div>
      <div><MicroLabel>To</MicroLabel><div className="mono" style={{ fontSize: 12, color: "#fafafa", marginTop: 4 }}>{SAMPLE.to.label}</div><div className="mono" style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{SAMPLE.to.addr}</div></div>
      <div><MicroLabel>Network</MicroLabel><div style={{ fontSize: 12, color: "#fafafa", marginTop: 4 }}>{SAMPLE.chainName}</div><div className="mono" style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>chainId {SAMPLE.chainId}</div></div>
      <div><MicroLabel>Gas</MicroLabel><div className="mono" style={{ fontSize: 12, color: "#fafafa", marginTop: 4 }}>{SAMPLE.gas.totalEth} ETH</div><div className="mono" style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{SAMPLE.gas.totalUsd} · {SAMPLE.gas.priceGwei} gwei</div></div>
    </div>
  </div>
);

// ── Sample 02 · Transfer Ledger ─────────────────────────────────────────────
const Sample02: React.FC = () => (
  <div className="hk-card" style={{ padding: 0, overflow: "hidden" }}>
    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border-primary)" }}>
      <TxTypeBadge /><StatusBadge /><ConfidenceChip />
      <div style={{ marginLeft: "auto" }} className="mono" >
        <span style={{ color: "#71717a", fontSize: 11 }}>tx</span>{" "}
        <span style={{ color: "#a1a1aa", fontSize: 12 }}>{SAMPLE.txHash.slice(0, 10)}…{SAMPLE.txHash.slice(-6)}</span>
      </div>
    </div>

    <div style={{ padding: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "64px 1.1fr 1.6fr 1fr", padding: "10px 18px", borderBottom: "1px solid var(--border-secondary)" }}>
        <div className="label-caps">Dir</div>
        <div className="label-caps">Asset</div>
        <div className="label-caps">Movement</div>
        <div className="label-caps" style={{ textAlign: "right" }}>Value</div>
      </div>
      {SAMPLE.transferred.map((t, i) => {
        const isOut = t.dir === "OUT";
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1.1fr 1.6fr 1fr", padding: "14px 18px", borderBottom: i === SAMPLE.transferred.length - 1 ? "none" : "1px solid var(--border-secondary)", alignItems: "center" }}>
            <div>
              <span className={`hk-pill ${isOut ? "pill-warning" : "pill-success"}`}>
                {isOut ? <I.arrowUp size={10} /> : <I.arrowDown size={10} />} {t.dir}
              </span>
            </div>
            <div>
              <div style={{ fontSize: 13, color: "#fafafa", fontWeight: 500 }}>{t.token}</div>
              <div className="mono" style={{ fontSize: 11, color: "#71717a" }}>ERC-20</div>
            </div>
            <div className="mono" style={{ fontSize: 12, color: "#a1a1aa" }}>
              <span style={{ color: "#fafafa" }}>{t.from}</span>
              <span style={{ margin: "0 8px", color: "#52525b" }}>→</span>
              <span style={{ color: "#fafafa" }}>{t.to}</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="mono" style={{ fontSize: 14, color: "#fafafa", fontWeight: 500 }}>{t.amount}</div>
              <div className="mono" style={{ fontSize: 11, color: "#71717a" }}>{t.usd}</div>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ── Sample 03 · Flow diagram ─────────────────────────────────────────────────
const Node: React.FC<{ label: string; sub: string; accent?: boolean }> = ({ label, sub, accent }) => (
  <div className={accent ? "hk-card-accent" : "hk-card"} style={{ borderRadius: 12, padding: "12px 14px", minWidth: 168 }}>
    <div className="label-caps" style={{ marginBottom: 4 }}>{accent ? "Vault" : "Actor"}</div>
    <div style={{ fontSize: 13, color: "#fafafa", fontWeight: 500 }}>{label}</div>
    <div className="mono" style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{sub}</div>
  </div>
);
const Edge: React.FC<{ label: string; sub: string; tone?: "out" | "in" }> = ({ label, sub, tone }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 160 }}>
    <div className="mono" style={{ fontSize: 12, color: tone === "out" ? "#facc15" : "#bbf7d0" }}>{label}</div>
    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#52525b" }}>
      <span style={{ width: 80, height: 1, background: "var(--border-accent)" }} />
      <I.arrowRight size={12} />
    </div>
    <div className="mono" style={{ fontSize: 10, color: "#71717a" }}>{sub}</div>
  </div>
);
const Sample03: React.FC = () => (
  <div className="hk-card" style={{ padding: 20 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <span className="hk-pill pill-accent"><I.flow size={11} /> Flow</span>
      <TxTypeBadge />
      <StatusBadge />
      <ConfidenceChip />
    </div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Node label={SAMPLE.from.label} sub={SAMPLE.from.addr} />
      <Edge label="2.0000 WETH" sub="$6,284.10" tone="out" />
      <Node label={SAMPLE.to.label} sub={SAMPLE.to.addr} accent />
      <Edge label="1.9712 yvWETH" sub="$6,284.10" tone="in" />
      <Node label={SAMPLE.from.label} sub="Shares delivered" />
    </div>
    <div className="divider-dash" style={{ marginTop: 18, marginBottom: 14 }} />
    <div className="mono" style={{ fontSize: 12, color: "#a1a1aa", lineHeight: 1.6 }}>
      {SAMPLE.narrative}
    </div>
  </div>
);

// ── Sample 04 · Terminal block ─────────────────────────────────────────────
const Sample04: React.FC = () => (
  <div className="hk-card-elevated" style={{ padding: 0, overflow: "hidden" }}>
    <div style={{ background: "#171717", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border-primary)" }}>
      <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#ef4444" }} />
      <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#f59e0b" }} />
      <span style={{ width: 10, height: 10, borderRadius: 9999, background: "#22c55e" }} />
      <span className="mono" style={{ marginLeft: 10, fontSize: 11, color: "#71717a" }}>
        hexkit ▸ tx-analyze {SAMPLE.txHash.slice(0, 14)}…
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        <StatusBadge />
        <ConfidenceChip />
      </div>
    </div>
    <div className="mono" style={{ padding: 18, fontSize: 12, lineHeight: 1.7, color: "#d4d4d4", background: "#0a0a0a" }}>
      <div><span style={{ color: "#71717a" }}>▸ summary.verdict</span>{"  "}<span style={{ color: "#fafafa" }}>{SAMPLE.txType}</span></div>
      <div><span style={{ color: "#71717a" }}>▸ summary.category</span> <span style={{ color: "#fafafa" }}>{SAMPLE.txCategory}</span></div>
      <div><span style={{ color: "#71717a" }}>▸ summary.from</span>     <span style={{ color: "#fafafa" }}>{SAMPLE.from.addr}</span> <span style={{ color: "#52525b" }}>// {SAMPLE.from.label}</span></div>
      <div><span style={{ color: "#71717a" }}>▸ summary.to</span>       <span style={{ color: "#fafafa" }}>{SAMPLE.to.addr}</span> <span style={{ color: "#52525b" }}>// {SAMPLE.to.label}</span></div>
      <div style={{ marginTop: 10, color: "#71717a" }}>▸ transfers[]</div>
      {SAMPLE.transferred.map((t, i) => (
        <div key={i} style={{ marginLeft: 16 }}>
          <span style={{ color: t.dir === "OUT" ? "#facc15" : "#bbf7d0" }}>{t.dir.padEnd(4)}</span>{" "}
          <span style={{ color: "#fafafa" }}>{t.amount} {t.token}</span>{" "}
          <span style={{ color: "#52525b" }}>({t.usd})</span>{" "}
          <span style={{ color: "#71717a" }}>{t.from} → {t.to}</span>
        </div>
      ))}
      <div style={{ marginTop: 10, color: "#71717a" }}>▸ narrative</div>
      <div style={{ marginLeft: 16, color: "#a1a1aa", fontFamily: "var(--font-body)", maxWidth: 680 }}>
        {SAMPLE.narrative}
      </div>
      <div style={{ marginTop: 10 }}>
        <span style={{ color: "#22c55e" }}>✓</span>{" "}
        <span style={{ color: "#71717a" }}>verdict emitted · confidence</span>{" "}
        <span style={{ color: "#fafafa" }}>{(SAMPLE.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  </div>
);

// ── Sample 05 · Split header + evidence ─────────────────────────────────────
const Sample05: React.FC = () => (
  <div className="hk-card" style={{ padding: 0, overflow: "hidden" }}>
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr" }}>
      <div style={{ padding: 22, borderRight: "1px solid var(--border-primary)" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <TxTypeBadge />
          <StatusBadge />
        </div>
        <div style={{ fontSize: 20, color: "#fafafa", fontWeight: 600, lineHeight: 1.25, letterSpacing: "-0.01em", marginBottom: 8 }}>
          {SAMPLE.narrative.split(",")[0]}.
        </div>
        <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>
          {SAMPLE.narrative.split(",").slice(1).join(",").trim()}
        </div>
        <div className="divider-h" style={{ margin: "16px 0" }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {SAMPLE.transferred.map((t, i) => (
            <div key={i} className="hk-card-accent" style={{ padding: 12 }}>
              <div className="label-caps" style={{ color: t.dir === "OUT" ? "#facc15" : "#bbf7d0", marginBottom: 4 }}>{t.dir}</div>
              <div className="mono" style={{ fontSize: 16, color: "#fafafa", fontWeight: 600 }}>{t.amount}</div>
              <div className="mono" style={{ fontSize: 11, color: "#a1a1aa", marginTop: 2 }}>{t.token} · {t.usd}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: 20, background: "#171717" }}>
        <div className="label-caps" style={{ marginBottom: 10 }}>Evidence</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SAMPLE.selectors.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
              <div className="mono" style={{ fontSize: 12, color: "#fafafa" }}>{s.sig}</div>
              <span className="hk-pill pill-default pill-mono">{s.sel}</span>
            </div>
          ))}
        </div>
        <div className="divider-dash" style={{ margin: "14px 0" }} />
        <div className="label-caps" style={{ marginBottom: 10 }}>Contracts</div>
        {SAMPLE.contracts.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: "#fafafa" }}>{c.name}</div>
              <div className="mono" style={{ fontSize: 11, color: "#71717a" }}>{c.addr}</div>
            </div>
            <span className="hk-pill pill-success"><I.check size={10} /> Verified</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── Sample 06 · Metric grid ─────────────────────────────────────────────────
const Stat: React.FC<{ label: string; value: string; sub?: string; mono?: boolean }> = ({ label, value, sub, mono }) => (
  <div className="hk-card" style={{ padding: 14 }}>
    <div className="label-caps" style={{ marginBottom: 8 }}>{label}</div>
    <div className={mono ? "mono" : ""} style={{ fontSize: 20, color: "#fafafa", fontWeight: 600, letterSpacing: "-0.01em" }}>{value}</div>
    {sub && <div className="mono" style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}>{sub}</div>}
  </div>
);
const Sample06: React.FC = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <div className="hk-card-glass" style={{ padding: 18, display: "flex", alignItems: "center", gap: 12 }}>
      <TxTypeBadge />
      <StatusBadge />
      <ConfidenceChip />
      <div style={{ marginLeft: "auto" }} className="mono">
        <span style={{ color: "#71717a", fontSize: 11 }}>hash</span>{" "}
        <span style={{ color: "#fafafa", fontSize: 12 }}>{SAMPLE.txHash.slice(0, 14)}…{SAMPLE.txHash.slice(-8)}</span>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
      <Stat label="Asset Out" value="2.0000 WETH" sub="$6,284.10" mono />
      <Stat label="Asset In" value="1.9712 yvWETH" sub="$6,284.10" mono />
      <Stat label="Vault" value="yvWETH" sub="Yearn V3" />
      <Stat label="Gas" value={`${SAMPLE.gas.totalEth} ETH`} sub={SAMPLE.gas.totalUsd} mono />
      <Stat label="Block" value={SAMPLE.block.toLocaleString()} sub={SAMPLE.chainName} mono />
      <Stat label="Confidence" value={`${(SAMPLE.confidence * 100).toFixed(0)}%`} sub="Summary · Simple scan" mono />
    </div>
    <div className="hk-card" style={{ padding: 16 }}>
      <MicroLabel>Narrative</MicroLabel>
      <div style={{ marginTop: 6, fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>{SAMPLE.narrative}</div>
    </div>
  </div>
);

// ── Sample 07 · Timeline ────────────────────────────────────────────────────
const Sample07: React.FC = () => (
  <div className="hk-card" style={{ padding: 0 }}>
    <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border-primary)" }}>
      <TxTypeBadge /><StatusBadge /><ConfidenceChip />
      <div className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "#71717a", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <I.clock size={11} /> 4 inner steps
      </div>
    </div>
    <div style={{ padding: "18px 24px 22px" }}>
      {SAMPLE.steps.map((s, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 12, alignItems: "start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, minHeight: 56 }}>
            <div style={{ width: 24, height: 24, borderRadius: 9999, border: "1px solid var(--border-accent)", background: "#171717", color: "#fafafa", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-mono)", fontWeight: 600 }}>{s.i}</div>
            {i !== SAMPLE.steps.length - 1 && <div style={{ width: 1, flex: 1, background: "var(--border-primary)", marginTop: 2 }} />}
          </div>
          <div style={{ paddingBottom: 18 }}>
            <div className="mono" style={{ fontSize: 13, color: "#fafafa", fontWeight: 500 }}>{s.label}</div>
            <div style={{ fontSize: 12, color: "#a1a1aa", marginTop: 2 }}>{s.detail}</div>
          </div>
          <div style={{ paddingTop: 2 }}>
            <span className="hk-pill pill-success"><I.check size={10} /> ok</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ── Sample 08 · Narrative-first ────────────────────────────────────────────
const Sample08: React.FC = () => (
  <div className="hk-card-glass" style={{ padding: 28 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <span className="brand-wordmark" style={{ color: "#fafafa", fontSize: 13 }}>TX · SUMMARY</span>
      <span className="hk-pill pill-default pill-mono">#{SAMPLE.block.toLocaleString()}</span>
      <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
        <ConfidenceChip /><StatusBadge />
      </div>
    </div>
    <div style={{ fontSize: 28, lineHeight: 1.25, color: "#fafafa", fontWeight: 600, letterSpacing: "-0.015em", maxWidth: 720 }}>
      <span style={{ color: "#71717a" }}>This is a</span> {SAMPLE.txType.toLowerCase()}.{" "}
      <span style={{ color: "#fafafa" }}>{SAMPLE.from.label}</span>{" "}
      <span style={{ color: "#71717a" }}>deposited</span>{" "}
      <span className="mono" style={{ color: "#fafafa" }}>2.0000 WETH</span>{" "}
      <span style={{ color: "#71717a" }}>into</span>{" "}
      <span className="mono" style={{ color: "#fafafa" }}>yvWETH</span>{" "}
      <span style={{ color: "#71717a" }}>and received</span>{" "}
      <span className="mono" style={{ color: "#fafafa" }}>1.9712 yvWETH</span>{" "}
      <span style={{ color: "#71717a" }}>shares.</span>
    </div>
    <div className="divider-dash" style={{ margin: "22px 0 18px" }} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      <span className="hk-pill pill-default" style={{ color: "#facc15" }}><I.arrowUp size={10} /> <span style={{ color: "#a1a1aa" }}>2.0000 WETH out</span></span>
      <span className="hk-pill pill-default" style={{ color: "#bbf7d0" }}><I.arrowDown size={10} /> <span style={{ color: "#a1a1aa" }}>1.9712 yvWETH in</span></span>
      <span className="hk-pill pill-default">gas {SAMPLE.gas.totalEth} ETH</span>
      <span className="hk-pill pill-default">{SAMPLE.gas.priceGwei} gwei</span>
      <span className="hk-pill pill-default">{SAMPLE.chainName}</span>
      <span className="hk-pill pill-default pill-mono">{SAMPLE.txHash.slice(0, 10)}…{SAMPLE.txHash.slice(-6)}</span>
    </div>
  </div>
);

// ── Sample 09 · Field grid (dense) ─────────────────────────────────────────
const Field: React.FC<{ k: string; v: React.ReactNode; mono?: boolean }> = ({ k, v, mono }) => (
  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", padding: "10px 0", borderBottom: "1px solid var(--border-secondary)", alignItems: "baseline" }}>
    <div className="label-caps">{k}</div>
    <div className={mono ? "mono" : ""} style={{ fontSize: 12, color: "#fafafa" }}>{v}</div>
  </div>
);
const Sample09: React.FC = () => (
  <div className="hk-card" style={{ padding: "14px 20px 18px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, borderBottom: "1px solid var(--border-primary)", marginBottom: 8 }}>
      <TxTypeBadge /><StatusBadge /><ConfidenceChip />
      <div className="label-caps" style={{ marginLeft: "auto" }}>Dense field grid</div>
    </div>
    <Field k="Tx hash" mono v={SAMPLE.txHash} />
    <Field k="Chain" v={<>{SAMPLE.chainName} <span style={{ color: "#71717a" }}>(id {SAMPLE.chainId})</span></>} />
    <Field k="Block · time" mono v={<>{SAMPLE.block.toLocaleString()} <span style={{ color: "#71717a" }}>· {SAMPLE.ts}</span></>} />
    <Field k="From" mono v={<>{SAMPLE.from.label} <span style={{ color: "#71717a" }}>{SAMPLE.from.addr}</span></>} />
    <Field k="To" mono v={<>{SAMPLE.to.label} <span style={{ color: "#71717a" }}>{SAMPLE.to.addr}</span></>} />
    <Field k="Moved out" mono v={<span style={{ color: "#facc15" }}>- 2.0000 WETH <span style={{ color: "#71717a" }}>($6,284.10)</span></span>} />
    <Field k="Moved in"  mono v={<span style={{ color: "#bbf7d0" }}>+ 1.9712 yvWETH <span style={{ color: "#71717a" }}>($6,284.10)</span></span>} />
    <Field k="Gas used" mono v={<>{SAMPLE.gas.used} units · {SAMPLE.gas.priceGwei} gwei → {SAMPLE.gas.totalEth} ETH ({SAMPLE.gas.totalUsd})</>} />
    <Field k="Selectors" mono v={
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
        {SAMPLE.selectors.map((s, i) => (
          <span key={i} className="hk-pill pill-default pill-mono" title={s.sig}>{s.sel}</span>
        ))}
      </span>
    } />
    <Field k="Confidence" v={<span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 120, height: 4, background: "#262626", borderRadius: 999, overflow: "hidden" }}>
        <span style={{ display: "block", height: "100%", width: `${SAMPLE.confidence * 100}%`, background: "#fafafa" }} />
      </span>
      <span className="mono" style={{ fontSize: 12, color: "#fafafa" }}>{(SAMPLE.confidence * 100).toFixed(0)}%</span>
    </span>} />
  </div>
);

// ── Sample 10 · Left rail verdict + right activity feed ──────────────────
type ActivityKind = "transfer" | "eth" | "call" | "event" | "approve";
type ActivityFilter = "all" | "transfer" | "call" | "event" | "approve";

const activityTypeStyle = (kind: ActivityKind, dir?: "in" | "out") => {
  if (kind === "transfer" || kind === "eth") {
    const out = dir === "out";
    return {
      bg: out ? "rgba(245,158,11,0.14)" : "rgba(34,197,94,0.14)",
      border: out ? "rgba(245,158,11,0.30)" : "rgba(34,197,94,0.30)",
      color: out ? "#facc15" : "#bbf7d0",
      label: kind === "eth" ? "ETH" : "TRANSFER",
      icon: out ? <I.arrowUp size={9} /> : <I.arrowDown size={9} />,
    };
  }
  if (kind === "approve") {
    return { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.18)", color: "#e5e5e5", label: "APPROVE", icon: null };
  }
  if (kind === "call") {
    return { bg: "rgba(255,255,255,0.10)", border: "rgba(255,255,255,0.25)", color: "#ffffff", label: "CALL", icon: null };
  }
  // event
  return { bg: "#262626", border: "rgba(255,255,255,0.10)", color: "#a1a1aa", label: "EVENT", icon: null };
};

const Sample10: React.FC = () => {
  const [filter, setFilter] = React.useState<ActivityFilter>("all");
  const total = SAMPLE.activities.length;
  const counts = {
    transfer: SAMPLE.activities.filter((a) => a.kind === "transfer" || a.kind === "eth").length,
    call: SAMPLE.activities.filter((a) => a.kind === "call").length,
    event: SAMPLE.activities.filter((a) => a.kind === "event").length,
    approve: SAMPLE.activities.filter((a) => a.kind === "approve").length,
  };
  const visible = SAMPLE.activities.filter((a) => {
    if (filter === "all") return true;
    if (filter === "transfer") return a.kind === "transfer" || a.kind === "eth";
    return a.kind === filter;
  });

  const FilterPill: React.FC<{ id: ActivityFilter; label: string; n: number }> = ({ id, label, n }) => {
    const active = filter === id;
    return (
      <button
        type="button"
        onClick={() => setFilter(id)}
        className={`hk-pill ${active ? "pill-accent" : "pill-default"}`}
        style={{ cursor: "pointer", fontFamily: "var(--font-body)" }}
      >
        {label}
        <span className="mono" style={{ opacity: 0.6, marginLeft: 2 }}>{n}</span>
      </button>
    );
  };

  return (
  <div className="hk-card-elevated" style={{ padding: 0, overflow: "hidden" }}>
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", minHeight: 260 }}>
      <div style={{ background: "#171717", padding: 22, borderRight: "1px solid var(--border-primary)", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <I.hex size={18} />
          <span className="brand-wordmark" style={{ color: "#fafafa", fontSize: 12 }}>HEXKIT</span>
          <span className="mono" style={{ color: "#71717a", fontSize: 11 }}>· summary</span>
        </div>
        <div>
          <MicroLabel>Transaction type</MicroLabel>
          <div style={{ fontSize: 18, color: "#fafafa", fontWeight: 600, marginTop: 4 }}>{SAMPLE.txType}</div>
          <div className="mono" style={{ fontSize: 11, color: "#71717a" }}>{SAMPLE.txCategory}</div>
        </div>
        <div>
          <MicroLabel>Status</MicroLabel>
          <div style={{ marginTop: 6 }}><StatusBadge /></div>
        </div>
        <div>
          <MicroLabel>Confidence</MicroLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <div style={{ flex: 1, height: 4, background: "#262626", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${SAMPLE.confidence * 100}%`, background: "#fafafa" }} />
            </div>
            <span className="mono" style={{ fontSize: 12, color: "#fafafa" }}>{(SAMPLE.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div style={{ marginTop: "auto", display: "flex", gap: 6 }}>
          <button className="hk-btn hk-btn-primary" style={{ flex: 1 }}>Deep scan <I.arrowRight size={12} /></button>
          <button className="hk-btn hk-btn-secondary" aria-label="copy"><I.copy size={12} /></button>
        </div>
      </div>

      <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <div style={{ fontSize: 18, color: "#fafafa", fontWeight: 600, letterSpacing: "-0.01em" }}>
          {SAMPLE.from.label} deposited <span className="mono">2.0000 WETH</span> into {SAMPLE.to.label}
        </div>
        <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>{SAMPLE.narrative}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <MicroLabel>Activity · {total}</MicroLabel>
            <div style={{ display: "flex", gap: 6, marginLeft: "auto", flexWrap: "wrap" }}>
              <FilterPill id="all"      label="All"       n={total} />
              <FilterPill id="transfer" label="Transfers" n={counts.transfer} />
              <FilterPill id="call"     label="Calls"     n={counts.call} />
              <FilterPill id="event"    label="Events"    n={counts.event} />
              <FilterPill id="approve"  label="Approve"   n={counts.approve} />
            </div>
          </div>

          <div style={{ position: "relative", border: "1px solid var(--border-primary)", borderRadius: 10, background: "rgba(10,10,10,0.4)" }}>
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {visible.map((a, i) => {
                const ts = activityTypeStyle(a.kind as ActivityKind, a.dir);
                return (
                  <div key={i} style={{
                    display: "grid",
                    gridTemplateColumns: "112px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                    padding: "11px 14px",
                    borderBottom: i === visible.length - 1 ? "none" : "1px solid var(--border-secondary)",
                  }}>
                    <span className="hk-pill pill-mono" style={{ background: ts.bg, borderColor: ts.border, color: ts.color, justifySelf: "start" }}>
                      {ts.icon}{ts.label}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#fafafa", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.label}</div>
                      {a.sub && <div className="mono" style={{ fontSize: 10.5, color: "#71717a", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.sub}</div>}
                    </div>
                    {a.value ? (
                      <div style={{ textAlign: "right" }}>
                        <div className="mono" style={{ fontSize: 12, color: "#fafafa" }}>{a.value}</div>
                        {a.valueSub && <div className="mono" style={{ fontSize: 10, color: "#71717a", marginTop: 2 }}>{a.valueSub}</div>}
                      </div>
                    ) : <span />}
                  </div>
                );
              })}
              {visible.length === 0 && (
                <div style={{ padding: "22px 14px", textAlign: "center", fontSize: 12, color: "#71717a" }}>
                  No matching activity in this filter.
                </div>
              )}
            </div>
            <div style={{ pointerEvents: "none", position: "absolute", left: 1, right: 8, bottom: 1, height: 22, background: "linear-gradient(180deg, rgba(28,28,28,0) 0%, rgba(28,28,28,0.9) 100%)", borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 4 }}>
          <span className="label-caps">Hash</span>
          <span className="mono" style={{ fontSize: 12, color: "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{SAMPLE.txHash}</span>
          <button className="hk-btn hk-btn-ghost" style={{ padding: 4 }} aria-label="copy"><I.copy size={11} /></button>
        </div>
      </div>
    </div>
  </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Page root
// ─────────────────────────────────────────────────────────────────────────────

const TxSummarySamplesPage: React.FC = () => {
  return (
    <div className="hk-root dark" style={{ minHeight: "100vh", position: "relative" }}>
      <style>{KIT_CSS}</style>
      <div className="constellation" />

      <div className="topbar" style={{ padding: "14px 32px", display: "flex", alignItems: "center", gap: 14, zIndex: 2, position: "relative" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <I.hex size={18} />
          <span className="brand-wordmark" style={{ color: "#fafafa", fontSize: 13 }}>HEXKIT</span>
          <span className="mono" style={{ color: "#52525b", fontSize: 11 }}>/ tx-summary-samples</span>
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
          <span className="hk-pill pill-default pill-mono">{SAMPLE.chainName.toUpperCase()}</span>
          <span className="hk-pill pill-default pill-mono">{SAMPLE.txHash.slice(0, 10)}…{SAMPLE.txHash.slice(-6)}</span>
          <span className="hk-kbd">ESC</span>
        </div>
      </div>

      <main style={{ position: "relative", zIndex: 1, padding: "28px 32px 72px", maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 40 }}>
        <header style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <MicroLabel>Design study · pick one</MicroLabel>
          <h1 style={{ margin: 0, fontSize: 30, letterSpacing: "-0.02em", fontWeight: 700, color: "#fafafa" }}>
            Ten ways to render a tx summary verdict
          </h1>
          <p style={{ margin: 0, color: "#a1a1aa", fontSize: 14, lineHeight: 1.6, maxWidth: 720 }}>
            Each card renders the same evidence — a Yearn v3 yvWETH deposit on Ethereum — in a different visual
            register. Pick the one that should become the default layout for <span className="mono">TxAnalysisPanel</span>'s
            <span className="mono"> summary</span> mode. Deep scan mode will layer on top.
          </p>
        </header>

        <Shell id="01" title="Verdict Header — compact summary banner with key facts">
          <Sample01 />
        </Shell>
        <Shell id="02" title="Transfer Ledger — table-first, every move on its own row">
          <Sample02 />
        </Shell>
        <Shell id="03" title="Flow Diagram — actor → asset → vault → actor">
          <Sample03 />
        </Shell>
        <Shell id="04" title="Terminal Block — CLI-style verdict dump">
          <Sample04 />
        </Shell>
        <Shell id="05" title="Split Pane — narrative on the left, evidence on the right">
          <Sample05 />
        </Shell>
        <Shell id="06" title="Metric Grid — six numbers + one sentence">
          <Sample06 />
        </Shell>
        <Shell id="07" title="Inner-step Timeline — what the transaction actually did, in order">
          <Sample07 />
        </Shell>
        <Shell id="08" title="Narrative First — a headline sentence carries the meaning">
          <Sample08 />
        </Shell>
        <Shell id="09" title="Dense Field Grid — forensic, machine-dense, all facts on display">
          <Sample09 />
        </Shell>
        <Shell id="10" title="Verdict + Detail — left rail verdict, right rail movement">
          <Sample10 />
        </Shell>
      </main>
    </div>
  );
};

export default TxSummarySamplesPage;
