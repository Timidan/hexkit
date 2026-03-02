import { ethers } from "ethers";

/** Diamond verification function - checks if contract implements facetAddresses() */
export async function verifyDiamondStandard(
  contractAddress: string,
  provider: ethers.providers.Provider
): Promise<boolean> {
  try {
    const diamondContract = new ethers.Contract(
      contractAddress,
      [
        "function facetAddresses() external view returns (address[] memory facetAddresses_)",
      ],
      provider
    );
    const facetAddresses = await diamondContract.facetAddresses();
    return Array.isArray(facetAddresses) && facetAddresses.length > 0;
  } catch {
    return false;
  }
}
