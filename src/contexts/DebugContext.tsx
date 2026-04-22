/**
 * Debug Context
 *
 * Barrel re-export from the refactored debug module.
 * All logic has been split into smaller files under ./debug/
 *
 * This file exists so that existing imports like:
 *   import { useDebug } from '../contexts/DebugContext'
 *   import { DebugProvider } from '../contexts/DebugContext'
 * continue to work without changes.
 */

export {
  DebugProvider,
  useDebug,
  useDebugSessionContext,
  useDebugNavigationContext,
  useDebugInspectionContext,
} from './debug/DebugProvider';
