import pencilIcon from '@iconify-icons/tabler/pencil';
import plusIcon from '@iconify-icons/tabler/plus';
import { Icon } from '@iconify/react';
import { Button, Chip, Skeleton, Table } from '@heroui/react';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import {
  EPISODE_ADD_LABEL,
  EPISODE_EDIT_DURATION_TOOLTIP,
  EPISODE_DURATIONS_LOADING_LABEL,
  EPISODE_DURATIONS_ROW_CLASS,
  EPISODE_DURATIONS_SKELETON_ROW_COUNT,
} from './episode-durations-section.constants';
import type { EpisodeDurationsSectionProps } from './episode-durations-section.types';

/**
 * Renders the Episodes table: Episode | Duration | Source | Edit, with the Add
 * episode text button in its last row. While the section loads, the table keeps
 * its header and renders skeleton rows instead of real ones, marked `aria-busy`,
 * with a labelled status region beside it (a status region cannot nest inside
 * table markup). The rows grow progressively inside their own scroller.
 */
export function EpisodeDurationsTable({ viewModel }: Readonly<EpisodeDurationsSectionProps>) {
  const isLoading = viewModel.view === 'loading';
  return (
    <>
      {isLoading ? (
        <div aria-labelledby="episode-durations-loading-label" aria-live="polite" className="sr-only" role="status">
          <span id="episode-durations-loading-label">{EPISODE_DURATIONS_LOADING_LABEL}</span>
        </div>
      ) : null}
      <div className="max-h-[28rem] min-w-0 overflow-y-auto" data-testid="episode-durations-scroll" ref={viewModel.listWindow.scrollRef} onScroll={viewModel.listWindow.onScroll}>
        <Table aria-busy={isLoading} aria-label="Episode durations" variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label="Episode durations" className="w-full table-fixed">
              <Table.Header>
                <Table.Column className="w-[88px]" isRowHeader>Episode</Table.Column>
                <Table.Column>Duration</Table.Column>
                <Table.Column className="w-[200px]">Source</Table.Column>
                <Table.Column className="w-[64px] text-right">Edit</Table.Column>
              </Table.Header>
              <Table.Body>
                {isLoading ? Array.from({ length: EPISODE_DURATIONS_SKELETON_ROW_COUNT }, (_unused, index) => (
                  <Table.Row className={EPISODE_DURATIONS_ROW_CLASS} data-testid="episode-durations-skeleton-row" id={`skeleton-${index}`} isDisabled key={`skeleton-${index}`}>
                    <Table.Cell><Skeleton className="h-3.5 w-8 rounded" /></Table.Cell>
                    <Table.Cell><Skeleton className="h-3.5 w-16 rounded" /></Table.Cell>
                    <Table.Cell><Skeleton className="h-3.5 w-24 rounded" /></Table.Cell>
                    <Table.Cell><Skeleton className="ml-auto size-7 rounded-full" /></Table.Cell>
                  </Table.Row>
                )) : [
                  ...viewModel.visibleRows.map((row) => (
                    <Table.Row className={EPISODE_DURATIONS_ROW_CLASS} data-testid="episode-durations-row" id={row.id} key={row.id}>
                      <Table.Cell><span className="font-mono text-[13px]">{row.number}</span></Table.Cell>
                      <Table.Cell>
                        <span className="flex min-w-0 items-center gap-2">
                          <span className={row.hasDuration ? 'text-foreground' : 'text-muted'}>{row.durationLabel}</span>
                          {row.isLong ? <Chip color="warning" size="sm" variant="soft">Long</Chip> : null}
                          {row.isUnsaved ? <Chip color="accent" size="sm" variant="soft">Unsaved</Chip> : null}
                        </span>
                      </Table.Cell>
                      <Table.Cell><span className="block truncate text-[13px] text-muted">{row.sourceLabel}</span></Table.Cell>
                      <Table.Cell>
                        <span className="flex justify-end">
                          <IconActionButton ariaLabel={row.editLabel} icon={pencilIcon} isDisabled={viewModel.isEditingLocked} tone="accent" tooltip={EPISODE_EDIT_DURATION_TOOLTIP} onPress={() => viewModel.onOpenEdit(row.episode)} />
                        </span>
                      </Table.Cell>
                    </Table.Row>
                  )),
                  ...(viewModel.showsAddRow ? [
                    <Table.Row id="add-episode" key="add-episode">
                      <Table.Cell colSpan={4}>
                        <Button className="text-accent" isDisabled={viewModel.isEditingLocked} size="sm" variant="ghost" onPress={viewModel.onOpenAdd}>
                          <Icon aria-hidden="true" icon={plusIcon} />
                          {EPISODE_ADD_LABEL}
                        </Button>
                      </Table.Cell>
                    </Table.Row>,
                  ] : []),
                ]}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </div>
    </>
  );
}
