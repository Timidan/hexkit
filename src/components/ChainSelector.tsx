import React from 'react';
import type { Chain } from '../types';
import { SUPPORTED_CHAINS } from '../utils/chains';

interface ChainSelectorProps {
  selectedChain: Chain;
  onChainChange: (chain: Chain) => void;
  disabled?: boolean;
}

const ChainSelector: React.FC<ChainSelectorProps> = ({
  selectedChain,
  onChainChange,
  disabled = false,
}) => {
  return (
    <div className="form-group">
      <label>Blockchain Network</label>
      <select
        value={selectedChain.id}
        onChange={(e) => {
          const chainId = parseInt(e.target.value);
          const chain = SUPPORTED_CHAINS.find(c => c.id === chainId);
          if (chain) {
            onChainChange(chain);
          }
        }}
        disabled={disabled}
      >
        {SUPPORTED_CHAINS.map((chain) => (
          <option key={chain.id} value={chain.id}>
            {chain.name} ({chain.nativeCurrency.symbol})
          </option>
        ))}
      </select>
    </div>
  );
};

export default ChainSelector;