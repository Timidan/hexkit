import React, { useMemo } from 'react';

import ComplexValueViewer from './ui/ComplexValueViewer';
import {
  createNodeFromValue,
  type ComplexValueMetadata,
} from '../utils/complexValueBuilder';

interface ABIInput {
  name: string;
  type: string;
  internalType?: string;
  components?: ABIInput[];
}

interface ContractDataDisplayProps {
  data: any;
  abiDefinition: ABIInput;
  mode?: 'compact' | 'expanded';
  nestingLevel?: number;
}

const mapAbiToMetadata = (
  abi: ABIInput,
  index = 0
): ComplexValueMetadata => ({
  label: abi.name || `field_${index}`,
  name: abi.name,
  type: abi.type,
  components: Array.isArray(abi.components)
    ? abi.components.map((component, componentIndex) =>
        mapAbiToMetadata(component, componentIndex)
      )
    : undefined,
});

const ContractDataDisplay: React.FC<ContractDataDisplayProps> = ({
  data,
  abiDefinition,
  mode = 'compact',
}) => {
  const metadata = useMemo<ComplexValueMetadata>(() => {
    return mapAbiToMetadata(abiDefinition);
  }, [abiDefinition]);

  const node = useMemo(() => {
    return createNodeFromValue(data, metadata);
  }, [data, metadata]);

  return (
    <ComplexValueViewer
      node={node}
      showControls={mode !== 'compact'}
      options={{
        collapse: {
          root: true,
          depth: mode === 'compact' ? 1 : 2,
          arrayItems: mode === 'compact' ? 4 : 8,
          objectKeys: mode === 'compact' ? 6 : 12,
        },
        previewItems: mode === 'compact' ? 2 : 4,
      }}
    />
  );
};

export default ContractDataDisplay;
export type { ABIInput, ContractDataDisplayProps };
