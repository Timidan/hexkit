import React from "react";

export const HEXKIT_CSS = `
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
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-family: var(--font-body); font-weight: 500; font-size: 13px;
  border-radius: 8px; padding: 9px 14px;
  border: 1px solid transparent; cursor: pointer;
  transition: all 150ms ease; white-space: nowrap; line-height: 1;
}
.hk-root .hk-btn-primary { background: #fafafa; color: #0a0a0a; }
.hk-root .hk-btn-primary:hover { background: rgba(250,250,250,0.9); }
.hk-root .hk-btn-primary:disabled { background: rgba(250,250,250,0.3); color: rgba(10,10,10,0.5); cursor: not-allowed; }
.hk-root .hk-btn-secondary { background: #262626; color: #fafafa; border-color: rgba(255,255,255,0.10); }
.hk-root .hk-btn-secondary:hover { background: #2e2e2e; }
.hk-root .hk-btn-outline { background: transparent; color: #fafafa; border-color: rgba(255,255,255,0.20); }
.hk-root .hk-btn-outline:hover { background: rgba(255,255,255,0.05); }
.hk-root .hk-btn-ghost { background: transparent; color: #a1a1aa; }
.hk-root .hk-btn-ghost:hover { background: #262626; color: #fafafa; }
.hk-root .hk-btn:active:not(:disabled) { transform: scale(0.96); }

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

interface HexKitRootProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const HexKitRoot: React.FC<HexKitRootProps> = ({ children, className, style }) => (
  <div className={`hk-root dark${className ? ` ${className}` : ""}`} style={style}>
    <style>{HEXKIT_CSS}</style>
    {children}
  </div>
);

interface IconProps {
  size?: number;
}

export const HKI = {
  arrowUp: (p: IconProps = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>
  ),
  arrowDown: (p: IconProps = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
  ),
  arrowRight: (p: IconProps = {}) => (
    <svg width={p.size ?? 14} height={p.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
  ),
  copy: (p: IconProps = {}) => (
    <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
  ),
  hex: (p: IconProps = {}) => (
    <svg width={p.size ?? 16} height={p.size ?? 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 3 7v10l9 5 9-5V7Z"/></svg>
  ),
};

export const MicroLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="label-caps">{children}</span>
);

export const shortAddress = (addr: string | null | undefined, lead = 6, trail = 4): string => {
  if (!addr) return "—";
  if (addr.length <= lead + trail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-trail)}`;
};
