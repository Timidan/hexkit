import React from 'react';
import { Textarea } from '../ui/textarea';
import { Button } from '../ui/button';
import { parsePayload, type ParseResult } from '../../utils/signature/parse';

const EXAMPLE = `{
  "domain": {
    "name": "USD Coin",
    "version": "2",
    "chainId": 1,
    "verifyingContract": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
  },
  "types": {
    "EIP712Domain": [
      { "name": "name", "type": "string" },
      { "name": "version", "type": "string" },
      { "name": "chainId", "type": "uint256" },
      { "name": "verifyingContract", "type": "address" }
    ],
    "Permit": [
      { "name": "owner", "type": "address" },
      { "name": "spender", "type": "address" },
      { "name": "value", "type": "uint256" },
      { "name": "nonce", "type": "uint256" },
      { "name": "deadline", "type": "uint256" }
    ]
  },
  "primaryType": "Permit",
  "message": {
    "owner": "0x1111111111111111111111111111111111111111",
    "spender": "0x2222222222222222222222222222222222222222",
    "value": "115792089237316195423570985008687907853269984665640564039457584007913129639935",
    "nonce": "0",
    "deadline": "1893456000"
  }
}`;

type Props = {
  value: string;
  onChange: (value: string) => void;
  onParsed: (result: ParseResult) => void;
};

export const PayloadInput: React.FC<Props> = ({ value, onChange, onParsed }) => {
  const handleDrop = async (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const text = await e.dataTransfer.files[0]?.text?.();
    if (text) {
      onChange(text);
      onParsed(parsePayload(text));
    }
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onChange(text);
      onParsed(parsePayload(text));
    } catch {
      // ignore
    }
  };

  const loadExample = () => {
    onChange(EXAMPLE);
    onParsed(parsePayload(EXAMPLE));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={pasteFromClipboard}>
          Paste
        </Button>
        <Button variant="outline" size="sm" onClick={loadExample}>
          Load example
        </Button>
        <span className="text-xs text-zinc-500">
          Paste a raw EIP-712 JSON, eth_signTypedData envelope, or /database/preview?data= link
        </span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          onParsed(parsePayload(e.target.value));
        }}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        rows={10}
        className="font-mono text-xs"
        placeholder="Paste signature payload here…"
      />
    </div>
  );
};

export default PayloadInput;
