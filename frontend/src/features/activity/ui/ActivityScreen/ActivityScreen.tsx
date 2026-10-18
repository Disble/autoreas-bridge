import { Button, Tabs } from '@heroui/react';
import { Icon } from '@iconify/react';
import dangerIcon from '@iconify-icons/solar/danger-triangle-bold-duotone';
import historyIcon from '@iconify-icons/solar/history-bold-duotone';
import pinIcon from '@iconify-icons/solar/pin-bold';
import { AwaitingSelectionPane } from '../../../../shared/ui/AwaitingSelectionPane/AwaitingSelectionPane';
import { ActivityNow } from '../ActivityNow/ActivityNow';
import { useActivityScreen } from './use-activity-screen';

/**
 * The Activity shell: the Now · Incidents · History tab strip with "Pin this
 * moment" beside it. Incidents and History hold their resting pane until
 * their own views are built.
 */
export function ActivityScreen() {
  const { selectedTab, selectTab, openIncident, pin, isPinning } = useActivityScreen();

  return (
    <Tabs onSelectionChange={selectTab} selectedKey={selectedTab} variant="secondary">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Activity views">
            <Tabs.Tab id="now">Now</Tabs.Tab>
            <Tabs.Tab id="incidents">Incidents</Tabs.Tab>
            <Tabs.Tab id="history">History</Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Button isPending={isPinning} onPress={pin} size="sm" variant="secondary">
          <Icon aria-hidden icon={pinIcon} />
          Pin this moment
        </Button>
      </div>
      <Tabs.Panel className="pt-4" id="now">
        <ActivityNow onOpenIncident={openIncident} />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="incidents">
        <AwaitingSelectionPane description="Errors of the last 7 days, grouped by what went wrong." icon={dangerIcon} title="No incident selected" />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="history">
        <AwaitingSelectionPane description="Every change of the last 90 days, day by day." icon={historyIcon} title="No day selected" />
      </Tabs.Panel>
    </Tabs>
  );
}
