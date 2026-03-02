/**
 * useDebugBreakpoints - Breakpoint management hook
 *
 * Handles adding, removing, toggling breakpoints and updating conditions.
 */

import { useCallback } from 'react';
import type { Breakpoint, BreakpointLocation } from '../../types/debug';
import { generateId } from './debugHelpers';
import type { DebugSharedState, DebugBreakpointActions } from './types';

export function useDebugBreakpoints(state: DebugSharedState): DebugBreakpointActions {
  const { setBreakpoints } = state;

  const addBreakpoint = useCallback((location: BreakpointLocation, condition?: string) => {
    const newBreakpoint: Breakpoint = {
      id: generateId(),
      location,
      condition,
      enabled: true,
      hitCount: 0,
    };

    setBreakpoints(prev => [...prev, newBreakpoint]);
  }, []);

  const removeBreakpoint = useCallback((id: string) => {
    setBreakpoints(prev => prev.filter(bp => bp.id !== id));
  }, []);

  const toggleBreakpoint = useCallback((id: string) => {
    setBreakpoints(prev =>
      prev.map(bp => (bp.id === id ? { ...bp, enabled: !bp.enabled } : bp))
    );
  }, []);

  const updateBreakpointCondition = useCallback((id: string, condition: string) => {
    setBreakpoints(prev =>
      prev.map(bp => (bp.id === id ? { ...bp, condition } : bp))
    );
  }, []);

  return {
    addBreakpoint,
    removeBreakpoint,
    toggleBreakpoint,
    updateBreakpointCondition,
  };
}
