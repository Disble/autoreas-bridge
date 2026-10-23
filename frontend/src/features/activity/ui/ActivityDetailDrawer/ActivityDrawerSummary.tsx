import { ActivityDrawerSection } from './ActivityDrawerSection';
import type { ActivityDrawerSummaryProps } from './activity-detail-drawer.types';

/** The summary view: the line's sections, top to bottom. */
export function ActivityDrawerSummary({ sections }: ActivityDrawerSummaryProps) {
  return (
    <div className="flex flex-col gap-5" data-testid="activity-drawer-summary">
      {sections.map((section) => (
        <ActivityDrawerSection key={section.key} section={section} />
      ))}
    </div>
  );
}
