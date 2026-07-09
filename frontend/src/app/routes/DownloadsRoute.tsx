import { Card } from '@heroui/react';
import { HosterPriorityEditor } from '../../features/download/ui/HosterPriorityEditor/HosterPriorityEditor';
import { JDConfigPanel } from '../../features/download/ui/JDConfigPanel/JDConfigPanel';
import { ManualTriggerButton } from '../../features/download/ui/ManualTriggerButton/ManualTriggerButton';
import { RunHistoryPanel } from '../../features/download/ui/RunHistoryPanel/RunHistoryPanel';
import { SchedulePanel } from '../../features/download/ui/SchedulePanel/SchedulePanel';
import { SoloAnimeDownloadPanel } from '../../features/download/ui/SoloAnimeDownloadPanel/SoloAnimeDownloadPanel';

export function DownloadsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Downloads</h1>
        <p className="text-sm text-muted">Configure auto-download, run a check now, and review run history</p>
      </header>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Card>
          <Card.Header>
            <Card.Title>Manual check</Card.Title>
            <Card.Description>Run an out-of-band download check immediately</Card.Description>
          </Card.Header>
          <Card.Content>
            <ManualTriggerButton />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Solo anime download</Card.Title>
            <Card.Description>Search one anime and download every missing chapter until it is up to date</Card.Description>
          </Card.Header>
          <Card.Content>
            <SoloAnimeDownloadPanel />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Schedule</Card.Title>
            <Card.Description>Control the daily automatic download check</Card.Description>
          </Card.Header>
          <Card.Content>
            <SchedulePanel />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Hoster priority</Card.Title>
            <Card.Description>Reorder which hoster is tried first per site</Card.Description>
          </Card.Header>
          <Card.Content>
            <HosterPriorityEditor />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>JDownloader</Card.Title>
            <Card.Description>MyJDownloader credentials and live connection status</Card.Description>
          </Card.Header>
          <Card.Content>
            <JDConfigPanel />
          </Card.Content>
        </Card>

        <Card className="lg:col-span-2">
          <Card.Header>
            <Card.Title>Run history</Card.Title>
            <Card.Description>Past download checks and any manual links left by an offline JDownloader</Card.Description>
          </Card.Header>
          <Card.Content>
            <RunHistoryPanel />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
