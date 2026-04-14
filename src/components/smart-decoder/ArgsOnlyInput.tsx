import React from 'react';
import {
  Plus,
  Trash,
  CaretDown,
} from '@phosphor-icons/react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '../ui/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const SOLIDITY_TYPES = [
  'address', 'uint256', 'uint128', 'uint64', 'uint32', 'uint16', 'uint8',
  'int256', 'int128', 'bool', 'bytes32', 'bytes20', 'bytes4', 'bytes',
  'string', 'address[]', 'uint256[]', 'bytes32[]',
];

export interface ArgsOnlyParam {
  type: string;
  name: string;
}

interface ArgsOnlyInputProps {
  argsOnlyData: string;
  setArgsOnlyData: (v: string) => void;
  argsOnlyParams: ArgsOnlyParam[];
  addArgsOnlyParam: () => void;
  removeArgsOnlyParam: (i: number) => void;
  updateArgsOnlyParam: (i: number, field: 'type' | 'name', val: string) => void;
}

const ArgsOnlyInput: React.FC<ArgsOnlyInputProps> = ({
  argsOnlyData,
  setArgsOnlyData,
  argsOnlyParams,
  addArgsOnlyParam,
  removeArgsOnlyParam,
  updateArgsOnlyParam,
}) => {
  return (
    <>
      <div className="space-y-1 min-w-0 overflow-hidden">
        <Textarea
          value={argsOnlyData}
          onChange={(e) => setArgsOnlyData(e.target.value)}
          placeholder="0x0000000000000000000000007a250d5630b4cf539739df2c5dacb4c659f2488d..."
          rows={2}
          className="font-mono text-sm resize-none break-all w-full min-w-0 max-h-20 overflow-y-auto"
        />
        <p className="text-xs text-muted-foreground">Raw ABI-encoded bytes (no function selector)</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Parameter Types</Label>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={addArgsOnlyParam}>
            <Plus width={10} height={10} />
            Add
          </Button>
        </div>
        {argsOnlyParams.map((param, i) => (
          <InputGroup key={i} className="h-7 max-w-sm">
            <InputGroupAddon>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <InputGroupButton variant="ghost" className="font-mono text-xs gap-0.5 !pr-1">
                    {param.type} <CaretDown className="size-2.5 opacity-50" />
                  </InputGroupButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-60 overflow-y-auto">
                  {SOLIDITY_TYPES.map(t => (
                    <DropdownMenuItem key={t} className="font-mono text-xs" onClick={() => updateArgsOnlyParam(i, 'type', t)}>
                      {t}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </InputGroupAddon>
            <InputGroupInput
              value={param.name}
              onChange={(e) => updateArgsOnlyParam(i, 'name', e.target.value)}
              placeholder={`param_${i} (optional name)`}
              className="h-7 text-xs"
            />
            {argsOnlyParams.length > 1 && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton variant="ghost" size="icon-xs" onClick={() => removeArgsOnlyParam(i)}>
                  <Trash className="size-2.5" />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        ))}
      </div>
    </>
  );
};

export default ArgsOnlyInput;
