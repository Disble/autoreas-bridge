import { Button, Chip, Tabs } from '@heroui/react';
import { Icon } from '@iconify/react';
import pinIcon from '@iconify-icons/solar/pin-bold';
import { ActivityHistory } from '../../history/ActivityHistory';
import { ActivityRecorder } from '../../recorder/ActivityRecorder';
import { ActivityIncidents } from '../ActivityIncidents/ActivityIncidents';
import { ActivityNow } from '../ActivityNow/ActivityNow';
import { useActivityScreen } from './use-activity-screen';

/**
 * The Activity shell: the Now · Incidents · History tab strip with "Pin this
 * moment" beside it. An incident opened from Now reaches the Incidents tab
 * as an open request, and the recorder link under Now covers the tabs with
 * the 2-hour recorder until Back.
 */
export function ActivityScreen() {
  const { selectedTab, selectTab, incidentRequest, openIncident, isRecorderOpen, openRecorder, closeRecorder, pairPhone, pin, isPinning } = useActivityScreen();

  if (isRecorderOpen) {
    return <ActivityRecorder onBack={closeRecorder} />;
  }

  return (
    <Tabs onSelectionChange={selectTab} selectedKey={selectedTab}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs.ListContainer className="w-fit max-w-full whitespace-nowrap">
          <Tabs.List aria-label="Activity views">
            <Tabs.Tab id="now">
              Now
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="incidents">
              Incidents
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="history">
              History
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Button isPending={isPinning} onPress={pin} size="sm" variant="secondary">
          <Icon aria-hidden icon={pinIcon} />
          Pin this moment
        </Button>
      </div>
      <Tabs.Panel className="flex flex-col gap-3 pt-4" id="now">
        <ActivityNow onOpenIncident={openIncident} />
        <Button className="self-start" onPress={openRecorder} size="sm" variant="ghost">
          <Chip color="success" size="sm" variant="soft">
            Recording
          </Chip>
          See every request from the last 2 hours
        </Button>
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="incidents">
        <ActivityIncidents openRequest={incidentRequest} />
      </Tabs.Panel>
      <Tabs.Panel className="pt-4" id="history">
        <ActivityHistory onPairPhone={pairPhone} />
      </Tabs.Panel>
    </Tabs>
  );
}
