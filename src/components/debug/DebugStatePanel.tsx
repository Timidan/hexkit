import React, { useEffect, useState } from "react";
import { useDebug } from "../../contexts/DebugContext";
import type {
  DebugSnapshot,
  HookSnapshotDetail,
  OpcodeSnapshotDetail,
} from "../../types/debug";
import { DebugStatePanelShell } from "./shells/DebugStatePanelShell";

interface DebugStatePanelProps {
  className?: string;
  simulationContext?: {
    from?: string;
    to?: string;
    value?: string;
    calldata?: string;
    decodedInput?: Record<string, unknown>;
    decodedOutput?: Record<string, unknown>;
  };
}

function buildStateFromSnapshot(
  snapshot: DebugSnapshot,
  options?: {
    targetAddress?: string;
    bytecodeAddress?: string;
    from?: string;
    to?: string;
    value?: string;
    calldata?: string;
    decodedInput?: Record<string, unknown>;
    decodedOutput?: Record<string, unknown>;
    totalGasUsed?: number;
    callStack?: Array<{ address: string; functionName?: string }>;
    callerBalance?: string | null;
  },
): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  if (snapshot.type === "hook") {
    const detail = snapshot.detail as HookSnapshotDetail;
    state["[FUNCTION]"] = detail.functionName || "unknown";
    state["[FILE]"] = `${detail.filePath}:${detail.line}`;
  } else {
    const detail = snapshot.detail as OpcodeSnapshotDetail;
    state["[FUNCTION]"] = options?.callStack?.length
      ? options.callStack[options.callStack.length - 1]?.functionName || "unknown"
      : "unknown";
    state["[OPCODE]"] = detail.opcodeName;
  }

  if (snapshot.targetAddress || options?.to) {
    state["contract"] = { address: snapshot.targetAddress || options?.to };
  }

  if (options?.from) {
    state["from"] = { address: options.from };
  }

  if (options?.to) {
    state["to"] = { address: options.to };
  }

  if (options?.callStack && options.callStack.length > 1) {
    const callerIndex = options.callStack.length - 2;
    const callerAddress = options.callStack[callerIndex]?.address;
    state["caller"] = {
      address: callerAddress,
      ...(options?.callerBalance ? { balance: options.callerBalance } : {}),
    };
  } else if (options?.from) {
    state["caller"] = {
      address: options.from,
      ...(options?.callerBalance ? { balance: options.callerBalance } : {}),
    };
  }

  if (options?.decodedInput && Object.keys(options.decodedInput).length > 0) {
    state["input"] = options.decodedInput;
  }

  if (options?.calldata) {
    state["[RAW_INPUT]"] =
      options.calldata.length > 66
        ? `${options.calldata.substring(0, 66)}...`
        : options.calldata;
  }

  if (options?.decodedOutput && Object.keys(options.decodedOutput).length > 0) {
    state["output"] = options.decodedOutput;
  }

  if (snapshot.type === "opcode") {
    const detail = snapshot.detail as OpcodeSnapshotDetail;
    if (detail.gasRemaining) {
      const gasRemaining = parseInt(detail.gasRemaining, 10) || 0;
      const gasUsed = options?.totalGasUsed
        ? options.totalGasUsed - gasRemaining
        : undefined;
      state["gas"] = {
        gas_left: gasRemaining,
        ...(gasUsed !== undefined && { gas_used: gasUsed }),
        ...(options?.totalGasUsed && { total_gas_used: options.totalGasUsed }),
      };
    }
  }

  if (snapshot.type === "hook") {
    const detail = snapshot.detail as HookSnapshotDetail;
    if (detail.locals && detail.locals.length > 0) {
      state["local_variables"] = Object.fromEntries(
        detail.locals.map((v) => [v.name, v.value]),
      );
    }
    if (detail.stateVariables && detail.stateVariables.length > 0) {
      state["state_variables"] = Object.fromEntries(
        detail.stateVariables.map((v) => [v.name, v.value]),
      );
    }
  }

  if (snapshot.type === "opcode") {
    const detail = snapshot.detail as OpcodeSnapshotDetail;
    if (detail.stack && detail.stack.length > 0) {
      state["stack"] = detail.stack.slice(0, 5);
      if (detail.stack.length > 5) {
        state["stack_depth"] = detail.stack.length;
      }
    }
    if (detail.storageAccess) {
      state["storage_access"] = {
        type: detail.storageAccess.type,
        slot: detail.storageAccess.slot,
        value: detail.storageAccess.value,
      };
    }
  }

  return state;
}

export const DebugStatePanel: React.FC<DebugStatePanelProps> = React.memo(
  ({ className, simulationContext }) => {
    const { currentSnapshot, error, callStack, session } = useDebug();
    const [callerBalance, setCallerBalance] = useState<string | null>(null);

    const callerAddress =
      callStack?.length && callStack.length > 1
        ? callStack[callStack.length - 2]?.address
        : simulationContext?.from;

    useEffect(() => {
      // EDB debug RPC doesn't expose eth_getBalance; skip the fetch.
      setCallerBalance(null);
    }, [callerAddress, session?.rpcUrl]);

    if (!currentSnapshot) {
      return <DebugStatePanelShell className={className} state={null} />;
    }

    const buildOptions = {
      targetAddress: currentSnapshot.targetAddress,
      bytecodeAddress: currentSnapshot.bytecodeAddress,
      from: simulationContext?.from,
      to: simulationContext?.to || currentSnapshot.targetAddress,
      value: simulationContext?.value,
      calldata: simulationContext?.calldata,
      decodedInput: simulationContext?.decodedInput,
      decodedOutput: simulationContext?.decodedOutput,
      callStack: callStack?.map((frame) => ({
        address: frame.address,
        functionName: frame.functionName,
      })),
      callerBalance,
    };

    const stateData = buildStateFromSnapshot(currentSnapshot, buildOptions);

    return (
      <DebugStatePanelShell
        className={className}
        state={stateData}
        error={error || null}
      />
    );
  },
);

DebugStatePanel.displayName = "DebugStatePanel";

export default DebugStatePanel;
