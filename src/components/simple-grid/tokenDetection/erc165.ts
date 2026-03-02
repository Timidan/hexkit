import { ethers } from "ethers";

/** Minimal ABI for supportsInterface calls */
export const erc165ABI = [
  {
    inputs: [
      { internalType: "bytes4", name: "interfaceId", type: "bytes4" },
    ],
    name: "supportsInterface",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
];

/** ERC165 + token interface IDs */
export const erc165InterfaceIds = {
  ERC165: "0x01ffc9a7",
  ERC20: "0x36372b07",
  ERC721: "0x80ac58cd",
  ERC721Metadata: "0x5b5e139f",
  ERC721Enumerable: "0x780e9d63",
  ERC1155: "0xd9b67a26",
  ERC1155MetadataURI: "0x0e89341c",
  ERC777: "0x7f294c2d",
  ERC4626: "0x6a5275b1",
  ERC2981: "0x2a55205a",
};

/**
 * Detect which ERC165 token interfaces a contract supports.
 * Returns early with the first token interface found.
 */
export async function detectTokenInterfaces(
  contractAddress: string,
  provider: ethers.providers.Provider
): Promise<string[]> {
  const supportedInterfaces: string[] = [];

  const erc165Contract = new ethers.Contract(
    contractAddress,
    erc165ABI,
    provider
  );

  try {
    const supportsERC165 = await erc165Contract.supportsInterface(
      erc165InterfaceIds.ERC165
    );
    if (supportsERC165) {
      supportedInterfaces.push("ERC165");

      const interfaceCheckOrder = [
        "ERC20",
        "ERC721",
        "ERC1155",
        "ERC777",
        "ERC4626",
        "ERC2981",
        "ERC721Metadata",
        "ERC721Enumerable",
        "ERC1155MetadataURI",
      ];

      for (const interfaceName of interfaceCheckOrder) {
        try {
          const interfaceId =
            erc165InterfaceIds[interfaceName as keyof typeof erc165InterfaceIds];
          let isSupported = false;
          try {
            isSupported =
              await erc165Contract.supportsInterface(interfaceId);
          } catch {
            // supportsInterface call failed for this interface
          }

          if (isSupported) {
            supportedInterfaces.push(interfaceName);
            return supportedInterfaces;
          }
        } catch {
          // Interface check failed
        }
      }
    }
  } catch {
    // Contract does not implement supportsInterface
  }

  return supportedInterfaces;
}
