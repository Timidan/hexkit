import React from 'react';
import { WorkspaceProvider } from '@/contexts/WorkspaceContext';
import { WorkspaceLayout } from './WorkspaceLayout';

export default function WorkspacePage() {
  return (
    <WorkspaceProvider>
      <WorkspaceLayout />
    </WorkspaceProvider>
  );
}
