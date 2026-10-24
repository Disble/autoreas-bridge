import { describe, expect, it } from 'vitest';
import { drawerPageFact, isDrawerStackCut, pickDrawerOccurrenceId, toDrawerOccurrenceEventId, toDrawerOccurrences, toDrawerOccurrenceStatus, toDrawerPageName, toDrawerWindowErrorFromMetadata } from '../drawer-window-error.helpers';
import { incident } from './drawer.fixtures';

describe('toDrawerPageName', () => {
  it.each([
    ['a plain route', '/editor', 'Editor'],
    ['a hash route', '#/activity', 'Activity'],
    ['a nested route with a query', '#/catalog/12?tab=a', 'Catalog'],
    ['an unknown route', '/nowhere', undefined],
    ['an empty route', '', undefined],
  ])('%s', (_name, route, expected) => {
    expect(toDrawerPageName(route)).toBe(expected);
  });
});

describe('drawerPageFact', () => {
  it('reads as the page name with the stored route as a muted note', () => {
    expect(drawerPageFact('page', '#/activity')).toMatchObject({ label: 'Page', value: 'Activity', note: '#/activity', mono: false });
  });

  it('shows an unknown route as stored', () => {
    expect(drawerPageFact('page', '/nowhere')).toMatchObject({ value: '/nowhere', note: undefined, mono: true });
  });
});

describe('isDrawerStackCut', () => {
  it.each([
    ['a stack at the 8 KiB limit minus a split rune', 'a'.repeat(8189), true],
    ['a shorter stack', 'a'.repeat(8188), false],
    ['multi-byte text counted in UTF-8 bytes', 'é'.repeat(4095), true],
  ])('%s', (_name, stack, expected) => {
    expect(isDrawerStackCut(stack)).toBe(expected);
  });
});

describe('toDrawerOccurrences', () => {
  it('lists this occurrence then the earlier ones', () => {
    const detail = incident({ earlier: [{ id: 3, occurredAtMs: Date.UTC(2026, 9, 22, 11, 21) }] });

    expect(toDrawerOccurrences(detail).map((occurrence) => occurrence.id)).toEqual([detail.incident.id, 3]);
  });

  it.each([
    ['no incident', undefined],
    ['no earlier occurrence', incident({ earlier: [] })],
  ])('is empty with %s', (_name, detail) => {
    expect(toDrawerOccurrences(detail)).toEqual([]);
  });
});

describe('toDrawerWindowErrorFromMetadata', () => {
  it('words the stored fields: kind, page name, source as code and the time', () => {
    const detail = toDrawerWindowErrorFromMetadata({ kind: 'render', route: '/editor', source: 'a.js:1:2', occurredAtMs: '1', message: 'boom', stack: 'at A' }, 'fallback');

    expect(detail.facts.map((fact) => [fact.label, fact.value, fact.note, fact.mono])).toEqual([
      ['Kind', 'render', undefined, false],
      ['Page', 'Editor', '/editor', false],
      ['Source', 'a.js:1:2', undefined, true],
      ['At', expect.any(String), undefined, false],
    ]);
    expect(detail).toMatchObject({ message: 'boom', stack: 'at A', stackCut: false });
  });

  it('falls back to the event message and marks a stack at the limit as cut', () => {
    const detail = toDrawerWindowErrorFromMetadata({ stack: 'a'.repeat(8192), occurredAtMs: 'x' }, 'fallback');

    expect(detail).toMatchObject({ message: 'fallback', stackCut: true, facts: [] });
  });
});

describe('pickDrawerOccurrenceId', () => {
  /** Two occurrences, this one first. */
  const OCCURRENCES = [
    { id: 7, time: '11:23' },
    { id: 3, time: '11:21' },
  ];

  it.each([
    ['nothing picked shows this occurrence', undefined, 7],
    ['a pick in this line shows it', { lineKey: 'event:1', id: 3 }, 3],
    ['a pick in another line is ignored', { lineKey: 'event:2', id: 3 }, 7],
    ['a pick no longer listed is ignored', { lineKey: 'event:1', id: 99 }, 7],
  ])('%s', (_name, picked, expected) => {
    expect(pickDrawerOccurrenceId(OCCURRENCES, picked, 'event:1')).toBe(expected);
  });

  it('is undefined without occurrences', () => {
    expect(pickDrawerOccurrenceId([], undefined, 'event:1')).toBeUndefined();
  });
});

describe('toDrawerOccurrenceEventId', () => {
  it.each([
    ['an event-fired occurrence reads its event', 'event', '41', 41],
    ['a request-fired occurrence reads nothing', 'request', '41', undefined],
    ['a non-numeric id reads nothing', 'event', 'x1', undefined],
  ])('%s', (_name, sourceKind, sourceId, expected) => {
    const detail = incident();

    expect(toDrawerOccurrenceEventId({ ...detail, incident: { ...detail.incident, sourceKind, sourceId } })).toBe(expected);
  });

  it('reads nothing before the detail is read', () => {
    expect(toDrawerOccurrenceEventId(undefined)).toBeUndefined();
  });

  it.each([
    ['the window event stored at the occurrence time', 0, 40467],
    ['nothing when no window event matches its time', 1, undefined],
  ])('without a stored source id reads %s', (_name, offsetMs, expected) => {
    const detail = incident();
    const event = { id: 40467, atMs: detail.incident.occurredAtMs + offsetMs, domain: 'frontend', level: 'error', eventType: 'frontend.error', message: 'boom', correlationId: '' };
    const other = { ...event, id: 40466, atMs: detail.incident.occurredAtMs - 5000 };

    expect(toDrawerOccurrenceEventId({ ...detail, incident: { ...detail.incident, sourceKind: 'event', sourceId: '' }, events: [other, event] })).toBe(expected);
  });
});

describe('toDrawerOccurrenceStatus', () => {
  it.each([
    ['keeps the reads state while the event is known', 'loading', false, 'loading'],
    ['fails when the occurrence has no firing event', 'ready', true, 'failed'],
  ] as const)('%s', (_name, status, eventMissing, expected) => {
    expect(toDrawerOccurrenceStatus(status, eventMissing)).toBe(expected);
  });
});
