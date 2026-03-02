import { ethers } from "ethers";
import { lookupFunctionSignatures } from "../../utils/signatureDatabase";
import { type SimulationViewMode, TXHASH_REPLAY_KEY } from "./types";

/**
 * Attempt to decode calldata and show a notification offering to switch to manual mode.
 * Uses the contract's cached ABI first, then falls back to OpenChain 4-byte lookup.
 */
export async function attemptCalldataDecodeNotification(
  calldata: string,
  targetAddress: string,
  networkId: number,
  contractContext: any,
  setViewMode: (mode: SimulationViewMode) => void,
  setCloneData: (data: any) => void,
) {
  try {
    const selector = calldata.slice(0, 10);
    let decoded: { functionName: string; args: Record<string, string> } | null = null;

    // 1. Try ABI-first decode if we have a cached ABI
    if (contractContext?.abi && Array.isArray(contractContext.abi) && contractContext.abi.length > 0) {
      try {
        const iface = new ethers.utils.Interface(contractContext.abi);
        const parsed = iface.parseTransaction({ data: calldata });
        if (parsed) {
          const args: Record<string, string> = {};
          parsed.functionFragment.inputs.forEach((input, i) => {
            const val = parsed.args[i];
            // Handle complex types (arrays, structs) by JSON-stringifying them
            args[input.name || `arg${i}`] = typeof val === 'object' ? JSON.stringify(val) : String(val);
          });
          decoded = { functionName: parsed.name, args };
        }
      } catch {
        // ABI decode failed, fall through to 4-byte lookup
      }
    }

    // 2. Fall back to OpenChain 4-byte signature lookup
    if (!decoded) {
      try {
        const response = await lookupFunctionSignatures([selector]);
        const matches = response?.result?.function?.[selector];
        if (matches && matches.length > 0) {
          // Extract function name from signature (e.g. "transfer(address,uint256)" -> "transfer")
          const sigName = matches[0].name || selector;
          const funcName = sigName.includes('(') ? sigName.split('(')[0] : sigName;
          // 4-byte match only gives us the name, not decoded args
          decoded = { functionName: funcName, args: {} };
        }
      } catch {
        // 4-byte lookup failed, no notification
      }
    }

    if (decoded) {
      // Show notification with action to switch to manual mode
      const { toast: sonnerToast } = await import('sonner');
      sonnerToast.info('Decoded calldata available', {
        description: `Function: ${decoded.functionName}. Switch to Manual mode to modify arguments before resimulating.`,
        duration: 12000,
        action: {
          label: 'Switch to Manual',
          onClick: () => {
            // Build clone data for SimpleGridUI with decoded function + args
            const manualCloneData = {
              ...contractContext,
              simulationOrigin: 'manual' as const,
              selectedFunction: decoded!.functionName,
              functionInputs: decoded!.args,
            };
            setCloneData(manualCloneData);
            setViewMode('builder');
            // Clean up replay localStorage since we're switching modes
            localStorage.removeItem(TXHASH_REPLAY_KEY);
          },
        },
      });
    }
  } catch {
    // Calldata decode notification failed
  }
}
