import checkIcon from '@iconify-icons/solar/check-circle-linear';
import downloadIcon from '@iconify-icons/solar/download-minimalistic-linear';
import offIcon from '@iconify-icons/solar/forbidden-circle-linear';
import type { IconifyIcon } from '@iconify/react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduleConfig } from '../../../../../../shared/contracts/download.types';
import { createDownloadsSourceFake, createDownloadsWrapper } from '../../../../../../shared/hooks/use-missed-schedule-notice/__tests__/downloads.test-support';
import type { DownloadsSource } from '../../../../../../shared/contracts/download.types';
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

/**
 * A downloads port whose schedule read resolves to the given config.
 * @param config The schedule the read answers.
 * @returns The port.
 */
function createSource(config: ScheduleConfig): DownloadsSource {
  return createDownloadsSourceFake({ getScheduleConfig: vi.fn().mockResolvedValue(config) });
}

/**
 * Renders the chip over source under a downloads wrapper whose module is ready.
 * @param source The downloads port.
 * @returns The render result and the wrapper's client.
 */
function renderWithDownloads(source: DownloadsSource) {
  const { client, wrapper } = createDownloadsWrapper();
  return { ...render(<AutoDownloadChip source={source} />, { wrapper }), client };
}

/** Renders the chip and lets the schedule read settle. */
async function renderChip(config: ScheduleConfig) {
  renderWithDownloads(createSource(config));
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
  });

  it('renders nothing until loaded, then a medium chip with the time, and moves on once the time passes', async () => {
    const { container } = renderWithDownloads(createSource(SCHEDULE));

    expect(container).toBeEmptyDOMElement();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // A medium chip leaves room around its glyph and label.
    expect(getChip('Scheduled download at 22:00')).toHaveClass('chip--md');
    // The time shows with its full sentence as the accessible name.
    expect(getChip('Scheduled download at 22:00')).toHaveTextContent('22:00');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });

    expect(screen.getByLabelText('The 22:00 download did not complete')).toHaveTextContent('22:00');
    expect(screen.queryByLabelText('Scheduled download at 22:00')).not.toBeInTheDocument();
  });

  it('renders nothing when the schedule could not be read, rather than claiming it is off', async () => {
    const source = { ...createSource(SCHEDULE), getScheduleConfig: vi.fn().mockRejectedValue(new Error('store unavailable')) };
    const { container } = renderWithDownloads(source);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('stops re-reading the clock once it unmounts', async () => {
    const { unmount, client } = renderWithDownloads(createSource(SCHEDULE));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    // The query cache keeps its own garbage-collection timer; only the chip's clock is under test.
    client.clear();

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
