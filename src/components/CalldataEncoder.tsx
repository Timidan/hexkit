import React, { useState, useMemo, useCallback } from 'react';
import { ethers } from 'ethers';
import { WarningCircle } from '@phosphor-icons/react';
import { Button } from './ui/button';
import { CopyButton } from './ui/copy-button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { ToolIcon } from './icons/IconLibrary';
import {
  parseFunctionSignatureParameters,
  type ParsedSolidityParameter,
} from '../utils/solidityTypes';
import { isValidSolidityType, areValidSolidityParams } from './signature-database/helpers';

type EncoderMode = 'function' | 'raw';

/** Return a placeholder string for the given Solidity type. */
function placeholderForType(type: string): string {
  if (type === 'address') return '0x0000...0000';
  if (type === 'bool') return 'true / false';
  if (type === 'string') return 'hello world';
  if (type === 'bytes') return '0x';
  if (type.startsWith('bytes')) return '0x00';
  if (type.includes('int')) return '0';
  if (type.endsWith('[]')) return '["val1","val2"]  (JSON array)';
  if (type.startsWith('tuple')) return '["val1","val2"]  (JSON array)';
  return '';
}

function formatValue(value: string, type: string): string | number | boolean | ethers.BigNumber | unknown[] {
  const v = value.trim();
  if (v === '') {
    if (type.includes('int')) return 0;
    if (type === 'bool') return false;
    if (type === 'address') return ethers.constants.AddressZero;
    return '';
  }

  // Arrays & tuples — expect JSON
  if (type.endsWith('[]') || type.startsWith('tuple')) {
    try {
      const parsed = JSON.parse(v);
      if (type.endsWith('[]') && !Array.isArray(parsed)) return [parsed];
      return parsed;
    } catch {
      // Fall through — ethers will raise a clearer error
      return v;
    }
  }

  if (type === 'address') {
    try {
      return ethers.utils.getAddress(v.toLowerCase());
    } catch {
      return v; // let ethers raise the real error
    }
  }

  if (type.includes('int')) {
    try {
      return ethers.BigNumber.from(v);
    } catch {
      return v;
    }
  }
  if (type === 'bool') {
    return v === 'true' || v === '1';
  }
  return v;
}

function buildAbiInputs(params: ParsedSolidityParameter[]): { name: string; type: string; components?: ReturnType<typeof buildAbiInputs> }[] {
  return params.map((p, i) => ({
    name: p.name || `param${i}`,
    type: p.type,
    ...(p.components ? { components: buildAbiInputs(p.components) } : {}),
  }));
}

