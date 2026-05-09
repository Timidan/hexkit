// Unknown chain IDs fall back to mainnet — same behavior as pasting
// an unknown hash into either explorer's search box.

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

function explorerHosts(network: Network): { voyager: string; starkscan: string } {
  if (network === "mainnet") {
    return { voyager: "voyager.online", starkscan: "starkscan.co" };
  }
  return { voyager: "sepolia.voyager.online", starkscan: "sepolia.starkscan.co" };
}

export function explorerLinks(
  txHash: string,
  chainId: string | null | undefined,
): { voyager: string; starkscan: string; network: Network } {
  const network = networkOf(chainId);
  const { voyager, starkscan } = explorerHosts(network);
  return {
    voyager: `https://${voyager}/tx/${txHash}`,
    starkscan: `https://${starkscan}/tx/${txHash}`,
    network,
  };
}

export function contractExplorerLinks(
  contractAddress: string,
  chainId: string | null | undefined,
): { voyager: string; starkscan: string } {
  const { voyager, starkscan } = explorerHosts(networkOf(chainId));
  return {
    voyager: `https://${voyager}/contract/${contractAddress}`,
    starkscan: `https://${starkscan}/contract/${contractAddress}`,
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
