import { GetReadiness } from '../../../wailsjs/go/desktop/App';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { ModuleReadiness, ReadinessSource, ReadinessState } from '../../shared/contracts/readiness.types';
import { buildFrontendErrorReport, readBrowserErrorContext } from '../../shared/error-reporting/error-reporting.helpers';
import type { ReportFrontendError } from '../../shared/error-reporting/error-reporting.types';
import { createBridgeError } from '../../shared/query/bridge-error/bridge-error.helpers';
import { withBridgeErrors } from '../bridge-error/bridge-error.helpers';
import { frontendErrorReporter } from '../error-reporting/frontend-error-source.helpers';
import { createRuntimeSubscription, invokeGoBinding } from '../wails-bindings.helpers';
import { READINESS_EVENT_NAME, READINESS_STATES } from './readiness-source.constants';

/**
 * Reads one `desktop.ModuleReadiness` (from `GetReadiness()` or a
 * `bridge.readiness` event). Null when the module is not a non-empty string or
 * the state is not one `internal/lifecycle` reports; a reason is kept only
 * when it is a non-empty string.
 */
export function toModuleReadiness(wire: unknown): ModuleReadiness | null {
  // Destructuring a string or number yields undefined fields; only null and undefined need a stand-in.
  const { module, state, reason } = (wire ?? {}) as { module?: unknown; state?: unknown; reason?: unknown };
  if (typeof module !== 'string' || module === '' || !READINESS_STATES.includes(state as ReadinessState)) {
    return null;
  }

  const status: ModuleReadiness = { module, state: state as ReadinessState };
  return typeof reason === 'string' && reason !== '' ? { ...status, reason } : status;
}

/** Maps the whole snapshot; one unreadable entry fails it as `internal`, never guessed. */
function toReadinessSnapshot(wire: unknown): readonly ModuleReadiness[] {
  const entries: unknown = (wire as { modules?: unknown } | null)?.modules;
  if (!Array.isArray(entries)) {
    throw createBridgeError('internal', 'GetReadiness answered without a modules list');
  }

  return entries.map((entry) => {
    const status = toModuleReadiness(entry);
    if (status === null) {
      throw createBridgeError('internal', `GetReadiness answered an unreadable module: ${JSON.stringify(entry)}`);
    }
    return status;
  });
}

/**
 * The Wails adapter of the `ReadinessSource` port. `subscribe` shares one
 * `bridge.readiness` listener across consumers (StrictMode double mounts
 * included); an unreadable event is not forwarded but reported through
 * `report` (the shared frontend error reporter by default), so a drift between
 * Go and this parser is visible instead of silent. The gate's snapshot re-sync
 * covers the transition the event carried. `getReadiness` rejects with a
 * `BridgeError`, `unavailable` when the binding never attaches.
 */
export function createReadinessSource(report: ReportFrontendError = frontendErrorReporter): ReadinessSource {
  const transitions = createRuntimeSubscription<ModuleReadiness>((emit) =>
    EventsOn(READINESS_EVENT_NAME, (wire: unknown) => {
      const status = toModuleReadiness(wire);
      if (status === null) {
        const unreadable = `${READINESS_EVENT_NAME} event is unreadable: ${JSON.stringify(wire)}`;
        report(buildFrontendErrorReport('error', unreadable, readBrowserErrorContext(READINESS_EVENT_NAME)));
        return;
      }
      emit(status);
    }),
  );

  return {
    getReadiness: () =>
      withBridgeErrors(
        invokeGoBinding<unknown>(
          'GetReadiness',
          () => GetReadiness(),
          () => Promise.reject(createBridgeError('unavailable', 'the GetReadiness binding is not attached')),
        ),
      ).then(toReadinessSnapshot),
    subscribe: transitions.subscribe,
  };
}
