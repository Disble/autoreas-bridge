import plusIcon from '@iconify-icons/tabler/plus';
import menuIcon from '@iconify-icons/solar/menu-dots-bold';
import minusIcon from '@iconify-icons/tabler/minus';
import { Icon } from '@iconify/react';
import { Button, Card, Chip, Modal, Tooltip, Typography } from '@heroui/react';
import type { MouseEvent } from 'react';
import { AnimeDesktopActions } from '../../../../shared/ui/AnimeDesktopActions';
import { CoverPlaceholderScene } from '../../../../shared/ui/CoverPlaceholderScene';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ICON_ACTION_TOOLTIP_DELAY_MS } from '../../../../shared/ui/IconActionButton/icon-action-button.constants';
import { SeasonRateAction } from '../../../season/ui/SeasonRateAction/SeasonRateAction';
import {
  EPISODE_ADD_HALF_HINT,
  EPISODE_ADD_TOOLTIP,
  EPISODE_CHANGE_STATUS_TOOLTIP,
  EPISODE_COVER_SLOT_CLASS,
  EPISODE_STATE_OPTIONS,
  EPISODE_SUBTRACT_HALF_HINT,
  EPISODE_SUBTRACT_TOOLTIP,
} from './episode-schedule-panel.constants';
import type { EpisodeScheduleCardProps } from './episode-schedule-panel.types';

/**
 * Renders one episode-schedule row: cover slot, watched/remaining hover-swap,
 * the episode stepper (a gray minus and the row's primary plus), real-path
 * tooltips, the long-episode chip beside the status chip when the next episode
 * runs long, and the status modal. The primary plus is the one icon-only button
 * outside `IconActionButton`, by name: it keeps the row's primary emphasis.
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
        <Card.Content className="grid min-w-0 flex-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 flex-nowrap items-center gap-2">
              <Typography type="h2" className="min-w-0 flex-initial truncate text-base font-semibold text-foreground">
                {row.name}
              </Typography>
              <Chip className="shrink-0" size="sm" color={row.isProgressBlocked ? 'warning' : 'success'} variant="soft">
                {row.stateLabel}
              </Chip>
              {row.longEpisodeChip !== undefined && (
                <Tooltip delay={0}>
                  <Tooltip.Trigger aria-label={row.longEpisodeChip.tooltip} className="shrink-0">
                    <Chip size="sm" color="accent" variant="soft">
                      {row.longEpisodeChip.label}
                    </Chip>
                  </Tooltip.Trigger>
                  <Tooltip.Content showArrow placement="bottom">
                    <Tooltip.Arrow />
                    {row.longEpisodeChip.tooltip}
                  </Tooltip.Content>
                </Tooltip>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
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
              <span className="group relative cursor-default">
                <span className="group-hover:hidden">{row.watchedLabel}</span>
                <span className="hidden group-hover:inline">{row.remainingLabel}</span>
              </span>
            </div>
          </div>

          <div className="flex shrink-0 flex-nowrap items-center gap-2 sm:justify-end">
            <IconActionButton
              ariaLabel={`Subtract one episode for ${row.name}. Secondary click subtracts half episode.`}
              detail={EPISODE_SUBTRACT_HALF_HINT}
              icon={minusIcon}
              isDisabled={row.isProgressBlocked}
              tooltip={EPISODE_SUBTRACT_TOOLTIP}
              onContextMenu={() => void adjustWatchedEpisodes(row.id, -0.5, row.modifiedAt)}
              onPress={() => void adjustWatchedEpisodes(row.id, -1, row.modifiedAt)}
            />
            <Tooltip delay={ICON_ACTION_TOOLTIP_DELAY_MS}>
              <Tooltip.Trigger className="inline-flex shrink-0 rounded-full" role="presentation" tabIndex={-1}>
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
                  <Icon aria-hidden="true" className="size-[18px]" icon={plusIcon} />
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content showArrow>
                <Tooltip.Arrow />
                <span className="flex flex-col">
                  <span>{EPISODE_ADD_TOOLTIP}</span>
                  <span className="text-muted">{EPISODE_ADD_HALF_HINT}</span>
                </span>
              </Tooltip.Content>
            </Tooltip>
            <Modal>
              <IconActionButton ariaLabel={`Change status for ${row.name}. Current status: ${row.stateLabel}.`} icon={menuIcon} tone="warning" tooltip={EPISODE_CHANGE_STATUS_TOOLTIP} />
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
