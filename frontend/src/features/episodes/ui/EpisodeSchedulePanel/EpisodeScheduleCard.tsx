import plusIcon from '@iconify-icons/tabler/plus';
import menuIcon from '@iconify-icons/solar/menu-dots-bold';
import minusIcon from '@iconify-icons/tabler/minus';
import { Icon } from '@iconify/react';
import { Button, Card, Chip, Modal, Typography } from '@heroui/react';
import type { MouseEvent } from 'react';
import { AnimeDesktopActions } from '../../../../shared/ui/AnimeDesktopActions';
import { CoverPlaceholderScene } from '../../../../shared/ui/CoverPlaceholderScene';
import { SeasonRateAction } from '../../../season/ui/SeasonRateAction/SeasonRateAction';
import { EPISODE_COVER_SLOT_CLASS, EPISODE_STATE_OPTIONS } from './episode-schedule-panel.constants';
import type { EpisodeScheduleCardProps } from './episode-schedule-panel.types';

/**
 * Renders one episode-schedule row: cover slot, watched/remaining hover-swap,
 * danger-colored minus, primary plus, real-path tooltips, and the status modal.
 */
export function EpisodeScheduleCard(props: Readonly<EpisodeScheduleCardProps>) {
  const { adjustWatchedEpisodes, copyAnimeFolder, copyAnimePage, openAnimeFolder, openAnimePage, row, setAnimeState } = props;
  const hasResolvedCover = !row.showCoverPlaceholder && row.coverDataUrl !== undefined;

  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-24 gap-4">
        {hasResolvedCover ? (
          <div className={EPISODE_COVER_SLOT_CLASS} data-testid="episode-schedule-cover-slot">
            <img alt="" className="absolute inset-0 size-full object-cover" data-testid="episode-schedule-cover-image" src={row.coverDataUrl} />
          </div>
        ) : (
          <div className={EPISODE_COVER_SLOT_CLASS} data-testid="episode-schedule-cover-slot">
            <CoverPlaceholderScene className="absolute inset-0 size-full" />
          </div>
        )}
        <Card.Content className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography type="h2" className="truncate text-base font-semibold text-foreground">
                {row.name}
              </Typography>
              <Chip size="sm" color={row.isProgressBlocked ? 'warning' : 'success'} variant="soft">
                {row.stateLabel}
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="group relative cursor-default">
                <span className="group-hover:hidden">{row.watchedLabel}</span>
                <span className="hidden group-hover:inline">{row.remainingLabel}</span>
              </span>
              <AnimeDesktopActions
                animeId={row.id}
                name={row.name}
                hasPage={row.hasPage}
                hasFolder={row.hasFolder}
                pageUrl={row.pageUrl}
                folderPath={row.folderPath}
                onOpenPage={openAnimePage}
                onCopyPage={copyAnimePage}
                onOpenFolder={openAnimeFolder}
                onCopyFolder={copyAnimeFolder}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              isIconOnly
              aria-label={`Subtract one episode for ${row.name}. Secondary click subtracts half episode.`}
              isDisabled={row.isProgressBlocked}
              size="sm"
              variant="secondary"
              onContextMenu={(event: MouseEvent) => {
                event.preventDefault();
                void adjustWatchedEpisodes(row.id, -0.5, row.modifiedAt);
              }}
              onPress={() => void adjustWatchedEpisodes(row.id, -1, row.modifiedAt)}
            >
              <Icon icon={minusIcon} className="size-5" />
            </Button>
            <Button
              isIconOnly
              aria-label={`Add one episode for ${row.name}. Secondary click adds half episode.`}
              isDisabled={row.isProgressBlocked}
              size="sm"
              variant="primary"
              onContextMenu={(event: MouseEvent) => {
                event.preventDefault();
                void adjustWatchedEpisodes(row.id, 0.5, row.modifiedAt);
              }}
              onPress={() => void adjustWatchedEpisodes(row.id, 1, row.modifiedAt)}
            >
              <Icon icon={plusIcon} className="size-5" />
            </Button>
            <Modal>
              <Button isIconOnly aria-label={`Change status for ${row.name}. Current status: ${row.stateLabel}.`} className="hover:text-warning" size="sm" variant="tertiary">
                <Icon icon={menuIcon} className="size-5" />
              </Button>
              <Modal.Backdrop variant="blur">
                <Modal.Container>
                  <Modal.Dialog className="sm:max-w-[420px]">
                    <Modal.CloseTrigger />
                    <Modal.Header>
                      <Modal.Heading>Change anime status</Modal.Heading>
                      <Typography type="body-sm" color="muted">
                        {row.name}
                      </Typography>
                    </Modal.Header>
                    <Modal.Body>
                      <div className="grid grid-cols-2 gap-2">
                        {EPISODE_STATE_OPTIONS.map((state) => (
                          <Button key={state.value} aria-label={`Set ${row.name} as ${state.label}`} variant={row.stateLabel === state.label ? 'secondary' : 'tertiary'} onPress={() => void setAnimeState(row.id, state.value, row.modifiedAt)}>
                            <Icon icon={state.icon} className="size-4" />
                            {state.label}
                          </Button>
                        ))}
                      </div>
                    </Modal.Body>
                  </Modal.Dialog>
                </Modal.Container>
              </Modal.Backdrop>
            </Modal>
            <SeasonRateAction animeId={row.id} rawName={row.name} />
          </div>
        </Card.Content>
      </div>
    </Card>
  );
}
