import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeEventQuery } from '../../../../../shared/contracts/runtime-event.types';
import { resetNetworkStore } from '../../../../../shared/store/network-store/network-store.helpers';
import { NetworkPanel } from '../NetworkPanel';
import { createFakeSource, eventPage, eventSummary, record } from './network-panel.test-support';

describe('NetworkPanel', () => {
  afterEach(() => {
    cleanup();
    resetNetworkStore();
  });

  it('renders the empty state when a healthy read returned no persisted events', async () => {
    render(<NetworkPanel source={createFakeSource()} />);

    expect(await screen.findByText('No runtime events captured yet.')).toBeInTheDocument();
  });

  it('renders a domain event row with its message, level, and domain (not a fabricated HTTP status)', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(
        eventPage([
          record(1, { domain: 'anime', level: 'info', message: 'publishing anime.changed for tracer-bullet-anime', eventType: 'anime.publish' }),
        ]),
      ),
    });

    render(<NetworkPanel source={source} />);

    expect(await screen.findByText('publishing anime.changed for tracer-bullet-anime')).toBeInTheDocument();
  });

  it('renders an http.request event as METHOD + path with its real duration while the runtime-event table omits the old Status column', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(
        eventPage([record(1, { eventType: 'http.request', durationMs: 82, metadata: { method: 'GET', path: '/api/status', status: 200 } })]),
      ),
    });

    render(<NetworkPanel source={source} />);

    expect(await screen.findByText('GET /api/status')).toBeInTheDocument();
    expect(screen.getByText('82ms')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('shows the detail empty prompt before any event is selected', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { message: 'syncing catalogue' })])),
    });

    render(<NetworkPanel source={source} />);

    await screen.findByText('syncing catalogue');

    expect(screen.getByText('Select an event to inspect its details.')).toBeInTheDocument();
  });

  it('renders the selected event detail (General tab) after a row is clicked', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { message: 'syncing catalogue' })])),
    });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('syncing catalogue');
    row.closest('tr')?.click();

    expect(await screen.findByRole('tab', { name: 'General' })).toBeInTheDocument();
    expect(screen.queryByText('Select an event to inspect its details.')).not.toBeInTheDocument();
  });

  it('shows the bottom status bar with entry, error, and shown counts', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(
        eventPage([record(2, { level: 'error', message: 'boom' }), record(1, { level: 'info', message: 'ok' })]),
      ),
    });

    render(<NetworkPanel source={source} />);

    await screen.findByText('boom');

    expect(screen.getByText('2 entries')).toBeInTheDocument();
    expect(screen.getByText('1 errors')).toBeInTheDocument();
    expect(screen.getByText('2 shown')).toBeInTheDocument();
  });

  it('the inspector close control deselects the row and returns to the empty prompt', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { message: 'syncing catalogue' })])),
    });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('syncing catalogue');
    row.closest('tr')?.click();

    const closeButton = await screen.findByRole('button', { name: 'Close detail inspector' });
    closeButton.click();

    expect(await screen.findByText('Select an event to inspect its details.')).toBeInTheDocument();
  });

  it('offers a domain the deleted hardcoded list never contained, derived from the store aggregate', async () => {
    const source = createFakeSource({
      summarizeEvents: vi.fn().mockResolvedValue(
        eventSummary([
          { key: 'websocket', count: 1_693 },
          { key: 'download', count: 463 },
        ]),
      ),
    });

    render(<NetworkPanel source={source} />);

    const domainGroup = within(await screen.findByRole('radiogroup', { name: 'Filter by domain' }));

    expect(await domainGroup.findByRole('radio', { name: 'Download' })).toBeInTheDocument();
    expect(domainGroup.getByRole('radio', { name: 'Websocket' })).toBeInTheDocument();
    expect(domainGroup.getByRole('radio', { name: 'All' })).toBeInTheDocument();
  });

  it('offers only the all-domains sentinel when the store holds no events at all', async () => {
    render(<NetworkPanel source={createFakeSource()} />);

    await screen.findByText('No runtime events captured yet.');

    const domainGroup = within(screen.getByRole('radiogroup', { name: 'Filter by domain' }));

    expect(domainGroup.getAllByRole('radio')).toHaveLength(1);
    expect(domainGroup.getByRole('radio', { name: 'All' })).toBeInTheDocument();
  });

  it('selecting a derived domain pill re-queries the whole store rather than narrowing the loaded page', async () => {
    const searchEvents = vi
      .fn()
      .mockImplementation((query: RuntimeEventQuery) =>
        Promise.resolve(
          eventPage([
            record(1, {
              domain: query.filters?.domain ?? 'api',
              message: query.filters?.domain === 'download' ? 'download row from the store' : 'unfiltered row',
            }),
          ]),
        ),
      );
    const source = createFakeSource({
      searchEvents,
      summarizeEvents: vi.fn().mockResolvedValue(eventSummary([{ key: 'download', count: 463 }])),
    });

    render(<NetworkPanel source={source} />);

    const domainGroup = within(await screen.findByRole('radiogroup', { name: 'Filter by domain' }));
    (await domainGroup.findByRole('radio', { name: 'Download' })).click();

    expect(await screen.findByText('download row from the store')).toBeInTheDocument();
    expect(searchEvents).toHaveBeenLastCalledWith({ limit: 20, filters: { text: undefined, level: undefined, domain: 'download' } });
  });

  it('states that debug-level events are not persisted instead of implying none occurred', async () => {
    render(<NetworkPanel source={createFakeSource()} />);

    expect(await screen.findByText(/Debug-level events are not persisted/)).toBeInTheDocument();
  });

  it('degrades visibly when this database has no persisted runtime-event store', async () => {
    const source = createFakeSource({ searchEvents: vi.fn().mockResolvedValue(eventPage([], { available: false })) });

    render(<NetworkPanel source={source} />);

    // Twice on purpose: the banner names the reason, and the table refuses to
    // fall back to the ordinary empty copy that would read as "nothing happened".
    expect(await screen.findAllByText(/no persisted runtime-event store/)).toHaveLength(2);
    expect(screen.queryByText('No runtime events captured yet.')).not.toBeInTheDocument();
  });

  it('degrades visibly and names the read failure when the persisted store could not be read', async () => {
    const source = createFakeSource({ searchEvents: vi.fn().mockResolvedValue(eventPage([], { degraded: true })) });

    render(<NetworkPanel source={source} />);

    expect(await screen.findAllByText(/could not be read/)).toHaveLength(2);
    expect(screen.queryByText('No runtime events captured yet.')).not.toBeInTheDocument();
  });

  it('the Trace tab states the absence of a correlation id rather than rendering an empty sibling list', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { message: 'uncorrelated event' })])),
    });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('uncorrelated event');
    row.closest('tr')?.click();

    (await screen.findByRole('tab', { name: 'Trace' })).click();

    expect(await screen.findByText(/carries no correlation id/)).toBeInTheDocument();
  });

  it('the Trace tab lists the persisted siblings sharing the selected correlation id, time-ordered', async () => {
    const loadedPage = eventPage([record(2, { occurredAtMs: 2_000, correlationId: 'trace-1', message: 'selected event' })]);
    const siblingPage = eventPage([
      record(9, { occurredAtMs: 9_000, correlationId: 'trace-1', message: 'later sibling' }),
      record(2, { occurredAtMs: 2_000, correlationId: 'trace-1', message: 'selected event' }),
    ]);
    const source = createFakeSource({
      searchEvents: vi
        .fn()
        .mockImplementation((query: RuntimeEventQuery) =>
          Promise.resolve(query.filters?.correlationId === 'trace-1' ? siblingPage : loadedPage),
        ),
    });

    render(<NetworkPanel source={source} />);

    const row = await screen.findByText('selected event');
    row.closest('tr')?.click();

    (await screen.findByRole('tab', { name: 'Trace' })).click();

    expect(await screen.findByText('later sibling')).toBeInTheDocument();
  });

  it('uses event terminology and removes the meaningless Status column from the runtime-event table', async () => {
    const source = createFakeSource({
      searchEvents: vi.fn().mockResolvedValue(eventPage([record(1, { domain: 'sync', message: 'syncing catalogue' })])),
    });

    render(<NetworkPanel source={source} />);

    await screen.findByText('syncing catalogue');

    expect(screen.getByRole('searchbox', { name: 'Filter runtime events' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Status' })).not.toBeInTheDocument();
  });
});
