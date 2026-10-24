import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DrawerRequestGroup } from '../../../drawer/drawer.types';
import { ActivityTechnicalView } from '../ActivityTechnicalView';
import type { ActivityTechnicalViewProps } from '../activity-technical-view.types';

/** One refused reconcile group. */
const GROUP: DrawerRequestGroup = { key: 'a|401', route: '/api/sync/reconcile', status: '401', failed: true, count: 1, latestTime: '09:14', latestRequestId: 'r1' };

/** A second, fine diagnostics group. */
const OTHER_GROUP: DrawerRequestGroup = { key: 'b|200', route: '/api/sync/diagnostics', status: '200', failed: false, count: 3, latestTime: '09:20', latestRequestId: 'r2' };

/** Props of a phone line on its Requests tab, overridden per test. */
function props(overrides: Partial<ActivityTechnicalViewProps> = {}): ActivityTechnicalViewProps {
  return {
    gaps: [],
    tabs: ['requests', 'events', 'data'],
    tab: 'requests',
    onSelectTab: vi.fn(),
    lineFailed: false,
    groups: [],
    selectedGroupKey: undefined,
    onPickGroup: vi.fn(),
    requestStatus: undefined,
    panel: undefined,
    onRetryRequest: vi.fn(),
    events: [],
    eventsEmpty: '',
    data: [],
    windowError: undefined,
    ...overrides,
  };
}

