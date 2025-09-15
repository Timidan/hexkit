import { ethers } from "ethers";
import { detectTokenType } from "../utils/universalTokenDetector";

export async function runDetectorSmokeTests(): Promise<void> {
  const KEY =
    (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
      .API_KEY ||
    (import.meta.env as unknown as { API_KEY?: string; VITE_API_KEY?: string })
      .VITE_API_KEY ||
    "";

  const base = new ethers.providers.JsonRpcProvider(
    KEY
      ? `https://base-mainnet.g.alchemy.com/v2/${KEY}`
      : `https://base-mainnet.g.alchemy.com/v2/${KEY}`,
    { name: "base", chainId: 8453 }
  );
  const eth = new ethers.providers.JsonRpcProvider(
    KEY
      ? `https://eth-mainnet.g.alchemy.com/v2/${KEY}`
      : `https://eth-mainnet.g.alchemy.com/v2/${KEY}`,
    { name: "homestead", chainId: 1 }
  );

  const samples = [
    {
      addr: "0x617fdB8093b309e4699107F48812b407A7c37938",
      label: "Base Diamond ERC1155",
      provider: base,
    },
    {
      addr: "0xa99c4b08201f2913db8d28e71d020c4298f29dbf",
      label: "Base Diamond ERC721",
      provider: base,
    },
    {
      addr: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      label: "ETH ERC20 USDT",
      provider: eth,
    },
  ];

  for (const s of samples) {
    try {
      const res = await detectTokenType(s.provider, s.addr);
      // eslint-disable-next-line no-console
      console.log(`[Detector] ${s.label} @ ${s.addr}`, res);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `[Detector] FAILED ${s.label} @ ${s.addr}`,
        (e as Error)?.message
      );
    }
  }
}
