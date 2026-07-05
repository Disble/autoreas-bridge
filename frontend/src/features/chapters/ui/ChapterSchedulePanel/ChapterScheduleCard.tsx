import addCircleIcon from '@iconify-icons/solar/add-circle-broken';
import folderIcon from '@iconify-icons/solar/folder-open-bold-duotone';
import linkIcon from '@iconify-icons/solar/link-round-bold-duotone';
import menuIcon from '@iconify-icons/solar/menu-dots-bold';
import minusCircleIcon from '@iconify-icons/solar/minus-circle-broken';
import { Icon } from '@iconify/react';
import { Button, Card, Chip, Modal, Tooltip, Typography } from '@heroui/react';
import type { MouseEvent } from 'react';
import { CoverPlaceholderScene } from '../../../../shared/ui/CoverPlaceholderScene';
import { CHAPTER_COVER_SLOT_CLASS, CHAPTER_STATE_OPTIONS } from './chapter-schedule-panel.constants';
import type { ChapterScheduleCardProps } from './chapter-schedule-panel.types';

/**
 * Renders one chapter-schedule row: cover slot, watched/remaining hover-swap,
 * danger-colored minus, primary plus, real-path tooltips, and the status modal.
 */
export function ChapterScheduleCard(props: Readonly<ChapterScheduleCardProps>) {
  const { adjustWatchedChapters, copyAnimeFolder, copyAnimePage, openAnimeFolder, openAnimePage, row, setAnimeState } = props;
  const hasResolvedCover = !row.showCoverPlaceholder && row.coverDataUrl !== undefined;

  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-24 gap-4">
        {hasResolvedCover ? (
          <div className={CHAPTER_COVER_SLOT_CLASS} data-testid="chapter-schedule-cover-slot">
            <img alt="" className="absolute inset-0 size-full object-cover" data-testid="chapter-schedule-cover-image" src={row.coverDataUrl} />
          </div>
        ) : (
          <div className={CHAPTER_COVER_SLOT_CLASS} data-testid="chapter-schedule-cover-slot">
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
              {row.hasPage ? (
                <Tooltip delay={0}>
                  <Button
                    isIconOnly
                    aria-label={`Open page for ${row.name}. Secondary click copies page URL.`}
                    className="hover:text-accent"
                    size="sm"
                    variant="tertiary"
                    onContextMenu={(event: MouseEvent) => {
                      event.preventDefault();
                      void copyAnimePage(row.id);
                    }}
                    onPress={() => void openAnimePage(row.id)}
                  >
                    <Icon icon={linkIcon} className="size-4" />
                  </Button>
                  <Tooltip.Content showArrow>
                    <Tooltip.Arrow />
                    {row.pageUrl}
                  </Tooltip.Content>
                </Tooltip>
              ) : null}
              {row.hasFolder ? (
                <Tooltip delay={0}>
                  <Button
                    isIconOnly
                    aria-label={`Open folder for ${row.name}. Secondary click copies folder path.`}
                    className="hover:text-success"
                    size="sm"
                    variant="tertiary"
                    onContextMenu={(event: MouseEvent) => {
                      event.preventDefault();
                      void copyAnimeFolder(row.id);
                    }}
                    onPress={() => void openAnimeFolder(row.id)}
                  >
                    <Icon icon={folderIcon} className="size-4" />
                  </Button>
                  <Tooltip.Content showArrow>
                    <Tooltip.Arrow />
                    {row.folderPath}
                  </Tooltip.Content>
                </Tooltip>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Button
              isIconOnly
              aria-label={`Subtract one chapter for ${row.name}. Secondary click subtracts half chapter.`}
              isDisabled={row.isProgressBlocked}
              size="sm"
              variant="secondary"
              onContextMenu={(event: MouseEvent) => {
                event.preventDefault();
                void adjustWatchedChapters(row.id, -0.5, row.modifiedAt);
              }}
              onPress={() => void adjustWatchedChapters(row.id, -1, row.modifiedAt)}
            >
              <Icon icon={minusCircleIcon} className="size-5" />
            </Button>
            <Button
              isIconOnly
              aria-label={`Add one chapter for ${row.name}. Secondary click adds half chapter.`}
              isDisabled={row.isProgressBlocked}
              size="sm"
              variant="primary"
              onContextMenu={(event: MouseEvent) => {
                event.preventDefault();
                void adjustWatchedChapters(row.id, 0.5, row.modifiedAt);
              }}
              onPress={() => void adjustWatchedChapters(row.id, 1, row.modifiedAt)}
            >
              <Icon icon={addCircleIcon} className="size-5" />
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
                        {CHAPTER_STATE_OPTIONS.map((state) => (
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
          </div>
        </Card.Content>
      </div>
    </Card>
  );
}