const CalldataEncoder: React.FC = () => {
  const [mode, setMode] = useState<EncoderMode>('function');
  const [signatureInput, setSignatureInput] = useState('');
  const [paramValues, setParamValues] = useState<string[]>([]);

  const parsed = useMemo(() => {
    const sig = signatureInput.trim();
    if (!sig) return { valid: false as const, params: [] as ParsedSolidityParameter[], funcName: '' };

    if (mode === 'function') {
      if (!/^\w+\(.*\)$/.test(sig)) return { valid: false as const, params: [] as ParsedSolidityParameter[], funcName: '' };
      const funcName = sig.slice(0, sig.indexOf('('));
      const paramsStr = sig.slice(sig.indexOf('(') + 1, -1);
      if (paramsStr.length > 0 && !areValidSolidityParams(paramsStr)) {
        return { valid: false as const, params: [] as ParsedSolidityParameter[], funcName };
      }
      const params = parseFunctionSignatureParameters(sig);
      return { valid: true as const, params, funcName };
    }

    if (!areValidSolidityParams(sig)) return { valid: false as const, params: [] as ParsedSolidityParameter[], funcName: '' };
    const params = parseFunctionSignatureParameters(`_encode(${sig})`);
    return { valid: true as const, params, funcName: '' };
  }, [signatureInput, mode]);

  const paramCount = parsed.params.length;
  const values = useMemo(() => {
    const arr = [...paramValues];
    while (arr.length < paramCount) arr.push('');
    return arr.slice(0, paramCount);
  }, [paramValues, paramCount]);

  const setValueAt = useCallback((index: number, val: string) => {
    setParamValues(prev => {
      const next = [...prev];
      while (next.length <= index) next.push('');
      next[index] = val;
      return next;
    });
  }, []);

  const encodeResult = useMemo<{ encoded: string; error: string | null }>(() => {
    if (!parsed.valid || parsed.params.length === 0) {
      if (mode === 'function' && parsed.valid && parsed.funcName) {
        try {
          const abiFragment = { type: 'function' as const, name: parsed.funcName, inputs: [], outputs: [], stateMutability: 'nonpayable' as const };
          const iface = new ethers.utils.Interface([abiFragment]);
          return { encoded: iface.encodeFunctionData(parsed.funcName, []), error: null };
        } catch (e: any) {
          return { encoded: '', error: e.message ?? 'Encoding failed' };
        }
      }
      return { encoded: '', error: null };
    }

    const formattedValues = parsed.params.map((p, i) => formatValue(values[i] ?? '', p.type));

    try {
      if (mode === 'function') {
        const inputs = buildAbiInputs(parsed.params);
        const abiFragment = {
          type: 'function' as const,
          name: parsed.funcName,
          inputs,
          outputs: [],
          stateMutability: 'nonpayable' as const,
        };
        const iface = new ethers.utils.Interface([abiFragment]);
        const encoded = iface.encodeFunctionData(parsed.funcName, formattedValues);
        return { encoded, error: null };
      }

      const types = parsed.params.map(p => p.type);
      const encoded = ethers.utils.defaultAbiCoder.encode(types, formattedValues);
      return { encoded, error: null };
    } catch (e: any) {
      return { encoded: '', error: e.reason ?? e.message ?? 'Encoding failed' };
    }
  }, [parsed, values, mode]);

  const handleSignatureChange = useCallback((val: string) => {
    setSignatureInput(val);
  }, []);

  const handleModeChange = useCallback((m: string) => {
    setMode(m as EncoderMode);
    setSignatureInput('');
    setParamValues([]);
  }, []);

  return (
    <div className="border border-border/50 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ToolIcon width={14} height={14} />
        Calldata Encoder
      </div>

      <Tabs value={mode} onValueChange={handleModeChange}>
        <div className="flex justify-center">
          <TabsList className="tool-pill-tabs h-auto w-auto bg-transparent p-0">
            <TabsTrigger value="function" className="tool-pill-tab">
              Function Calldata
            </TabsTrigger>
            <TabsTrigger value="raw" className="tool-pill-tab">
              ABI Encode Args
            </TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
        <Label className="text-xs">
          {mode === 'function' ? 'Signature' : 'Types'}
        </Label>
        <Input
          value={signatureInput}
          onChange={(e) => handleSignatureChange(e.target.value)}
          placeholder={mode === 'function' ? 'transfer(address,uint256)' : 'address,uint256,bool'}
          className="font-mono h-8 text-xs"
        />
      </div>

      {mode === 'function' && (
        <p className="text-[10px] text-muted-foreground -mt-1.5 ml-[112px]">
          Full function signature, e.g. <code className="bg-muted/30 px-1 rounded">approve(address,uint256)</code>
        </p>
      )}
      {mode === 'raw' && (
        <p className="text-[10px] text-muted-foreground -mt-1.5 ml-[112px]">
          Comma-separated types, e.g. <code className="bg-muted/30 px-1 rounded">address,uint256,bool</code>
        </p>
      )}

      {parsed.valid && parsed.params.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border/30">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Parameters ({parsed.params.length})
          </div>
          {parsed.params.map((param, i) => (
            <div key={`${param.type}-${i}`} className="grid grid-cols-[100px_1fr] gap-3 items-center">
              <Label className="text-xs flex items-center gap-1 truncate" title={param.name || `param${i}`}>
                <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono shrink-0">
                  {param.type}
                </Badge>
                <span className="truncate">{param.name || `arg${i}`}</span>
              </Label>
              <Input
                value={values[i] ?? ''}
                onChange={(e) => setValueAt(i, e.target.value)}
                placeholder={placeholderForType(param.type)}
                className="font-mono h-8 text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {encodeResult.error && (
        <Alert variant="destructive" className="py-2">
          <WarningCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">{encodeResult.error}</AlertDescription>
        </Alert>
      )}

      {encodeResult.encoded && !encodeResult.error && (
        <div className="mt-1 pt-3 border-t border-border/50 space-y-2">
          <div className="text-xs font-medium">
            {mode === 'function' ? 'Encoded Calldata' : 'Encoded Arguments'}
          </div>
          <div className="bg-muted/20 rounded p-2 space-y-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-medium text-muted-foreground">
                {encodeResult.encoded.length / 2 - 1} bytes
              </span>
              <CopyButton value={encodeResult.encoded} ariaLabel="Copy encoded data" iconSize={12} />
            </div>
            <code className="block py-1.5 px-2 rounded bg-background font-mono text-[10px] break-all select-all max-h-40 overflow-y-auto">
              {encodeResult.encoded}
            </code>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalldataEncoder;
