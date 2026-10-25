import type { RunProgressBarProps } from './run-history-panel.types';

/**
 * The episodes bar: downloaded in success, failed in danger, and the rest
 * either pulsing accent while the run is live or a muted hatch once it ended
 * and those episodes were never attempted. Each segment grows by its count;
 * the accessible name carries the numbers.
 */
export function RunProgressBar({ bar }: Readonly<RunProgressBarProps>) {
  const pendingClass = bar.isRunning
    ? 'bg-accent animate-pulse motion-reduce:animate-none'
    : 'bg-[repeating-linear-gradient(-45deg,color-mix(in_oklab,var(--muted)_35%,transparent)_0_4px,transparent_4px_8px)]';

  return (
    <div aria-label={bar.label} className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-default" role="img">
      <span className="h-full bg-success transition-[flex-grow] duration-300 ease-out" data-segment="downloaded" style={{ flexGrow: bar.downloaded }} />
      <span className="h-full bg-danger transition-[flex-grow] duration-300 ease-out" data-segment="failed" style={{ flexGrow: bar.failed }} />
      <span className={`h-full transition-[flex-grow] duration-300 ease-out ${pendingClass}`} data-segment="pending" style={{ flexGrow: bar.pending }} />
    </div>
  );
}
