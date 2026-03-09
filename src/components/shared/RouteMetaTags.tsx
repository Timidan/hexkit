import { useLocation } from "react-router-dom";
import { PageMeta } from "./PageMeta";

/** Per-route SEO metadata. Keyed by pathname prefix. */
const ROUTE_META: Record<string, { title: string; description: string }> = {
  "/": {
    title: "HexKit — Ethereum Developer Toolkit",
    description:
      "Free open-source Ethereum developer toolkit. Decode transactions, simulate calls, explore smart contract storage, look up function signatures, and build calldata.",
  },
  "/database": {
    title: "Signature Database — Function & Event Lookup",
    description:
      "Look up Ethereum function selectors and event topic hashes. Search by name or decode 4-byte selectors and 32-byte event signatures instantly.",
  },
  "/builder": {
    title: "Transaction Builder & Simulator",
    description:
      "Build, encode, and simulate Ethereum transactions. ABI-aware calldata encoder with live EVM simulation, trace visualization, and state diff analysis.",
  },
  "/explorer": {
    title: "Contract Explorer — Source, Storage & Diff",
    description:
      "Explore verified smart contract source code, inspect storage slots and layouts, compare contract diffs, and decode proxy implementations across EVM chains.",
  },
  "/simulations": {
    title: "Simulation History",
    description:
      "Browse your past EVM transaction simulations. Review traces, state changes, and gas usage from previous simulation runs.",
  },
};

/**
 * Reads the current route and renders the appropriate <Helmet> meta tags.
 * Place once in App.tsx — works for all routes.
 */
export function RouteMetaTags() {
  const { pathname } = useLocation();

  // Match exact path first, then check prefixes (for /simulation/:id etc.)
  const meta =
    ROUTE_META[pathname] ??
    ROUTE_META[
      Object.keys(ROUTE_META).find(
        (key) => key !== "/" && pathname.startsWith(key),
      ) ?? "/"
    ] ??
    ROUTE_META["/"];

  return <PageMeta title={meta.title} description={meta.description} path={pathname} />;
}
