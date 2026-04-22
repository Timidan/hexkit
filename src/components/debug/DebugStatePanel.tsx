/**
 * Debug State Panel Component
 *
 * Displays the current snapshot state as formatted JSON,
 * IDE-style debugger state panel.
 * Shows: function, opcode, addresses, gas info, decoded inputs/outputs
 */

import React from 'react';
import { useDebug } from '../../contexts/DebugContext';
import { ScrollArea } from '../ui/scroll-area';
import { cn } from '../../lib/utils';
import type { HookSnapshotDetail, OpcodeSnapshotDetail, DebugSnapshot } from '../../types/debug';
import './DebugStatePanel.css';

interface DebugStatePanelProps {
  className?: string;
  /** Optional: simulation context for additional data like addresses */
  simulationContext?: {
    from?: string;
    to?: string;
    value?: string;
    calldata?: string;
    decodedInput?: Record<string, unknown>;
    decodedOutput?: Record<string, unknown>;
  };
}

/**
 * Format a value for JSON-like display
 */
function formatValue(value: unknown, indent: number = 0): React.ReactNode {
  const indentStr = '  '.repeat(indent);

  if (value === null) {
    return <span className="debug-state__null">null</span>;
  }

  if (value === undefined) {
    return <span className="debug-state__undefined">undefined</span>;
  }

  if (typeof value === 'string') {
    // Check if it's a long hex string (address/hash)
    if (value.startsWith('0x') && value.length > 20) {
      return <span className="debug-state__hex">"{value}"</span>;
    }
    return <span className="debug-state__string">"{value}"</span>;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return <span className="debug-state__number">{String(value)}</span>;
  }

  if (typeof value === 'boolean') {
    return <span className="debug-state__boolean">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="debug-state__array">[]</span>;
    }
    return (
      <>
        <span className="debug-state__bracket">[</span>
        {value.map((item, i) => (
          <React.Fragment key={i}>
            {'\n' + indentStr + '  '}
            {formatValue(item, indent + 1)}
            {i < value.length - 1 && ','}
          </React.Fragment>
        ))}
        {'\n' + indentStr}
        <span className="debug-state__bracket">]</span>
      </>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="debug-state__object">{'{}'}</span>;
    }
    return (
      <>
        <span className="debug-state__bracket">{'{'}</span>
        {entries.map(([key, val], i) => (
          <React.Fragment key={key}>
            {'\n' + indentStr + '  '}
            <span className="debug-state__key">"{key}"</span>
            <span className="debug-state__colon">: </span>
            {formatValue(val, indent + 1)}
            {i < entries.length - 1 && ','}
          </React.Fragment>
        ))}
        {'\n' + indentStr}
        <span className="debug-state__bracket">{'}'}</span>
      </>
    );
  }

  return String(value);
}

