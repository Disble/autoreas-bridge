import checkIcon from '@iconify-icons/solar/check-circle-linear';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-linear';
import offIcon from '@iconify-icons/solar/forbidden-circle-linear';
import type { IconifyIcon } from '@iconify/react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadRuntimeSource } from '../../../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { ScheduleConfig } from '../../../../../../shared/contracts/download.types';
import { resetDownloadRuntimeStore } from '../../../../../../shared/store/download-runtime-store/download-runtime-store.helpers';
import { AutoDownloadChip } from '../AutoDownloadChip';

// Renders each icon as an svg carrying its path data, so a case can tell which icon a state shows.
vi.mock('@iconify/react', () => ({
  /** Stands in for the Iconify icon, exposing its body. */
  Icon: ({ icon }: { readonly icon: IconifyIcon }) => <svg data-icon-body={icon.body} data-testid="chip-icon" />,
}));

/** Which glyph the chip leads with: one of the three icons, or the progress spinner. */
type ChipGlyph = 'download' | 'check' | 'off' | 'spinner';

/** The icon body each glyph renders, as the mocked Icon exposes it. */
const GLYPH_BODY: Readonly<Record<Exclude<ChipGlyph, 'spinner'>, string>> = {
  download: downloadIcon.body,
  check: checkIcon.body,
  off: offIcon.body,
};

/** Reads every glyph a chip shows, in order: the spinner, or the icon whose body each renders. */
function getGlyphs(chip: HTMLElement): (ChipGlyph | undefined)[] {
  const spinners: ChipGlyph[] = chip.querySelector('[data-slot="spinner"]') === null ? [] : ['spinner'];
  const icons = [...chip.querySelectorAll('[data-testid="chip-icon"]')].map((icon) =>
    (Object.keys(GLYPH_BODY) as Exclude<ChipGlyph, 'spinner'>[]).find((glyph) => GLYPH_BODY[glyph] === icon.getAttribute('data-icon-body')),
  );
  return [...spinners, ...icons];
}

/** The chip element behind the trigger named by the tooltip sentence. */
function getChip(tooltip: string): HTMLElement {
  const chip = screen.getByLabelText(tooltip).querySelector<HTMLElement>('[data-slot="chip"]');
  if (chip === null) {
    throw new Error(`no chip behind ${tooltip}`);
  }
  return chip;
}

/** An enabled 22:00 schedule on every day, last run two days ago. */
const SCHEDULE: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '22:00',
  enabled: true,
  lastRunAtMs: new Date(2026, 9, 22, 22).getTime(),
  lastRunStatus: 'ok',
  nextRunAtMs: 0,
  running: false,
  enabledWeekdays: 127,
};

/** A Downloads port whose schedule read resolves to the given config; nothing else is used. */
function createSource(config: ScheduleConfig): DownloadRuntimeSource {
  return {
    getScheduleConfig: vi.fn().mockResolvedValue(config),
    listDownloadRuns: vi.fn().mockResolvedValue([]),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    subscribeMissedScheduleSettled: vi.fn().mockReturnValue(() => undefined),
  } as unknown as DownloadRuntimeSource;
}

/** Renders the chip and lets the schedule read settle. */
async function renderChip(config: ScheduleConfig) {
  render(<AutoDownloadChip source={createSource(config)} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('AutoDownloadChip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    // Saturday 24 October 2026, 21:59.
    vi.setSystemTime(new Date(2026, 9, 24, 21, 59));
  });

  afterEach(() => {
    vi.useRealTimers();
    resetDownloadRuntimeStore();
  });

  it('renders nothing until the schedule has loaded', () => {
    const { container } = render(<AutoDownloadChip source={createSource(SCHEDULE)} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the schedule could not be read, rather than claiming it is off', async () => {
    const source = { ...createSource(SCHEDULE), getScheduleConfig: vi.fn().mockRejectedValue(new Error('store unavailable')) };
    const { container } = render(<AutoDownloadChip source={source} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('leaves room around its glyph and label: a medium chip', async () => {
    await renderChip(SCHEDULE);

    expect(getChip('Scheduled download at 22:00')).toHaveClass('chip--md');
  });

  it('shows the time with its full sentence as the accessible name once loaded', async () => {
    await renderChip(SCHEDULE);

    expect(getChip('Scheduled download at 22:00')).toHaveTextContent('22:00');
  });

  it('moves on by itself once the scheduled time passes', async () => {
    await renderChip(SCHEDULE);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    expect(screen.getByLabelText('The 22:00 download did not complete')).toHaveTextContent('22:00');
    expect(screen.queryByLabelText('Scheduled download at 22:00')).not.toBeInTheDocument();
  });

  it('stops re-reading the clock once it unmounts', async () => {
    render(<AutoDownloadChip source={createSource(SCHEDULE)} />).unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ['scheduled', {},'Scheduled download at 22:00', '22:00', 'download', 'chip--accent'],
    ['downloading', { running: true }, 'Download in progress', 'Downloading', 'spinner', 'chip--accent'],
    ['no download today', { enabledWeekdays: 127 & ~(1 << 6) }, 'No scheduled download today', 'No download', 'off', 'chip--default'],
    ['off', { enabled: false }, 'Scheduled downloads are off', 'Off', 'off', 'chip--default'],
  ])('shows the %s state with its glyph and color', async (_name, overrides, tooltip, label, glyph, colorClass) => {
    await renderChip({ ...SCHEDULE, ...overrides });

    const chip = getChip(tooltip);
    expect(chip).toHaveTextContent(label);
    expect(getGlyphs(chip)).toEqual([glyph]);
    expect(chip).toHaveClass(colorClass);
  });

  it.each([
    ['ok', 'Downloaded at 22:00', 'check'],
    ['error', 'The 22:00 download did not complete', 'download'],
  ])('after today’s run ends %s, shows its muted outcome', async (lastRunStatus, tooltip, glyph) => {
    vi.setSystemTime(new Date(2026, 9, 24, 23, 10));
    await renderChip({ ...SCHEDULE, lastRunAtMs: new Date(2026, 9, 24, 22).getTime(), lastRunStatus });

    const chip = getChip(tooltip);
    expect(chip).toHaveTextContent('22:00');
    expect(getGlyphs(chip)).toEqual([glyph]);
    expect(chip).toHaveClass('chip--default');
  });
});
