// Builds Voyager / Starkscan deep-links for a tx hash, picking the
// right host (mainnet, sepolia, sepolia-integration) based on the
// bridge's reported chain ID. Anything unrecognized falls back to
// mainnet — same behavior as pasting an unknown hash into either
// explorer's search box, which redirects to mainnet by default.

const CHAIN_IDS = {
  // ASCII-encoded chain identifiers Starknet uses on /health.
  mainnet: ["0x534e5f4d41494e"],
  sepolia: ["0x534e5f5345504f4c4941"],
  sepoliaIntegration: ["0x534e5f494e544547524154494f4e5f5345504f4c4941"],
} as const;

type Network = "mainnet" | "sepolia" | "sepoliaIntegration";

function networkOf(chainId: string | null | undefined): Network {
  if (!chainId) return "mainnet";
  const lower = chainId.toLowerCase();
  if (CHAIN_IDS.sepoliaIntegration.includes(lower as never)) return "sepoliaIntegration";
  if (CHAIN_IDS.sepolia.includes(lower as never)) return "sepolia";
  return "mainnet";
}

export function explorerLinks(
  txHash: string,
  chainId: string | null | undefined,
): { voyager: string; starkscan: string; network: Network } {
  const network = networkOf(chainId);
  const voyagerHost =
    network === "mainnet"
      ? "voyager.online"
      : network === "sepolia"
        ? "sepolia.voyager.online"
        : "sepolia.voyager.online";
  const starkscanHost =
    network === "mainnet"
      ? "starkscan.co"
      : network === "sepolia"
        ? "sepolia.starkscan.co"
        : "sepolia.starkscan.co";
  return {
    voyager: `https://${voyagerHost}/tx/${txHash}`,
    starkscan: `https://${starkscanHost}/tx/${txHash}`,
    network,
  };
}

export function networkLabel(chainId: string | null | undefined): string {
  switch (networkOf(chainId)) {
    case "mainnet":
      return "mainnet";
    case "sepolia":
      return "sepolia";
    case "sepoliaIntegration":
      return "sepolia-integration";
  }
}
