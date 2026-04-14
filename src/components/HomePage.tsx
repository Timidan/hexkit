import React from "react";
import { useNavigate } from "react-router-dom";
import { Database, Wrench, Code, Command as CommandIcon, MagnifyingGlass, Stack } from "@phosphor-icons/react";

const QUICK_ACTIONS = [
  { label: "Signature Database", icon: Database, route: "/database" },
  { label: "Transaction Utils", icon: Wrench, route: "/builder" },
  { label: "Source Tools", icon: Code, route: "/explorer" },
  { label: "Integrations", icon: Stack, route: "/integrations" },
] as const;

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const openSearch = () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  };

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center px-3 md:px-4 pb-24">
      <svg viewBox="0 0 100 100" fill="none" className="size-20 md:size-[120px] text-foreground mb-3">
        <polygon points="50,10 84.6,30 84.6,70 50,90 15.4,70 15.4,30" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="miter"/>
        <line x1="36" y1="31" x2="36" y2="69" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square"/>
        <line x1="64" y1="31" x2="64" y2="69" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square"/>
        <line x1="36" y1="50" x2="64" y2="50" stroke="currentColor" strokeWidth="4.5" strokeLinecap="square"/>
        <line x1="1" y1="39" x2="15.4" y2="39" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
        <line x1="0" y1="50" x2="15.4" y2="50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
        <line x1="1" y1="61" x2="15.4" y2="61" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
        <line x1="84.6" y1="39" x2="99" y2="39" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
        <line x1="84.6" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
        <line x1="84.6" y1="61" x2="99" y2="61" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square"/>
      </svg>

      <h1
        className="text-2xl md:text-3xl font-extrabold tracking-[0.14em] text-foreground mb-1.5"
        style={{ fontFamily: "'SF Mono', 'JetBrains Mono', ui-monospace, monospace" }}
      >
        HEXKIT
      </h1>

      <p className="text-sm text-muted-foreground mb-8">
        Decode. Build. Simulate.
      </p>

      <button
        type="button"
        onClick={openSearch}
        className="group flex h-11 w-full max-w-[560px] items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 md:px-4 text-left text-muted-foreground shadow-sm transition-colors hover:border-primary/25 hover:bg-muted/50 hover:text-foreground"
      >
        <MagnifyingGlass className="size-4 shrink-0 opacity-60" />
        <span className="flex-1 text-sm opacity-60">Search address, tx hash, selector, signature...</span>
        <kbd className="pointer-events-none hidden h-6 select-none items-center gap-0.5 rounded border border-border/60 bg-muted/50 px-2 font-mono text-[11px] font-medium opacity-50 sm:inline-flex">
          <CommandIcon className="size-3" />K
        </kbd>
      </button>

      <p className="mt-2.5 text-xs text-muted-foreground/50">
        Press <kbd className="rounded border border-border/40 bg-muted/30 px-1 py-0.5 font-mono text-[10px]">Ctrl+K</kbd> anywhere to search
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {QUICK_ACTIONS.map(({ label, icon: Icon, route }) => (
          <button
            key={route}
            type="button"
            onClick={() => navigate(route)}
            className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-4 py-2.5 text-sm text-muted-foreground transition-all hover:border-primary/30 hover:bg-muted/40 hover:text-foreground"
          >
            <Icon className="size-4 opacity-70" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default HomePage;
