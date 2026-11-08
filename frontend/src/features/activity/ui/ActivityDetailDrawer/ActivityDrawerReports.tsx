import { useDrawerReportWindow } from '../../drawer/use-drawer-report-window';
import { ActivityDrawerFacts } from './ActivityDrawerSectionBlocks';
import { ACTIVITY_DRAWER_REPORTS_SCROLL_CLASS } from './activity-detail-drawer.constants';
import type { ActivityDrawerReportsProps } from './activity-detail-drawer.types';

/** The reports of a Bridge off group, each with its times: one batch, growing near the bottom of its scroll area. */
export function ActivityDrawerReports({ section }: ActivityDrawerReportsProps) {
  const { scrollRef, onScroll, visibleItems } = useDrawerReportWindow(section.reports);

  return (
    <div className={ACTIVITY_DRAWER_REPORTS_SCROLL_CLASS} onScroll={onScroll} ref={scrollRef}>
      <ul aria-label={section.title} className="flex flex-col">
        {visibleItems.map((report) => (
          <li className="py-2.5 [&+&]:shadow-[0_-1px_0_var(--separator)]" key={report.key}>
            <ActivityDrawerFacts section={report} />
          </li>
        ))}
      </ul>
    </div>
  );
}
