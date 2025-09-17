import React from 'react';
import { Button } from '../shared';
import { Settings, Play } from 'lucide-react';
import '../../styles/ContractComponents.css';

export interface FunctionModeSelectorProps {
  functionMode: 'function' | 'raw';
  onModeChange: (mode: 'function' | 'raw') => void;
  className?: string;
}

const FunctionModeSelector: React.FC<FunctionModeSelectorProps> = ({
  functionMode,
  onModeChange,
  className = ''
}) => {
  return (
    <div className={`mode-selector-container ${className}`}>
      <Button
        variant={functionMode === 'function' ? 'primary' : 'ghost'}
        onClick={() => onModeChange('function')}
        icon={<Settings size={16} />}
        className="mode-selector-button"
      >
        Function Interface
      </Button>
      <Button
        variant={functionMode === 'raw' ? 'primary' : 'ghost'}
        onClick={() => onModeChange('raw')}
        icon={<Play size={16} />}
        className="mode-selector-button"
      >
        Raw Calldata
      </Button>
    </div>
  );
};

export default FunctionModeSelector;