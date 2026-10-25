import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DrawerRequestGroup, DrawerRequestPanel } from '../../../drawer/drawer.types';
import { ActivityTechnicalView } from '../ActivityTechnicalView';
import { ACTIVITY_TECHNICAL_JSON_TOKEN_CLASS } from '../activity-technical-view.constants';
import type { ActivityTechnicalViewProps } from '../activity-technical-view.types';

/** One refused reconcile group. */
const GROUP: DrawerRequestGroup = { key: 'a|401', route: '/api/sync/reconcile', status: '401', failed: true, count: 1, latestTime: '09:14', latestRequestId: 'r1' };

/** An unanswered request with no bodies and no captured headers. */
const UNANSWERED_PANEL: DrawerRequestPanel = { summary: ['/api/sync/reconcile'], status: 'no answer', failed: false, notApplied: false, requestBody: '', requestCut: false, responseBody: '', responseCut: false, requestHeaders: [], responseHeaders: [] };

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
    occurrences: [],
    selectedOccurrenceId: undefined,
    occurrenceStatus: 'ready',
    onPickOccurrence: vi.fn(),
    onRetryOccurrence: vi.fn(),
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
          panel: { summary: ['/api/sync/reconcile', '71 ms'], status: '200', failed: false, notApplied: true, requestBody: '{}', requestCut: false, responseBody: '{}', responseCut: true, requestHeaders: [], responseHeaders: [] },
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

  it('says why the Events tab is empty when it knows', () => {
    render(<ActivityTechnicalView {...props({ tab: 'events', eventsEmpty: 'No events were recorded for this run.' })} />);

    expect(screen.getByText('No events were recorded for this run.')).toBeInTheDocument();
  });

  it('renders no note paragraph when it does not know', () => {
    render(<ActivityTechnicalView {...props({ tab: 'events', eventsEmpty: '' })} />);

    expect(screen.getByRole('tabpanel').querySelector('p')).toBeNull();
  });

  it('shows an event of an unknown level without a detail line', () => {
    render(<ActivityTechnicalView {...props({ tab: 'events', events: [{ key: '1', time: '09:14:11', level: 'trace', message: 'Started', domain: 'app', detail: '' }] })} />);

    expect(screen.getByText('trace')).toBeInTheDocument();
    expect(screen.getByRole('listitem').querySelector('small')).toBeNull();
  });

  it('shows a stored data block as code and an empty one as its notice', () => {
    render(<ActivityTechnicalView {...props({ tab: 'data', data: [{ label: 'Before', raw: '' }, { label: 'After', raw: '{"a":1}' }] })} />);

    expect(screen.getByText('Nothing was stored.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Before', level: 3 })).toBeInTheDocument();
    const after = screen.getByRole('region', { name: 'After' });
    expect(after.querySelector('pre')).toHaveTextContent('{ "a": 1 }');
    expect(screen.getByText('"a"')).toHaveClass(ACTIVITY_TECHNICAL_JSON_TOKEN_CLASS.key);
    expect(screen.getByRole('tabpanel').querySelectorAll('button')).toHaveLength(0);
  });

  it('colours the picked request bodies with the same tokenizer and puts the status on Response', () => {
    const panel = { summary: ['/api/sync/reconcile'], status: '200', failed: false, notApplied: false, requestBody: '{"device_id":"pixel"}', requestCut: false, responseBody: '{"status":"ok"}', responseCut: false, requestHeaders: [{ name: 'Authorization', value: 'Bearer ••••••••' }, { name: 'X-Client-Request-Id', value: 'c6720086:3' }], responseHeaders: [{ name: 'Content-Type', value: 'application/json' }] };
    render(<ActivityTechnicalView {...props({ groups: [GROUP], requestStatus: 'ready', panel })} />);

    expect(screen.getByText('"pixel"')).toHaveClass(ACTIVITY_TECHNICAL_JSON_TOKEN_CLASS.string);
    expect(screen.getByRole('heading', { name: /^Response/, level: 4 })).toHaveTextContent('Response200');
    const requestHeaders = screen.getByLabelText('Request headers');
    expect(within(requestHeaders).getAllByRole('term').map((term) => term.textContent)).toEqual(['Authorization', 'X-Client-Request-Id']);
    expect(within(requestHeaders).getAllByRole('definition').map((value) => value.textContent)).toEqual(['Bearer ••••••••', 'c6720086:3']);
    expect(screen.getByLabelText('Response headers')).toHaveTextContent('Content-Typeapplication/json');
  });

  it('shows no header list for a side without captured headers', () => {
    render(<ActivityTechnicalView {...props({ groups: [GROUP], requestStatus: 'ready', panel: { ...UNANSWERED_PANEL } })} />);

    expect(screen.queryByLabelText('Request headers')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Response headers')).not.toBeInTheDocument();
  });

  it.each([
    ['with a stack', 'at EpisodeStrip (index.js:1:2)', true],
    ['without a stack', '', false],
  ])('shows a window error %s from its stored fields instead of raw blocks', (_name, stack, hasStack) => {
    const windowError = { facts: [{ key: 'page', label: 'Page', value: '/editor', mono: true, warnChip: undefined, note: undefined }], message: 'TypeError: boom', stack, stackCut: false };
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
    const panel = { summary: ['/api/sync/reconcile'], status: '401', failed: true, notApplied: false, requestBody: '', requestCut: true, responseBody: '', responseCut: false, requestHeaders: [], responseHeaders: [] };
    render(<ActivityTechnicalView {...props({ groups: [GROUP], requestStatus: 'ready', panel })} />);

    const region = screen.getByRole('region', { name: 'Selected request' });
    expect(region).toHaveTextContent('401');
    expect(screen.queryByText('not applied')).not.toBeInTheDocument();
    expect(screen.getAllByText('Cut at 64 KB')).toHaveLength(1);
    expect(screen.getByText('No request body was captured.')).toBeInTheDocument();
    expect(screen.getByText('No response body was captured.')).toBeInTheDocument();
  });

  it('picks an occurrence of a repeated window error from its times', () => {
    const onPickOccurrence = vi.fn();
    const windowError = { facts: [], message: 'TypeError: boom', stack: '', stackCut: false };
    const occurrences = [
      { id: 93, time: '11:23' },
      { id: 92, time: '11:21' },
    ];
    render(<ActivityTechnicalView {...props({ tab: 'data', windowError, occurrences, selectedOccurrenceId: 93, onPickOccurrence })} />);

    expect(screen.getByRole('radiogroup', { name: 'Occurrence' })).toHaveTextContent('11:2311:21');
    expect(screen.getByRole('radio', { name: '11:23' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: '11:21' }));
    expect(onPickOccurrence).toHaveBeenCalledWith(92);
  });

  it('shows no occurrence picker for a window error that did not repeat', () => {
    render(<ActivityTechnicalView {...props({ tab: 'data', windowError: { facts: [], message: 'm', stack: '', stackCut: false } })} />);

    expect(screen.queryByRole('radiogroup', { name: 'Occurrence' })).not.toBeInTheDocument();
  });

  it.each([
    ['loading', 'Loading the occurrence', 'This occurrence could not be read'],
    ['failed', 'This occurrence could not be read', 'Loading the occurrence'],
  ] as const)('shows only the %s state of a picked occurrence', (occurrenceStatus, present, absent) => {
    const occurrences = [
      { id: 93, time: '11:23' },
      { id: 92, time: '11:21' },
    ];
    render(<ActivityTechnicalView {...props({ tab: 'data', occurrences, selectedOccurrenceId: 92, occurrenceStatus })} />);

    expect(screen.getByText(present)).toBeInTheDocument();
    expect(screen.queryByText(absent)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Message' })).not.toBeInTheDocument();
  });

  it('reads a failed occurrence again from Try again', () => {
    const onRetryOccurrence = vi.fn();
    render(<ActivityTechnicalView {...props({ tab: 'data', occurrences: [{ id: 93, time: '11:23' }], selectedOccurrenceId: 93, occurrenceStatus: 'failed', onRetryOccurrence })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetryOccurrence).toHaveBeenCalledOnce();
  });

  it.each([
    ['a stack at the report limit', true, 1],
    ['a shorter stack', false, 0],
  ])('marks %s as cut', (_name, stackCut, count) => {
    render(<ActivityTechnicalView {...props({ tab: 'data', windowError: { facts: [], message: 'm', stack: 'at A', stackCut } })} />);

    expect(screen.queryAllByText('Cut at 8 KB')).toHaveLength(count);
  });
});
