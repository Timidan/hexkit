import type {
  DebugSessionConnectOptions,
  DebugSessionSource,
  DebugSessionStartOptions,
  StartDebugSessionRequest,
} from '../../types/debug';

interface DebugSessionLifecycleActions {
  connect: (
    session: Extract<DebugSessionSource, { kind: 'live-connect' }>['session'],
    options?: DebugSessionConnectOptions
  ) => Promise<void>;
  start: (
    request: StartDebugSessionRequest,
    options?: DebugSessionStartOptions
  ) => Promise<void>;
  fromTrace: (
    trace: Extract<DebugSessionSource, { kind: 'decoded-trace' }>['trace']
  ) => void;
}

/** Select the backing Adapter for a new Debug Session in one place. */
export async function openDebugSessionFromSource(
  source: DebugSessionSource,
  actions: DebugSessionLifecycleActions
): Promise<void> {
  switch (source.kind) {
    case 'live-connect':
      await actions.connect(source.session, source.options);
      return;
    case 'live-start':
      await actions.start(source.request, source.options);
      return;
    case 'decoded-trace':
      actions.fromTrace(source.trace);
      return;
  }
}
