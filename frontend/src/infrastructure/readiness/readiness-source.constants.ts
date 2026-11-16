import type { ReadinessState } from '../../shared/contracts/readiness.types';

/** Wails event every readiness transition is forwarded as (`lifecycle.EventNameReadinessChanged`). */
export const READINESS_EVENT_NAME = 'bridge.readiness';

/** Every state `internal/lifecycle` reports; any other value is unreadable. */
export const READINESS_STATES: readonly ReadinessState[] = ['starting', 'ready', 'failed'];
