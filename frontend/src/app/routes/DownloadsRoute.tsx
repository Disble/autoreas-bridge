import { Card, Typography } from '@heroui/react';
import { HosterPriorityEditor } from '../../features/download/ui/HosterPriorityEditor/HosterPriorityEditor';
import { JDConfigPanel } from '../../features/download/ui/JDConfigPanel/JDConfigPanel';
import { ManualTriggerButton } from '../../features/download/ui/ManualTriggerButton/ManualTriggerButton';
import { RunHistoryPanel } from '../../features/download/ui/RunHistoryPanel/RunHistoryPanel';
import { SchedulePanel } from '../../features/download/ui/SchedulePanel/SchedulePanel';
import { SoloAnimeDownloadPanel } from '../../features/download/ui/SoloAnimeDownloadPanel/SoloAnimeDownloadPanel';

/**
 * DownloadsRoute assembles the download-management panels exposed under the
 * routed Downloads workspace.
 */
export function DownloadsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1">Downloads</Typography><Typography color="muted" type="body-sm">Configure auto-download, run a check now, and review run history</Typography>
      </header>

      {/*
       * Masonry-lite via CSS multi-column: cards pack down each column with no
       * row-height gaps (fixes the dead space under short cards like "Manual
       * check"). WebView2 (Chromium stable) has no `grid-template-rows: masonry`
       * support, so multi-column is the portable path. Trade-off: cards flow
       * down-column, not left-to-right across rows.
       */}
      <div className="min-w-0 columns-1 gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
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
            <Card.Description>Search one anime and download every missing episode until it is up to date</Card.Description>
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
      </div>

      {/* Run history stays full-width below the packed columns. */}
      <Card>
        <Card.Header>
          <Card.Title>Run history</Card.Title>
          <Card.Description>Past download checks and any manual links left by an offline JDownloader</Card.Description>
        </Card.Header>
        <Card.Content>
          <RunHistoryPanel />
        </Card.Content>
      </Card>
    </div>
  );
}
