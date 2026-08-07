import { Card, Tabs, Typography } from '@heroui/react';
import { EpisodeRenamePanel } from '../../features/download/ui/EpisodeRenamePanel/EpisodeRenamePanel';
import { HosterPriorityEditor } from '../../features/download/ui/HosterPriorityEditor/HosterPriorityEditor';
import { JDConfigPanel } from '../../features/download/ui/JDConfigPanel/JDConfigPanel';
import { JDLimitsPanel } from '../../features/download/ui/JDLimitsPanel/JDLimitsPanel';
import { ManualTriggerButton } from '../../features/download/ui/ManualTriggerButton/ManualTriggerButton';
import { RunHistoryPanel } from '../../features/download/ui/RunHistoryPanel/RunHistoryPanel';
import { SchedulePanel } from '../../features/download/ui/SchedulePanel/SchedulePanel';
import { SoloAnimeDownloadPanel } from '../../features/download/ui/SoloAnimeDownloadPanel/SoloAnimeDownloadPanel';

/**
 * DownloadsRoute assembles the download-management panels exposed under the
 * routed Downloads workspace, split into two tabs: the "Downloads" tab holds
 * everything you touch or read daily -- the act-now controls, the schedule
 * (whose last/next run line is glance information), and the run history --
 * while the "Configuration" tab holds the set-once knobs. Keeping both here
 * (rather than moving configuration to Settings) preserves the observe-then-tune
 * loop between run history and hoster priority, and keeps the rule "everything
 * about downloads lives in Downloads" free of exceptions.
 *
 * The tab selection is deliberately uncontrolled: `frontend/src/app/**` is
 * delivery/composition only, so it must not hold React state.
 */
export function DownloadsRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <Typography type="h1">Downloads</Typography>
        <Typography color="muted" type="body-sm">
          Run downloads, review run history, and configure how downloads behave
        </Typography>
      </header>

      <Tabs defaultSelectedKey="downloads">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Downloads sections">
            <Tabs.Tab id="downloads">
              Downloads
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="configuration">
              Configuration
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel id="downloads">
          <div className="flex flex-col gap-4">
            {/*
             * Masonry-lite via CSS multi-column: cards pack down each column with
             * no row-height gaps (fixes the dead space under short cards like
             * "Manual check"). WebView2 (Chromium stable) has no
             * `grid-template-rows: masonry` support, so multi-column is the
             * portable path. Trade-off: cards flow down-column, not left-to-right
             * across rows. Repeated verbatim on the Configuration tab: the app
             * layer is governed by strict colocation, so it may not hoist this
             * into a root-level constant.
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
        </Tabs.Panel>

        <Tabs.Panel id="configuration">
          <div className="min-w-0 columns-1 gap-4 lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
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
                <Card.Title>Episode naming</Card.Title>
                <Card.Description>Give each downloaded episode a name you can actually read</Card.Description>
              </Card.Header>
              <Card.Content>
                <EpisodeRenamePanel />
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

            <Card>
              <Card.Header>
                <Card.Title>Download limits</Card.Title>
                <Card.Description>How many downloads JDownloader runs at once, and the pace Bridge matches</Card.Description>
              </Card.Header>
              <Card.Content>
                <JDLimitsPanel />
              </Card.Content>
            </Card>
          </div>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
