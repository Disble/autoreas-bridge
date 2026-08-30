import { SearchRuntimeEvents, SummarizeRuntimeEvents } from '../../../wailsjs/go/main/App';
import type { contracts as wailsContracts } from '../../../wailsjs/go/models';
import { EventsOn } from '../../../wailsjs/runtime/runtime';
import type { ObservabilityLogEntry } from '../../shared/contracts/observability.types';
import type {
  RuntimeEventFilters,
  RuntimeEventPage,
  RuntimeEventQuery,
  RuntimeEventSummary,
} from '../../shared/contracts/runtime-event.types';
import { OBSERVABILITY_EVENT_NAME } from '../observability-log-source/observability-log-source.constants';
import { createRuntimeSubscription, hasGoBinding, invokeGoBinding } from '../wails-bindings.helpers';
import {
  DEGRADED_EMPTY_RUNTIME_EVENT_PAGE,
  DEGRADED_RUNTIME_EVENT_SUMMARY,
  RUNTIME_EVENT_SOURCE_STATE,
} from './runtime-event-source.constants';
import type { RuntimeEventSource } from './runtime-event-source.types';

/**
 * Maps the app-facing (camelCase) filter shape into the Wails binding's wire
 * request. `contracts.EventFilterQuery` carries no JSON tags, so the Go bound
 * method expects the raw (PascalCase) struct field names verbatim. An absent
 * string filter is sent as the empty string, which the reader treats as "no
 * filter"; the two time bounds stay optional because 0 is a valid instant.
 */
function toEventFilterWireShape(filters: Readonly<RuntimeEventFilters>) {
  return {
    Domain: filters.domain ?? '',
    Level: filters.level ?? '',
    EventType: filters.eventType ?? '',
    CorrelationID: filters.correlationId ?? '',
    EntityID: filters.entityId ?? '',
    Text: filters.text ?? '',
    StartMS: filters.startMs,
    EndMS: filters.endMs,
  } as unknown as wailsContracts.EventFilterQuery;
}

/** Maps one app-facing page request into the binding's wire query shape. */
function toEventQueryWireShape(query: Readonly<RuntimeEventQuery>): wailsContracts.EventQuery {
  return {
    Limit: query.limit ?? 0,
    Cursor: query.cursor ?? '',
    Filters: toEventFilterWireShape(query.filters ?? {}),
  } as unknown as wailsContracts.EventQuery;
}

/**
 * Creates the singleton runtime-backed persisted runtime-event source. Both
 * reads degrade to an unavailable, `degraded: true` envelope rather than
 * rejecting when the Wails bindings are not yet attached.
 */
export function createRuntimeEventSource(): RuntimeEventSource {
  if (RUNTIME_EVENT_SOURCE_STATE.sharedSource !== null) {
    return RUNTIME_EVENT_SOURCE_STATE.sharedSource;
  }

  const eventSubscription = createRuntimeSubscription<ObservabilityLogEntry>((emit) => {
    return EventsOn(OBSERVABILITY_EVENT_NAME, (entry: unknown) => {
      if (entry !== undefined) {
        emit(entry as ObservabilityLogEntry);
      }
    });
  });

  RUNTIME_EVENT_SOURCE_STATE.sharedSource = {
    searchEvents(query): Promise<RuntimeEventPage> {
      return invokeGoBinding<RuntimeEventPage>(
        'SearchRuntimeEvents',
        () => SearchRuntimeEvents(toEventQueryWireShape(query)),
        () => DEGRADED_EMPTY_RUNTIME_EVENT_PAGE,
      );
    },
    summarizeEvents(filters): Promise<RuntimeEventSummary> {
      return invokeGoBinding<RuntimeEventSummary>(
        'SummarizeRuntimeEvents',
        () => SummarizeRuntimeEvents(toEventFilterWireShape(filters)),
        () => DEGRADED_RUNTIME_EVENT_SUMMARY,
      );
    },
    subscribe(listener) {
      return eventSubscription.subscribe(listener);
    },
  };

  return RUNTIME_EVENT_SOURCE_STATE.sharedSource;
}

/** Reports whether both persisted runtime-event read bindings are currently attached. */
export function isRuntimeEventSourceAvailable(): boolean {
  return hasGoBinding('SearchRuntimeEvents') && hasGoBinding('SummarizeRuntimeEvents');
}
