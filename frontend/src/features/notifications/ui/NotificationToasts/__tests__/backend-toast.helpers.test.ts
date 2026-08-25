import { describe, expect, it, vi } from 'vitest';
import type { Notification } from '../../../../../shared/contracts/notification.types';
import { toBackendAppNotification } from '../backend-toast.helpers';

/** Builds a pushed notification, defaulting to the smallest shape that reaches a toast. */
function buildPush(overrides: Partial<Notification> = {}): Notification {
  return {
    Title: 'Download run completed',
    Body: '1 episode(s) downloaded.',
    Level: 'success',
    Source: 'download',
    Kind: 'run_completed',
    CorrelationID: 'run-1',
    Timestamp: '2026-08-25T12:00:00Z',
    ...overrides,
  };
}

describe('toBackendAppNotification', () => {
  it('carries the fields a toast renders, plus the identity a press needs', () => {
    const got = toBackendAppNotification(buildPush({ RecordID: 42 }), vi.fn());

    expect(got.title).toBe('Download run completed');
    expect(got.description).toBe('1 episode(s) downloaded.');
    expect(got.severity).toBe('success');
    expect(got.recordId).toBe(42);
  });

  // The rows were on the wire from the first producer that attached any, and the resolver mapped
  // seven fields past them. A toast that says "1 episode(s) downloaded" without naming the anime
  // is the same defect the master list had.
  it('names what the notification is about', () => {
    const got = toBackendAppNotification(
      buildPush({
        Rows: [
          { RefType: 'anime', RefID: 'a-1', Name: 'Frieren', Status: 'downloaded', Detail: 'Episode 19', CollapsedCount: 0 },
        ],
      }),
      vi.fn(),
    );

    expect(got.rows).toEqual([
      { refType: 'anime', refId: 'a-1', name: 'Frieren', status: 'downloaded', detail: 'Episode 19', collapsedCount: 0 },
    ]);
  });

  // Table C: the toast renders L1 only. A row verb here would ask the user to pick between per-row
  // actions on a surface that lasts seconds.
  it('offers the whole-notification verbs and leaves the row verbs to the Center', () => {
    const got = toBackendAppNotification(
      buildPush({
        RecordID: 42,
        Actions: [
          { ID: 'act-1', Label: 'Open Downloads', Intent: 'navigation.open', Args: { route: '/downloads' }, RowRef: '' },
          { ID: 'act-2', Label: 'Watch', Intent: 'navigation.open', Args: {}, RowRef: 'a-1' },
        ],
      }),
      vi.fn(),
    );

    expect(got.actions?.map((action) => action.label)).toEqual(['Open Downloads']);
  });

  it('presses a verb against the persisted token it names', () => {
    const executeAction = vi.fn();
    const got = toBackendAppNotification(
      buildPush({
        RecordID: 42,
        Actions: [{ ID: 'act-1', Label: 'Open Downloads', Intent: 'navigation.open', Args: {}, RowRef: '' }],
      }),
      executeAction,
    );

    got.actions?.[0].onPress();

    expect(executeAction).toHaveBeenCalledWith(42, 'act-1');
  });

  // A delivery nothing persisted still reaches the toast. Its verbs address no token, so rendering
  // them would produce a button that refuses on press -- which, from the user's side, looks exactly
  // like the missing button it replaced.
  it('drops a verb that addresses no persisted token', () => {
    const got = toBackendAppNotification(
      buildPush({
        Actions: [{ ID: '', Label: 'Open Downloads', Intent: 'navigation.open', Args: {}, RowRef: '' }],
      }),
      vi.fn(),
    );

    expect(got.actions ?? []).toEqual([]);
  });

  it('drops a verb when the record itself was never persisted', () => {
    const got = toBackendAppNotification(
      buildPush({
        Actions: [{ ID: 'act-1', Label: 'Open Downloads', Intent: 'navigation.open', Args: {}, RowRef: '' }],
      }),
      vi.fn(),
    );

    expect(got.actions ?? []).toEqual([]);
  });

  // A backend toast is ephemeral. Persisting it would leave it on screen for the rest of the
  // session, which is the exact defect the missed-schedule toast's own timeout=0 exists to cause
  // deliberately -- and must never happen by accident to a routine run notification.
  it('is ephemeral, never persistent', () => {
    expect(toBackendAppNotification(buildPush(), vi.fn()).persistent).toBe(false);
  });

  it('names nothing when the wire carried an empty row list', () => {
    expect(toBackendAppNotification(buildPush({ Rows: [] }), vi.fn()).rows).toBeUndefined();
  });

  // The record IS persisted here, so the only thing making this action unpressable is its own
  // missing id -- which is what separates this from the whole-record case above.
  it('drops an id-less verb even on a persisted record', () => {
    const got = toBackendAppNotification(
      buildPush({
        RecordID: 42,
        Actions: [{ ID: '', Label: 'Open Downloads', Intent: 'navigation.open', Args: {}, RowRef: '' }],
      }),
      vi.fn(),
    );

    expect(got.actions).toBeUndefined();
  });

  // Not an empty array: an empty actions list would still render the action area's wrapper, and
  // the payload's own contract says absent means "this toast offers none".
  it('offers no actions at all when every verb belongs to a row', () => {
    const got = toBackendAppNotification(
      buildPush({
        RecordID: 42,
        Actions: [{ ID: 'act-1', Label: 'Watch', Intent: 'navigation.open', Args: {}, RowRef: 'a-1' }],
      }),
      vi.fn(),
    );

    expect(got.actions).toBeUndefined();
  });

  it('reads an unrecognized level as info rather than dropping the toast', () => {
    const got = toBackendAppNotification(buildPush({ Level: 'catastrophe' as Notification['Level'] }), vi.fn());

    expect(got.severity).toBe('info');
  });

  it('keeps an empty body absent rather than rendering an empty description line', () => {
    const got = toBackendAppNotification(buildPush({ Body: '' }), vi.fn());

    expect(got.description).toBeUndefined();
  });
});