/**
 * Build state object from snapshot
 */
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
  }
): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  // Always show function or opcode at the top
  if (snapshot.type === 'hook') {
    const detail = snapshot.detail as HookSnapshotDetail;
    state['[FUNCTION]'] = detail.functionName || 'unknown';
    state['[FILE]'] = `${detail.filePath}:${detail.line}`;
  } else {
    const detail = snapshot.detail as OpcodeSnapshotDetail;
    state['[FUNCTION]'] = options?.callStack?.length
      ? options.callStack[options.callStack.length - 1]?.functionName || 'unknown'
      : 'unknown';
    state['[OPCODE]'] = detail.opcodeName;
  }

  // Contract address
  if (snapshot.targetAddress || options?.to) {
    state['contract'] = {
      address: snapshot.targetAddress || options?.to,
    };
  }

  // From address (transaction sender)
  if (options?.from) {
    state['from'] = {
      address: options.from,
      // balance would require additional RPC call
    };
  }

  // To address (contract being called)
  if (options?.to) {
    state['to'] = {
      address: options.to,
    };
  }

  // Caller (immediate caller in the call chain)
  if (options?.callStack && options.callStack.length > 1) {
    const callerIndex = options.callStack.length - 2;
    const callerAddress = options.callStack[callerIndex]?.address;
    state['caller'] = {
      address: callerAddress,
    };
  } else if (options?.from) {
    // If no callStack, use from address as caller
    state['caller'] = {
      address: options.from,
    };
  }

  // Decoded input parameters
  if (options?.decodedInput && Object.keys(options.decodedInput).length > 0) {
    state['input'] = options.decodedInput;
  }

  // Raw calldata
  if (options?.calldata) {
    state['[RAW_INPUT]'] = options.calldata.length > 66
      ? `${options.calldata.substring(0, 66)}...`
      : options.calldata;
  }

  // Decoded output
  if (options?.decodedOutput && Object.keys(options.decodedOutput).length > 0) {
    state['output'] = options.decodedOutput;
  }

  // Gas information
  if (snapshot.type === 'opcode') {
    const detail = snapshot.detail as OpcodeSnapshotDetail;
    if (detail.gasRemaining) {
      const gasRemaining = parseInt(detail.gasRemaining, 10) || 0;
      const gasUsed = options?.totalGasUsed
        ? options.totalGasUsed - gasRemaining
        : undefined;

      state['gas'] = {
        gas_left: gasRemaining,
        ...(gasUsed !== undefined && { gas_used: gasUsed }),
        ...(options?.totalGasUsed && { total_gas_used: options.totalGasUsed }),
      };
    }
  }

  // Local variables (for hook snapshots)
  if (snapshot.type === 'hook') {
    const detail = snapshot.detail as HookSnapshotDetail;
    if (detail.locals && detail.locals.length > 0) {
      state['local_variables'] = Object.fromEntries(
        detail.locals.map((v) => [v.name, v.value])
      );
    }

    if (detail.stateVariables && detail.stateVariables.length > 0) {
      state['state_variables'] = Object.fromEntries(
        detail.stateVariables.map((v) => [v.name, v.value])
      );
    }
  }

  // Stack information (for opcode snapshots)
  if (snapshot.type === 'opcode') {
    const detail = snapshot.detail as OpcodeSnapshotDetail;
    if (detail.stack && detail.stack.length > 0) {
      state['stack'] = detail.stack.slice(0, 5); // Show top 5 stack items
      if (detail.stack.length > 5) {
        state['stack_depth'] = detail.stack.length;
      }
    }

    if (detail.storageAccess) {
      state['storage_access'] = {
        type: detail.storageAccess.type,
        slot: detail.storageAccess.slot,
        value: detail.storageAccess.value,
      };
    }
  }

  return state;
}

/**
 * Main Debug State Panel component
 */
export const DebugStatePanel: React.FC<DebugStatePanelProps> = React.memo(({
  className,
  simulationContext,
}) => {
  const { currentSnapshot, error, callStack } = useDebug();

  if (!currentSnapshot) {
    return (
      <div className={cn('debug-state debug-state--empty', className)}>
        <p className="text-xs text-muted-foreground p-4">
          No snapshot selected
        </p>
      </div>
    );
  }

  // Build options from available context data
  const buildOptions = {
    targetAddress: currentSnapshot.targetAddress,
    bytecodeAddress: currentSnapshot.bytecodeAddress,
    from: simulationContext?.from,
    to: simulationContext?.to || currentSnapshot.targetAddress,
    value: simulationContext?.value,
    calldata: simulationContext?.calldata,
    decodedInput: simulationContext?.decodedInput,
    decodedOutput: simulationContext?.decodedOutput,
    callStack: callStack?.map(frame => ({
      address: frame.address,
      functionName: frame.functionName,
    })),
  };

  const stateData = buildStateFromSnapshot(currentSnapshot, buildOptions);

  // Add error prominently at the end
  if (error) {
    stateData['[ERROR]'] = error;
  }

  return (
    <ScrollArea className={cn('debug-state', className)}>
      <pre className="debug-state__content">
        <code>{formatValue(stateData, 0)}</code>
      </pre>
    </ScrollArea>
  );
});

DebugStatePanel.displayName = 'DebugStatePanel';

export default DebugStatePanel;
