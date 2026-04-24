declare const publicKeyBrand: unique symbol;
declare const programIdBrand: unique symbol;
declare const instructionDataBrand: unique symbol;
declare const txSignatureBrand: unique symbol;

export type PublicKey = string & { readonly [publicKeyBrand]: "SvmPublicKey" };
export type ProgramId = PublicKey & { readonly [programIdBrand]: "SvmProgramId" };
export type InstructionData = Uint8Array & { readonly [instructionDataBrand]: "SvmInstructionData" };
export type TransactionSignature = string & { readonly [txSignatureBrand]: "SvmTransactionSignature" };

export interface AccountMeta {
  pubkey: PublicKey;
  isSigner: boolean;
  isWritable: boolean;
}

export type SvmCluster = "mainnet-beta" | "devnet" | "testnet";

export const SVM_MAINNET: SvmCluster = "mainnet-beta";
export const SVM_DEVNET: SvmCluster = "devnet";
export const SVM_TESTNET: SvmCluster = "testnet";

// Base58 alphabet (Bitcoin variant — no 0, O, I, l)
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]+$/;
// ed25519 public keys and Solana signatures both serialize to base58; pubkeys
// are 32 bytes → 43–44 base58 chars, signatures are 64 bytes → 87–88.
const PUBKEY_LEN = { min: 32, max: 44 } as const;
const SIG_LEN = { min: 86, max: 88 } as const;

export function isPublicKey(input: unknown): input is PublicKey {
  return (
    typeof input === "string"
    && input.length >= PUBKEY_LEN.min
    && input.length <= PUBKEY_LEN.max
    && BASE58_RE.test(input)
  );
}

export function parsePublicKey(input: string): PublicKey {
  if (!isPublicKey(input)) throw new Error(`Invalid Solana public key: ${input}`);
  return input as PublicKey;
}

export function parseProgramId(input: string): ProgramId {
  return parsePublicKey(input) as unknown as ProgramId;
}

export function parseInstructionData(input: Uint8Array): InstructionData {
  return input as InstructionData;
}

export function parseTransactionSignature(input: string): TransactionSignature {
  if (
    typeof input !== "string"
    || input.length < SIG_LEN.min
    || input.length > SIG_LEN.max
    || !BASE58_RE.test(input)
  ) {
    throw new Error(`Invalid Solana transaction signature: ${input}`);
  }
  return input as TransactionSignature;
}

export type SvmChainKey = `svm:${SvmCluster}`;

export function toSvmChainKey(cluster: SvmCluster): SvmChainKey {
  return `svm:${cluster}` as SvmChainKey;
}