describe('ActivityTechnicalView', () => {
  it('says how long full requests are kept instead of an empty list', () => {
    render(<ActivityTechnicalView {...props()} />);

    expect(screen.getByText('Full requests are kept for 2 hours')).toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('goes straight to the one group without a picker', () => {
    render(
      <ActivityTechnicalView
        {...props({
          groups: [GROUP],
          selectedGroupKey: GROUP.key,
          requestStatus: 'ready',
          panel: { summary: ['/api/sync/reconcile', '71 ms'], status: '200', failed: false, notApplied: true, requestBody: '{}', requestCut: false, responseBody: '{}', responseCut: true },
        })}
      />,
    );

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Selected request' })).toBeInTheDocument();
    expect(screen.getByText('not applied')).toBeInTheDocument();
    expect(screen.getAllByText('Cut at 64 KB')).toHaveLength(1);
  });

  it('shows the picker with two groups and a loading region while the picked request loads', () => {
    render(<ActivityTechnicalView {...props({ groups: [GROUP, { ...GROUP, key: 'b|200', status: '200', failed: false }], selectedGroupKey: GROUP.key, requestStatus: 'loading' })} />);

    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('status', { name: 'Loading the request' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Selected request' })).not.toBeInTheDocument();
  });

  it('shows no Requests tab for a bridge line, and the untranslated notes above the tabs', () => {
    render(<ActivityTechnicalView {...props({ tabs: ['events', 'data'], tab: 'events', gaps: ['No presenter for `x.y`. Shown with the generic layout.'] })} />);

    expect(screen.queryByRole('tab', { name: 'Requests' })).not.toBeInTheDocument();
    expect(screen.getByText('No presenter for `x.y`. Shown with the generic layout.')).toBeInTheDocument();
  });

  it('lists the events with their level', () => {
    render(<ActivityTechnicalView {...props({ tab: 'events', events: [{ key: '1', time: '09:14:11', level: 'warn', message: 'Device session rejected', domain: 'auth', detail: 'auth.rejected' }] })} />);

    expect(screen.getByRole('list', { name: 'Events' })).toHaveTextContent('Device session rejected');
    expect(screen.getByText('warn')).toBeInTheDocument();
  });

  it.each([
    ['says why the Events tab is empty when it knows', 'No events were recorded for this run.'],
    ['renders nothing more when it does not', ''],
  ])('%s', (_name, eventsEmpty) => {
    render(<ActivityTechnicalView {...props({ tab: 'events', eventsEmpty })} />);

    expect(screen.queryByText('No events were recorded for this run.') !== null).toBe(eventsEmpty !== '');
  });

  it('shows an event of an unknown level without a detail line', () => {
    render(<ActivityTechnicalView {...props({ tab: 'events', events: [{ key: '1', time: '09:14:11', level: 'trace', message: 'Started', domain: 'app', detail: '' }] })} />);

    expect(screen.getByText('trace')).toBeInTheDocument();
    expect(screen.getByRole('listitem').querySelector('small')).toBeNull();
  });

  it('shows a stored data block as code and an empty one as its notice', () => {
    render(<ActivityTechnicalView {...props({ tab: 'data', data: [{ label: 'Before', raw: '' }, { label: 'After', raw: '{"a":1}' }] })} />);

    expect(screen.getByText('Nothing was stored.')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  it.each([
    ['with a stack', 'at EpisodeStrip (index.js:1:2)', true],
    ['without a stack', '', false],
  ])('shows a window error %s from its stored fields instead of raw blocks', (_name, stack, hasStack) => {
    const windowError = { facts: [{ key: 'page', label: 'Page', value: '/editor', mono: true, warnChip: undefined }], message: 'TypeError: boom', stack };
    render(<ActivityTechnicalView {...props({ tab: 'data', data: [{ label: 'Event', raw: '{}' }], windowError })} />);

    expect(screen.getByRole('region', { name: 'Window error' })).toHaveTextContent('/editor');
    expect(screen.getByText('TypeError: boom')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Stack trace' }) !== null).toBe(hasStack);
    expect(screen.queryByText('Event')).not.toBeInTheDocument();
    expect(screen.queryByText('Cut at 8 KB')).not.toBeInTheDocument();
  });

  it('reports the tab the owner picks', () => {
    const onSelectTab = vi.fn();
    render(<ActivityTechnicalView {...props({ onSelectTab })} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Data' }));

    expect(onSelectTab).toHaveBeenCalledWith('data');
  });

  it('reports the group the owner picks', () => {
    const onPickGroup = vi.fn();
    render(<ActivityTechnicalView {...props({ groups: [GROUP, OTHER_GROUP], selectedGroupKey: GROUP.key, onPickGroup })} />);

    fireEvent.click(screen.getByRole('option', { name: /diagnostics/ }));

    expect(onPickGroup).toHaveBeenCalledWith(OTHER_GROUP.key);
  });

  it.each<[string, Partial<ActivityTechnicalViewProps>, string, readonly string[]]>([
    ['a failed line without pinned requests says none was pinned', { lineFailed: true }, 'No request was pinned to this event.', ['This hour went fine']],
    ['a request that aged out says so', { groups: [GROUP], requestStatus: 'gone' }, 'Its full capture aged out of the Recorder.', ['The request could not be read']],
    ['a failed request read shows its alert', { groups: [GROUP], requestStatus: 'failed' }, 'The request could not be read', ['Loading the request']],
  ])('%s', (_name, overrides, shown, hidden) => {
    render(<ActivityTechnicalView {...props(overrides)} />);

    expect(screen.getByText(shown)).toBeInTheDocument();
    for (const text of hidden) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('region', { name: 'Selected request' })).not.toBeInTheDocument();
  });

  it('reads the picked request again from Try again', () => {
    const onRetryRequest = vi.fn();
    render(<ActivityTechnicalView {...props({ groups: [GROUP], requestStatus: 'failed', onRetryRequest })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(onRetryRequest).toHaveBeenCalledOnce();
  });

  it('shows a refused request without bodies: no not-applied chip, the request cut chip, and both notices', () => {
    const panel = { summary: ['/api/sync/reconcile'], status: '401', failed: true, notApplied: false, requestBody: '', requestCut: true, responseBody: '', responseCut: false };
    render(<ActivityTechnicalView {...props({ groups: [GROUP], requestStatus: 'ready', panel })} />);

    const region = screen.getByRole('region', { name: 'Selected request' });
    expect(region).toHaveTextContent('401');
    expect(screen.queryByText('not applied')).not.toBeInTheDocument();
    expect(screen.getAllByText('Cut at 64 KB')).toHaveLength(1);
    expect(screen.getByText('No request body was captured.')).toBeInTheDocument();
    expect(screen.getByText('No response body was captured.')).toBeInTheDocument();
  });
});
