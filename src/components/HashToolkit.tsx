import React, { useState, useMemo } from 'react';
import { ethers } from 'ethers';
import { Button } from './ui/button';
import { CopyButton } from './ui/copy-button';
import { Input } from './ui/input';
import { InputGroup, InputGroupAddon, InputGroupInput } from './ui/input-group';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, AnimatedSelectValue } from './ui/select';
import { Alert, AlertDescription } from './ui/alert';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { AnimatedTabContent } from './ui/animated-tabs';
import { WarningCircle, Plus, Trash } from '@phosphor-icons/react';
import { ToolIcon, HashIcon } from './icons/IconLibrary';

type HashOperation = 'keccak256' | 'sha256' | 'abi.encode' | 'abi.encodePacked';
type InputEncoding = 'utf8' | 'hex';

interface AbiParam {
  type: string;
  value: string;
}

const HashToolkit: React.FC = () => {
  const [operation, setOperation] = useState<HashOperation>('keccak256');
  const [inputEncoding, setInputEncoding] = useState<InputEncoding>('utf8');
  const [rawInput, setRawInput] = useState('');
  const [abiParams, setAbiParams] = useState<AbiParam[]>([{ type: 'address', value: '' }]);

  const isSimpleHash = operation === 'keccak256' || operation === 'sha256';

  const result = useMemo(() => {
    try {
      if (isSimpleHash) {
        if (!rawInput.trim()) return { output: '', error: null };

        let data: string;
        if (inputEncoding === 'hex') {
          const hex = rawInput.startsWith('0x') ? rawInput : '0x' + rawInput;
          if (!/^0x[0-9a-fA-F]*$/.test(hex)) {
            return { output: '', error: 'Invalid hex string' };
          }
          if (hex.length % 2 !== 0) {
            return { output: '', error: 'Hex string must have even length' };
          }
          data = hex;
        } else {
          if (operation === 'keccak256') {
            return { output: ethers.utils.keccak256(ethers.utils.toUtf8Bytes(rawInput)), error: null };
          } else {
            return { output: ethers.utils.sha256(ethers.utils.toUtf8Bytes(rawInput)), error: null };
          }
        }

        if (operation === 'keccak256') {
          return { output: ethers.utils.keccak256(data), error: null };
        } else {
          return { output: ethers.utils.sha256(data), error: null };
        }
      } else {
        const validParams = abiParams.filter(p => p.type.trim() && p.value.trim());
        if (validParams.length === 0) return { output: '', error: null };

        const types = validParams.map(p => p.type.trim());
        const values = validParams.map(p => {
          const t = p.type.trim();
          const v = p.value.trim();
          if (t.startsWith('uint') || t.startsWith('int')) {
            return ethers.BigNumber.from(v);
          }
          if (t === 'bool') {
            return v === 'true' || v === '1';
          }
          if (t.match(/^bytes\d+$/)) {
            return v.startsWith('0x') ? v : '0x' + v;
          }
          if (t.endsWith('[]')) {
            try { return JSON.parse(v); } catch { return v; }
          }
          return v;
        });

        if (operation === 'abi.encode') {
          const encoded = ethers.utils.defaultAbiCoder.encode(types, values);
          return { output: encoded, error: null };
        } else {
          const packed = ethers.utils.solidityPack(types, values);
          return { output: packed, error: null };
        }
      }
    } catch (e: unknown) {
      return { output: '', error: e instanceof Error ? e.message : 'Computation failed' };
    }
  }, [operation, rawInput, inputEncoding, abiParams, isSimpleHash]);

  const selectorSlice = isSimpleHash && result.output ? result.output.slice(0, 10) : '';

  const addParam = () => setAbiParams([...abiParams, { type: '', value: '' }]);
  const removeParam = (index: number) => setAbiParams(abiParams.filter((_, i) => i !== index));
  const updateParam = (index: number, field: 'type' | 'value', val: string) => {
    const updated = [...abiParams];
    updated[index] = { ...updated[index], [field]: val };
    setAbiParams(updated);
  };

  return (
    <div className="border border-border/50 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        <ToolIcon width={14} height={14} />
        Hash Toolkit
      </div>
      <Tabs value={operation} onValueChange={(v) => setOperation(v as HashOperation)} className="mb-1">
        <div className="flex justify-center overflow-x-auto pb-1">
          <TabsList className="tool-pill-tabs h-auto w-auto bg-transparent p-0">
            <TabsTrigger value="keccak256" className="tool-pill-tab">keccak256</TabsTrigger>
            <TabsTrigger value="sha256" className="tool-pill-tab">sha256</TabsTrigger>
            <TabsTrigger value="abi.encode" className="tool-pill-tab">abi.encode</TabsTrigger>
            <TabsTrigger value="abi.encodePacked" className="tool-pill-tab">encodePacked</TabsTrigger>
          </TabsList>
        </div>
      </Tabs>

      <AnimatedTabContent activeKey={operation}>
        {isSimpleHash ? (
          <div className="space-y-2">
            <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
              <Label className="text-xs">Encoding</Label>
              <Select value={inputEncoding} onValueChange={(v) => setInputEncoding(v as InputEncoding)}>
                <SelectTrigger className="h-7 text-xs w-28">
                  <AnimatedSelectValue value={inputEncoding === 'utf8' ? 'UTF-8' : 'Hex'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="utf8">UTF-8</SelectItem>
                  <SelectItem value="hex">Hex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-3 items-center">
              <Label className="text-xs flex items-center gap-1">
                <HashIcon width={12} height={12} />
                Input
              </Label>
              <Input
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={inputEncoding === 'hex' ? '0xabcdef...' : 'Hello World'}
                className="font-mono h-8 text-xs"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Parameters</Label>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addParam}>
                <Plus width={10} height={10} />
                Add
              </Button>
            </div>
            {abiParams.map((param, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <InputGroup className="h-7 max-w-md">
                  <InputGroupAddon className="border-r border-border/20 pr-0">
                    <Select value={param.type} onValueChange={(v) => updateParam(i, 'type', v)}>
                      <SelectTrigger className="font-mono h-full text-[10px] w-[90px] border-none rounded-none shadow-none ring-0 bg-transparent dark:bg-transparent dark:hover:bg-transparent focus:ring-0 focus-visible:ring-0 px-2">
                        <AnimatedSelectValue value={param.type} placeholder="type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="address">address</SelectItem>
                        <SelectItem value="uint256">uint256</SelectItem>
                        <SelectItem value="uint128">uint128</SelectItem>
                        <SelectItem value="uint64">uint64</SelectItem>
                        <SelectItem value="uint32">uint32</SelectItem>
                        <SelectItem value="uint16">uint16</SelectItem>
                        <SelectItem value="uint8">uint8</SelectItem>
                        <SelectItem value="int256">int256</SelectItem>
                        <SelectItem value="int128">int128</SelectItem>
                        <SelectItem value="bool">bool</SelectItem>
                        <SelectItem value="bytes32">bytes32</SelectItem>
                        <SelectItem value="bytes20">bytes20</SelectItem>
                        <SelectItem value="bytes4">bytes4</SelectItem>
                        <SelectItem value="bytes">bytes</SelectItem>
                        <SelectItem value="string">string</SelectItem>
                        <SelectItem value="address[]">address[]</SelectItem>
                        <SelectItem value="uint256[]">uint256[]</SelectItem>
                        <SelectItem value="bytes32[]">bytes32[]</SelectItem>
                      </SelectContent>
                    </Select>
                  </InputGroupAddon>
                  <InputGroupInput
                    value={param.value}
                    onChange={(e) => updateParam(i, 'value', e.target.value)}
                    placeholder="0x..."
                    className="font-mono h-7 text-[10px]"
                  />
                </InputGroup>
                {abiParams.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeParam(i)}>
                    <Trash width={10} height={10} />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </AnimatedTabContent>

      {result.error && (
        <Alert variant="destructive" className="py-2">
          <WarningCircle className="h-3 w-3" />
          <AlertDescription className="text-xs">{result.error}</AlertDescription>
        </Alert>
      )}

      {result.output && (
        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
          <div className="text-xs font-medium">Result</div>
          <div className="bg-muted/20 rounded p-2 space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-muted-foreground">
                  {isSimpleHash ? `${operation} Hash` : `${operation} Output`}
                </span>
                <CopyButton value={result.output} ariaLabel="Copy result" iconSize={12} />
              </div>
              <code className="block py-1.5 px-2 rounded bg-background font-mono text-[10px] break-all">{result.output}</code>
            </div>
            {selectorSlice && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium text-muted-foreground">4-byte Selector</span>
                  <CopyButton value={selectorSlice} ariaLabel="Copy selector" iconSize={12} />
                </div>
                <code className="block py-1.5 px-2 rounded bg-background font-mono text-xs">{selectorSlice}</code>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground">
              {result.output.length > 2 ? `${(result.output.length - 2) / 2} bytes` : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HashToolkit;
