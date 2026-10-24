import { Chip, Tabs } from '@heroui/react';
import { Icon } from '@iconify/react';
import codeIcon from '@iconify-icons/solar/code-bold';
import type { DrawerTechnicalTab } from '../../drawer/drawer.types';
import { ActivityTechnicalJson } from './ActivityTechnicalJson';
import { ActivityTechnicalRequests } from './ActivityTechnicalRequests';
import { ActivityTechnicalWindowError } from './ActivityTechnicalWindowError';
import { ACTIVITY_TECHNICAL_LEVEL_COLORS, ACTIVITY_TECHNICAL_TAB_INDICATOR_CLASS, ACTIVITY_TECHNICAL_TAB_LABELS } from './activity-technical-view.constants';
import type { ActivityTechnicalViewProps } from './activity-technical-view.types';

/**
 * The technical view of the drawer: the untranslated notes, then the tabs
 * Requests (phone lines only), Events and Data.
 */
export function ActivityTechnicalView(props: ActivityTechnicalViewProps) {
  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="activity-technical-view">
      {props.gaps.map((gap) => (
        <p className="flex items-start gap-2 text-xs text-muted" key={gap}>
          <Icon className="mt-0.5 shrink-0" icon={codeIcon} />
          <span>{gap}</span>
        </p>
      ))}
      <Tabs className="gap-5" onSelectionChange={(key) => props.onSelectTab(String(key) as DrawerTechnicalTab)} selectedKey={props.tab}>
        <Tabs.ListContainer className="w-fit rounded-xl">
          <Tabs.List aria-label="Technical details" className="gap-0.5 p-[3px]">
            {props.tabs.map((tab) => (
              <Tabs.Tab className="h-[30px] w-auto min-w-[30px] rounded-[9.6px] px-2.5 text-[13px] font-normal whitespace-nowrap" id={tab} key={tab}>
                {ACTIVITY_TECHNICAL_TAB_LABELS[tab]}
                <Tabs.Indicator className={ACTIVITY_TECHNICAL_TAB_INDICATOR_CLASS} />
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs.ListContainer>
        {props.tabs.includes('requests') && (
          <Tabs.Panel className="p-0" id="requests">
            <ActivityTechnicalRequests
              groups={props.groups}
              lineFailed={props.lineFailed}
              onPickGroup={props.onPickGroup}
              onRetryRequest={props.onRetryRequest}
              panel={props.panel}
              requestStatus={props.requestStatus}
              selectedGroupKey={props.selectedGroupKey}
            />
          </Tabs.Panel>
        )}
        <Tabs.Panel className="p-0" id="events">
          {props.eventsEmpty !== '' && <p className="text-sm text-muted">{props.eventsEmpty}</p>}
          <ul aria-label="Events" className="flex flex-col text-[13px]">
            {props.events.map((event) => (
              <li className="grid grid-cols-[64px_52px_minmax(0,1fr)] items-baseline gap-2.5 py-2 [&+&]:shadow-[0_-1px_0_var(--separator)]" key={event.key}>
                <span className="font-mono text-[13px] text-muted tabular-nums">{event.time}</span>
                <Chip className="h-auto min-w-[52px] justify-center rounded-full px-1.5 py-px text-[11px] font-normal" color={ACTIVITY_TECHNICAL_LEVEL_COLORS[event.level] ?? 'default'} size="sm" variant="soft">
                  {event.level}
                </Chip>
                <span className="min-w-0 break-words">
                  {event.message} <span className="text-muted">· {event.domain}</span>
                  {event.detail !== '' && <small className="block font-mono text-xs text-muted">{event.detail}</small>}
                </span>
              </li>
            ))}
          </ul>
        </Tabs.Panel>
        <Tabs.Panel className="flex flex-col gap-5 p-0" id="data">
          {(props.windowError !== undefined || props.occurrences.length > 0) && (
            <ActivityTechnicalWindowError
              detail={props.windowError}
              occurrenceStatus={props.occurrenceStatus}
              occurrences={props.occurrences}
              onPickOccurrence={props.onPickOccurrence}
              onRetryOccurrence={props.onRetryOccurrence}
              selectedOccurrenceId={props.selectedOccurrenceId}
            />
          )}
          {props.windowError === undefined &&
            props.occurrences.length === 0 &&
            props.data.map((block) => (
              <section aria-label={block.label} className="flex min-w-0 flex-col gap-2" key={block.label}>
                <h3 className="text-[13px] font-medium text-muted">{block.label}</h3>
                {block.raw === '' ? <p className="text-xs text-muted">Nothing was stored.</p> : <ActivityTechnicalJson raw={block.raw} />}
              </section>
            ))}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
