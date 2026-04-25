import React from 'react';
import ScannerTab from './ScannerTab';

export const DelegationInspectorPage: React.FC = () => (
  <div className="mx-auto max-w-4xl p-6">
    <h1 className="mb-4 text-xl font-semibold text-zinc-100">
      EIP-7702 Delegation Inspector
    </h1>
    <ScannerTab />
  </div>
);

export default DelegationInspectorPage;
