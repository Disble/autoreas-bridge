import { ChapterSchedulePanel } from '../../features/chapters/ui/ChapterSchedulePanel/ChapterSchedulePanel';

/**
 * ChaptersRoute presents the schedule workspace used to update today's anime
 * progress from the main routed shell.
 */
export function ChaptersRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Chapters</h1>
        <p className="text-sm text-muted">Update today&apos;s anime progress without opening Legacy.</p>
      </header>
      <div className="min-w-0">
        <ChapterSchedulePanel />
      </div>
    </div>
  );
}
