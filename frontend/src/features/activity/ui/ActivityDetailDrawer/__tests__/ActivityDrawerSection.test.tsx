import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DrawerSection } from '../../../drawer/drawer.types';
import { ActivityDrawerSection } from '../ActivityDrawerSection';
import { ACTIVITY_DRAWER_FAILED_TEXT_CLASS } from '../activity-detail-drawer.constants';
import { ACTIVITY_TONE_DOT_CLASS } from '../../ActivityRunStory/activity-run-story.constants';

vi.mock('../../ActivityRunStory/ActivityRunStory', () => ({
  /** Stands in for the run story, which owns its own read. */
  ActivityRunStory: ({ correlationId }: { readonly correlationId: string }) => <p>story {correlationId}</p>,
}));

describe('ActivityDrawerSection', () => {
  it.each<[string, DrawerSection, string]>([
    ['before → after', { kind: 'before-after', key: 'k', title: 'Episode', before: '1', after: '2' }, 'Episode'],
    ['facts', { kind: 'facts', key: 'k', title: 'When', rows: [{ key: 'r', label: 'Saved', value: '09:00', mono: true, warnChip: '2 h late', note: undefined }] }, 'When'],
    ['a list', { kind: 'list', key: 'k', title: 'Refused check-ins', items: [{ key: 'i', time: '09:14', text: '/api · 401 ×1', failed: true }] }, 'Refused check-ins'],
    ['code', { kind: 'code', key: 'k', title: 'Message', text: 'TypeError' }, 'Message'],
    ['reports', { kind: 'reports', key: 'k', title: 'Reports', reports: [] }, 'Reports'],
    ['steps', { kind: 'steps', key: 'k', title: 'Stages', steps: [] }, 'Stages'],
  ])('names its %s section by its title', (_name, section, title) => {
    render(<ActivityDrawerSection section={section} />);

    expect(screen.getByRole('region', { name: title })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
  });

  it.each<[string, DrawerSection, readonly string[], readonly string[]]>([
    ['a catalogued cause shows its sentence and code, not the recorded label', { kind: 'cause', key: 'k', title: 'Why', cause: { sentence: 'Sentence.', recordedMessage: 'raw', code: 'conflict' } }, ['Sentence.', 'conflict'], ['Recorded message', 'raw']],
    ['a cause with its own label shows it instead of the recorded one', { kind: 'cause', key: 'k', title: '', cause: { sentence: undefined, recordedMessage: 'low_memory', code: '', recordedLabel: 'Recorded reason' } }, ['Recorded reason', 'low_memory'], ['Recorded message']],
    ['a cause without code shows no chip', { kind: 'cause', key: 'k', title: '', cause: { sentence: undefined, recordedMessage: 'raw', code: '' } }, ['Recorded message', 'raw'], ['conflict']],
    ['figures', { kind: 'stats', key: 'k', items: [{ key: 's', value: '39', label: 'check-ins', failed: false }, { key: 'f', value: '2', label: 'refused', failed: true }] }, ['39', 'check-ins', '2', 'refused'], []],
    ['a fact without chip', { kind: 'facts', key: 'k', title: '', rows: [{ key: 'r', label: 'Hour', value: '09:00 – 10:00', mono: false, warnChip: undefined, note: undefined }] }, ['Hour', '09:00 – 10:00'], ['late']],
    ['a run story', { kind: 'run-story', key: 'k', correlationId: 'run-1' }, ['story run-1'], []],
    ['a note', { kind: 'note', key: 'k', text: 'These details are kept until Jan 20.' }, ['These details are kept until Jan 20.'], []],
    ['a sentence', { kind: 'text', key: 'k', text: 'Bridge was on and the sync still failed.' }, ['Bridge was on and the sync still failed.'], []],
  ])('%s', (_name, section, shown, hidden) => {
    render(<ActivityDrawerSection section={section} />);

    for (const text of shown) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
    for (const text of hidden) {
      expect(screen.queryByText(text, { exact: false })).not.toBeInTheDocument();
    }
  });

  it('renders one batch of a long report list, then grows near its bottom', () => {
    const reports = Array.from({ length: 120 }, (_unused, index) => ({ kind: 'facts' as const, key: String(index), title: '', rows: [{ key: 'failed', label: 'Failed at', value: `09:${index}`, mono: false, warnChip: undefined, note: undefined }] }));
    render(<ActivityDrawerSection section={{ kind: 'reports', key: 'k', title: 'Reports', reports }} />);
    const list = screen.getByRole('list', { name: 'Reports' });

    expect(within(list).getAllByRole('listitem')).toHaveLength(20);
    fireEvent.scroll(list.parentElement as Element);
    expect(within(list).getAllByRole('listitem')).toHaveLength(40);
  });

  it('marks failing figures and rows, and the late chip, with their tone', () => {
    const { rerender } = render(<ActivityDrawerSection section={{ kind: 'stats', key: 'k', items: [{ key: 'f', value: '2', label: 'refused', failed: true }, { key: 'o', value: '5', label: 'ok', failed: false }] }} />);
    expect(screen.getByText('2')).toHaveClass('text-danger');
    expect(screen.getByText('5')).not.toHaveClass('text-danger');

    rerender(<ActivityDrawerSection section={{ kind: 'list', key: 'k', title: 'T', items: [{ key: 'a', time: '1', text: 'bad', failed: true }, { key: 'b', time: '2', text: 'fine', failed: false }] }} />);
    expect(screen.getByText('bad')).toHaveClass(ACTIVITY_DRAWER_FAILED_TEXT_CLASS);
    expect(screen.getByText('fine')).not.toHaveClass(ACTIVITY_DRAWER_FAILED_TEXT_CLASS);

    rerender(<ActivityDrawerSection section={{ kind: 'facts', key: 'k', title: '', rows: [{ key: 'r', label: 'Reached', value: '09:00', mono: false, warnChip: '6 h 31 min late', note: undefined }] }} />);
    expect(screen.getByText('6 h 31 min late')).toBeInTheDocument();
  });

  it('draws stages in order with a dot per tone, the stopped one in red and the unreached one muted, each with its note', () => {
    const steps = [
      { key: 'a', label: 'Claiming changes', tone: 'success' as const, note: undefined },
      { key: 'b', label: 'Sending', tone: 'danger' as const, note: 'Stopped here' },
      { key: 'c', label: 'Applying', tone: 'default' as const, note: 'Not reached' },
    ];
    render(<ActivityDrawerSection section={{ kind: 'steps', key: 'k', title: 'Stages', steps }} />);
    const items = within(screen.getByRole('list', { name: 'Stages' })).getAllByRole('listitem');

    expect(items.map((item) => item.textContent)).toEqual(['Claiming changes', 'SendingStopped here', 'ApplyingNot reached']);
    const dots = items.map((item) => item.querySelector('[data-step-tone]'));
    expect(dots.map((dot) => dot?.getAttribute('data-step-tone'))).toEqual(['success', 'danger', 'default']);
    dots.forEach((dot, index) => expect(dot).toHaveClass(ACTIVITY_TONE_DOT_CLASS[steps[index].tone]));
    expect(items.map((item) => item.querySelectorAll('small').length)).toEqual([0, 1, 1]);
    expect(screen.getByText('Sending')).toHaveClass(ACTIVITY_DRAWER_FAILED_TEXT_CLASS);
    expect(screen.getByText('Applying')).toHaveClass('text-muted');
    expect(screen.getByText('Claiming changes')).not.toHaveClass(ACTIVITY_DRAWER_FAILED_TEXT_CLASS, 'text-muted');
  });

  it('shows a fact note after its value, and no note when it has none', () => {
    const { rerender } = render(<ActivityDrawerSection section={{ kind: 'facts', key: 'k', title: '', rows: [{ key: 'r', label: 'Page', value: 'Editor', mono: false, warnChip: undefined, note: '/editor' }] }} />);

    expect(screen.getByText('Editor').closest('dd')).toHaveTextContent('Editor/editor');
    rerender(<ActivityDrawerSection section={{ kind: 'facts', key: 'k', title: '', rows: [{ key: 'r', label: 'Page', value: 'Editor', mono: false, warnChip: undefined, note: undefined }] }} />);
    expect(screen.getByText('Editor').closest('dd')).toHaveTextContent(/^Editor$/);
  });
});
