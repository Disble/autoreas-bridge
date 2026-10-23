import { Chip, Tabs } from '@heroui/react';
import { Icon } from '@iconify/react';
import codeIcon from '@iconify-icons/solar/code-bold';
import { CodeBlock } from '../../../../shared/ui/CodeBlock/CodeBlock';
import type { DrawerTechnicalTab } from '../../drawer/drawer.types';
import { ActivityTechnicalRequests } from './ActivityTechnicalRequests';
import { ACTIVITY_TECHNICAL_LEVEL_COLORS, ACTIVITY_TECHNICAL_TAB_LABELS } from './activity-technical-view.constants';
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
      <Tabs className="gap-4" onSelectionChange={(key) => props.onSelectTab(String(key) as DrawerTechnicalTab)} selectedKey={props.tab}>
        <Tabs.ListContainer className="w-fit">
          <Tabs.List aria-label="Technical details">
            {props.tabs.map((tab) => (
              <Tabs.Tab className="h-7 px-3 text-[12.5px] whitespace-nowrap" id={tab} key={tab}>
                {ACTIVITY_TECHNICAL_TAB_LABELS[tab]}
                <Tabs.Indicator />
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
          <ul aria-label="Events" className="flex flex-col gap-2 text-sm">
            {props.events.map((event) => (
              <li className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-3" key={event.key}>
                <span className="font-mono text-xs text-muted tabular-nums">{event.time}</span>
                <Chip color={ACTIVITY_TECHNICAL_LEVEL_COLORS[event.level] ?? 'default'} size="sm" variant="soft">
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
        <Tabs.Panel className="flex flex-col gap-4 p-0" id="data">
          {props.data.map((block) => (
            <CodeBlock key={block.label} label={block.label} notice="Nothing was stored." raw={block.raw} state={block.raw === '' ? 'not-captured' : 'captured'} />
          ))}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
