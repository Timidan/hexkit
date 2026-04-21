import { useCallback, useEffect, useRef, useState } from "react";
import { useWriteContract, useAccount, useWalletClient, usePublicClient } from "wagmi";
import type { PublicClient } from "viem";
import { createCofheConfig, createCofheClient } from "@cofhe/sdk/web";
import { sepolia as sepoliaChain } from "@cofhe/sdk/chains";
import { FheTypes, Encryptable } from "@cofhe/sdk";
import { PermitUtils } from "@cofhe/sdk/permits";
import { packFeatures, type TriageResult } from "../../utils/hack-analysis/triage/cofhe";
import type { EvidencePacket } from "../../utils/tx-analysis/types";
import HackTriageArtifact from "../../abi/HackTriage.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const HackTriageAbi = (HackTriageArtifact as any).abi as readonly unknown[];

export type HackTriageStatus =
  | "idle"
  | "encrypting"
  | "writing"
  | "waiting-fhe"
  | "decrypting"
  | "ready"
  | "error";

export interface UseHackTriageParams {
  packet: EvidencePacket | null;
  /** Deployed HackTriage contract address (from VITE_HACK_TRIAGE_ADDRESS) */
  contractAddress: `0x${string}`;
}

export interface UseHackTriageReturn {
  status: HackTriageStatus;
  error: string | null;
  /** Plaintext packed feature bits (for display/debug) */
  features: number | null;
  /** Decrypted verdict: { classBits, severity } */
  verdict: TriageResult | null;
  txHash: `0x${string}` | null;
  /** Ciphertext handles that other contracts can read from HackTriage.latest — publishing these
   *  does not leak the underlying values; only permit holders can decrypt. */
  handles: { classBits: string; severity: string } | null;
  contractAddress: `0x${string}`;
  run: () => Promise<void>;
  cancel: () => void;
}

/**
 * Block-aware coprocessor wait: exits when BOTH conditions are met:
 *   - at least `minMs` milliseconds have elapsed
 *   - at least `minBlocks` new blocks have been mined
 * Polls every 2 seconds. Respects `cancelledRef` to abort early.
 */
async function waitForCoprocessor(
  publicClient: PublicClient,
  cancelledRef: { current: boolean },
  minBlocks = 3,
  minMs = 30_000,
): Promise<void> {
  const startBlock = await publicClient.getBlockNumber();
  const startTime = Date.now();
  while (true) {
    if (cancelledRef.current) return;
    const elapsed = Date.now() - startTime;
    const current = await publicClient.getBlockNumber();
    const blocksElapsed = Number(current - startBlock);
    if (elapsed >= minMs && blocksElapsed >= minBlocks) break;
    await new Promise<void>((r) => setTimeout(r, 2000));
    if (cancelledRef.current) return;
  }
}

export function useHackTriage({
  packet,
  contractAddress,
}: UseHackTriageParams): UseHackTriageReturn {
  const { writeContractAsync } = useWriteContract();
  const { data: walletClient } = useWalletClient();
  const { chain } = useAccount();
  const publicClient = usePublicClient();

  const [status, setStatus] = useState<HackTriageStatus>("idle");
  const [features, setFeatures] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<TriageResult | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | null>(null);
  const [handles, setHandles] = useState<{ classBits: string; severity: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = true;
    setStatus("idle");
    setFeatures(null);
    setVerdict(null);
    setTxHash(null);
    setHandles(null);
    setError(null);
  }, [packet, contractAddress]);

  const run = useCallback(async () => {
    cancelled.current = false;

    // Strict chain guard — must be on Sepolia (11155111), no fallback
    if (chain?.id !== 11155111) {
      setError("Wallet must be connected to Ethereum Sepolia (chainId 11155111)");
      setStatus("error");
      return;
    }

    if (!packet) {
      setError("no packet");
      setStatus("error");
      return;
    }
    if (!walletClient) {
      setError("wallet not connected");
      setStatus("error");
      return;
    }
    if (!publicClient) {
      setError("no public client");
      setStatus("error");
      return;
    }

    const chainId = chain.id;
    const account = walletClient.account.address;

    try {
      setError(null);
      setStatus("encrypting");

      // 1. Pack feature bits
      const bits = packFeatures(packet);
      setFeatures(bits);

      // 2. Create CoFHE client for web (uses IndexedDB key storage by default)
      const cofheConfig = createCofheConfig({
        environment: "web",
        supportedChains: [sepoliaChain],
        _internal: {
          zkvWalletClient: walletClient,
        },
      });
      const cofheClient = createCofheClient(cofheConfig);

      // 3. Connect the client with viem clients
      await cofheClient.connect(publicClient, walletClient);

      // 4. Reuse an existing signed self-permit if one is still valid; otherwise sign a new one.
      //    Skipping this saves a wallet prompt on every run after the first.
      const existingPermit = cofheClient.permits.getActivePermit(chainId, account);
      const permitStillValid = !!existingPermit && PermitUtils.isValid(existingPermit).valid;
      if (!permitStillValid) {
        await cofheClient.permits.createSelf({ issuer: account });
      }

      // 5. Encrypt the packed feature bits as uint16
      const [encInput] = await cofheClient
        .encryptInputs([Encryptable.uint16(BigInt(bits))])
        .setAccount(account)
        .setChainId(chainId)
        .execute();

      if (cancelled.current) return;

      setStatus("writing");

      // 6. Submit the encrypted features to the HackTriage contract
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: HackTriageAbi,
        functionName: "triage",
        args: [
          {
            ctHash: encInput.ctHash,
            securityZone: encInput.securityZone,
            utype: encInput.utype,
            signature: encInput.signature as `0x${string}`,
          },
        ],
      });
      setTxHash(hash);

      if (cancelled.current) return;

      setStatus("waiting-fhe");

      // 7. Wait for tx receipt (Sepolia can be slow under load, so give it a generous window)
      await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });

      // 8. Wait for the CoFHE coprocessor to pick up and process the FHE task
      await waitForCoprocessor(publicClient, cancelled);

      if (cancelled.current) return;

      setStatus("decrypting");

      // 9. Read the ciphertext handles from the contract's public `latest` mapping
      const latestResult = await publicClient.readContract({
        address: contractAddress,
        abi: HackTriageAbi,
        functionName: "latest",
        args: [account],
      }) as [bigint, bigint, bigint]; // [classBits handle, severity handle, blockNumber]

      const [classBitsHandle, severityHandle] = latestResult;
      setHandles({
        classBits: `0x${classBitsHandle.toString(16).padStart(64, "0")}`,
        severity: `0x${severityHandle.toString(16).padStart(64, "0")}`,
      });

      // 10. Decrypt the handles using the CoFHE SDK
      const [classBitsVal, severityVal] = await Promise.all([
        cofheClient
          .decryptForView(classBitsHandle, FheTypes.Uint16)
          .setChainId(chainId)
          .setAccount(account)
          .withPermit()
          .execute(),
        cofheClient
          .decryptForView(severityHandle, FheTypes.Uint8)
          .setChainId(chainId)
          .setAccount(account)
          .withPermit()
          .execute(),
      ]);

      setVerdict({
        classBits: Number(classBitsVal),
        severity: Number(severityVal),
      });
      setStatus("ready");
    } catch (err) {
      if (cancelled.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [packet, walletClient, publicClient, chain, contractAddress, writeContractAsync]);

  const cancel = useCallback(() => {
    cancelled.current = true;
    setStatus((s) => (s === "ready" || s === "error" ? s : "idle"));
  }, []);

  return { status, error, features, verdict, txHash, handles, contractAddress, run, cancel };
}
