import { ActivityRunStory } from '../ActivityRunStory/ActivityRunStory';
import { ActivityDrawerBeforeAfter, ActivityDrawerCause, ActivityDrawerFacts, ActivityDrawerList, ActivityDrawerStats } from './ActivityDrawerSectionBlocks';
import { ACTIVITY_DRAWER_CODE_CLASS } from './activity-detail-drawer.constants';
import type { ActivityDrawerSectionProps } from './activity-detail-drawer.types';

/** One section of the summary: its optional title, then its body by kind. */
export function ActivityDrawerSection({ section }: ActivityDrawerSectionProps) {
  return (
    <section aria-label={'title' in section && section.title !== '' ? section.title : undefined} className="flex min-w-0 flex-col gap-2">
      {'title' in section && section.title !== '' && <h3 className="text-[13px] font-medium text-muted">{section.title}</h3>}
      {section.kind === 'before-after' && <ActivityDrawerBeforeAfter section={section} />}
      {section.kind === 'stats' && <ActivityDrawerStats section={section} />}
      {section.kind === 'facts' && <ActivityDrawerFacts section={section} />}
      {section.kind === 'cause' && <ActivityDrawerCause section={section} />}
      {section.kind === 'list' && <ActivityDrawerList section={section} />}
      {section.kind === 'code' && <pre className={ACTIVITY_DRAWER_CODE_CLASS}>{section.text}</pre>}
      {section.kind === 'run-story' && <ActivityRunStory correlationId={section.correlationId} />}
      {section.kind === 'note' && <p className="text-xs text-muted">{section.text}</p>}
    </section>
  );
}
