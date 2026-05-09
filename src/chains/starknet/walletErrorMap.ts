// Argent X / Braavos / Cartridge throw rejections in inconsistent shapes
// (`{ code: 113 }`, `Error("USER_ABORTED")`, `code: -32603`, …). Heuristics
// here are informed guesses; tighten as we hit real-user payloads.

export interface MappedWalletError {
  title: string;
  message: string;
  isUserRejected: boolean;
}

function extract(err: unknown): { code?: number | string; message: string; name?: string } {
  if (err instanceof Error) {
    const code = (err as Error & { code?: number | string }).code;
    return { code, message: err.message, name: err.name };
  }
  if (typeof err === "object" && err !== null) {
    const e = err as { code?: number | string; message?: unknown };
    return {
      code: e.code,
      message: typeof e.message === "string" ? e.message : JSON.stringify(err),
    };
  }
  return { message: String(err) };
}

function isUserRejectedShape(code: number | string | undefined, msg: string): boolean {
  if (code === 4001 || code === 113) return true;
  const lower = msg.toLowerCase();
  return (
    lower.includes("user abort") ||
    lower.includes("user reject") ||
    lower.includes("user denied") ||
    lower.includes("user_aborted") ||
    lower.includes("user aborted") ||
    lower.includes("rejected by user")
  );
}

function isNetworkShape(name: string | undefined, msg: string): boolean {
  if (name === "NetworkError") return true;
  const lower = msg.toLowerCase();
  return lower.includes("failed to fetch") || lower.includes("network request failed");
}

function isInsufficientShape(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes("insufficient") || lower.includes("not enough fee");
}

export function mapWalletError(err: unknown): MappedWalletError {
  const { code, message, name } = extract(err);

  if (isUserRejectedShape(code, message)) {
    return {
      title: "Transaction cancelled",
      message: "Try again when ready.",
      isUserRejected: true,
    };
  }

  if (isNetworkShape(name, message)) {
    return {
      title: "Network error",
      message: message || "Could not reach the wallet RPC. Check your connection and try again.",
      isUserRejected: false,
    };
  }

  if (isInsufficientShape(message)) {
    return {
      title: "Insufficient funds",
      message: message || "The connected account does not have enough funds to cover the fee.",
      isUserRejected: false,
    };
  }

  return {
    title: "Transaction failed",
    message: message || "Unknown wallet error.",
    isUserRejected: false,
  };
}
