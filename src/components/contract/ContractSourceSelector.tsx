import React from 'react';
import { Button } from '../shared';
import '../../styles/ContractComponents.css';

export interface ContractSourceSelectorProps {
  contractSource: 'project' | 'address';
  onSourceChange: (source: 'project' | 'address') => void;
  className?: string;
}

const ContractSourceSelector: React.FC<ContractSourceSelectorProps> = ({
  contractSource,
  onSourceChange,
  className = ''
}) => {
  return (
    <div className={`source-selector-container ${className}`}>
      <Button
        variant={contractSource === 'project' ? 'primary' : 'ghost'}
        onClick={() => onSourceChange('project')}
        className="source-selector-button"
      >
        From Project
      </Button>
      <Button
        variant={contractSource === 'address' ? 'primary' : 'ghost'}
        onClick={() => onSourceChange('address')}
        className="source-selector-button"
      >
        From Address
      </Button>
    </div>
  );
};

export default ContractSourceSelector;