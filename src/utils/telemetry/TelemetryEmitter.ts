export type TelemetryEventPayload = Record<string, unknown> & {
  timestamp?: number;
};

export type TelemetryListener = (
  event: string,
  payload: TelemetryEventPayload
) => void;

export class TelemetryEmitter {
  private readonly listeners: Map<string, Set<TelemetryListener>>;
  private readonly fallback?: TelemetryListener;

  constructor(fallback?: TelemetryListener) {
    this.listeners = new Map();
    this.fallback = fallback;
  }

  on(event: string, listener: TelemetryListener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: TelemetryListener) {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload: TelemetryEventPayload = {}) {
    const enrichedPayload = {
      timestamp: Date.now(),
      ...payload,
    };

    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(event, enrichedPayload);
      } catch (error) {
        console.warn('TelemetryEmitter listener failed', { event, error });
      }
    });

    if (this.fallback) {
      try {
        this.fallback(event, enrichedPayload);
      } catch (error) {
        console.warn('TelemetryEmitter fallback failed', { event, error });
      }
    }
  }
}

export const consoleTelemetry = new TelemetryEmitter((event, payload) => {
  // eslint-disable-next-line no-console -- telemetry proxy
  console.debug(`[telemetry] ${event}`, payload);
});
