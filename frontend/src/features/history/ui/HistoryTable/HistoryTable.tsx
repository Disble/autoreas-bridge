import { Chip, Input, Label, ListBox, Pagination, Select, Skeleton, Table } from '@heroui/react';
import { Link } from 'react-router';
import {
  HISTORY_TABLE_EMPTY_MESSAGE,
  HISTORY_TABLE_EMPTY_TITLE,
  HISTORY_TABLE_LABEL,
  HISTORY_TABLE_LOADING_LABEL,
  HISTORY_TABLE_SEARCH_PLACEHOLDER,
  HISTORY_TABLE_SKELETON_ROW_COUNT,
} from './history-table.constants';
import type { HistoryTableProps } from './history-table.types';
import { useHistoryTable } from './use-history-table';

/**
 * History surface: a read-only, paginated table over the watch-activity log
 * (Legacy "Historial" parity, per the Anime History spec). Owns its own
 * data/search/filter/page state via `useHistoryTable`; only navigation
 * (drill-down `Link` to Detail) is composed here, not a hook callable.
 */
export function HistoryTable(props: Readonly<HistoryTableProps>) {
  const {
    rows,
    isLoading,
    isEmpty,
    searchQuery,
    estadoFilter,
    estadoOptions,
    page,
    totalPages,
    pageItems,
    onSearchQueryChange,
    onEstadoFilterChange,
    onPageChange,
  } = useHistoryTable(props);

  return (
    <div className={`flex flex-col gap-4 ${props.className ?? ''}`}>
      <section aria-label="History filters" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          aria-label="Search history by name"
          className="w-full sm:max-w-xs"
          placeholder={HISTORY_TABLE_SEARCH_PLACEHOLDER}
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />

        <Select
          aria-label="Filter by status"
          className="w-full sm:w-48"
          placeholder="Status"
          value={estadoFilter}
          onChange={(value) => onEstadoFilterChange(value?.toString() ?? 'all')}
        >
          <Label>Status</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {estadoOptions.map((option) => (
                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </section>

      {isLoading ? (
        <div aria-live="polite" className="flex flex-col gap-2">
          <p className="text-sm text-muted">{HISTORY_TABLE_LOADING_LABEL}</p>
          {Array.from({ length: HISTORY_TABLE_SKELETON_ROW_COUNT }, (_, index) => (
            <Skeleton className="h-10 w-full rounded-lg" key={index} />
          ))}
        </div>
      ) : (
        <Table aria-label={HISTORY_TABLE_LABEL} variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label={HISTORY_TABLE_LABEL} className="w-full table-fixed">
              <Table.Header>
                <Table.Column className="w-[64px]" isRowHeader>
                  #
                </Table.Column>
                <Table.Column>Name</Table.Column>
                <Table.Column className="w-[140px]">Episodes watched</Table.Column>
                <Table.Column className="w-[220px]">Last watched</Table.Column>
                <Table.Column className="w-[120px]">Day</Table.Column>
                <Table.Column className="w-[88px]">Time</Table.Column>
                <Table.Column className="w-[120px]">Status</Table.Column>
              </Table.Header>
              <Table.Body
                renderEmptyState={() => (
                  <div className="flex flex-col items-center gap-1 py-8 text-center">
                    <span className="text-sm font-medium text-foreground">{HISTORY_TABLE_EMPTY_TITLE}</span>
                    <span className="text-sm text-muted">{HISTORY_TABLE_EMPTY_MESSAGE}</span>
                  </div>
                )}
              >
                {isEmpty
                  ? []
                  : rows.map((row) => (
                      <Table.Row id={row.id} key={row.id}>
                        <Table.Cell>{row.rowNumber}</Table.Cell>
                        <Table.Cell>
                          <Link className="font-medium text-foreground underline-offset-2 hover:underline" to={`/catalog/detail/${row.id}`}>
                            {row.nombre}
                          </Link>
                        </Table.Cell>
                        <Table.Cell>{row.nrocapvisto}</Table.Cell>
                        <Table.Cell>
                          <span className="block">{row.longDateLabel}</span>
                          <span className="block text-xs text-muted">{row.relativeRecencyLabel}</span>
                        </Table.Cell>
                        <Table.Cell>{row.weekdayLabel}</Table.Cell>
                        <Table.Cell>{row.timeLabel}</Table.Cell>
                        <Table.Cell>
                          <Chip color={row.estadoColor} size="sm" variant="soft">
                            <Chip.Label>{row.estadoLabel}</Chip.Label>
                          </Chip>
                        </Table.Cell>
                      </Table.Row>
                    ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}

      <Pagination aria-label="History pagination" className="flex flex-col items-center gap-2">
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous isDisabled={page <= 1} onPress={() => onPageChange(page - 1)}>
              Previous
            </Pagination.Previous>
          </Pagination.Item>
          {pageItems.map((item, index) =>
            item === 'ellipsis' ? (
              <Pagination.Item key={`ellipsis-after-${String(pageItems[index - 1] ?? 'start')}`}>
                <Pagination.Ellipsis />
              </Pagination.Item>
            ) : (
              <Pagination.Item key={item}>
                <Pagination.Link
                  aria-label={`Page ${item}`}
                  isActive={item === page}
                  onPress={() => onPageChange(item)}
                >
                  {item}
                </Pagination.Link>
              </Pagination.Item>
            ),
          )}
          <Pagination.Item>
            <Pagination.Next isDisabled={page >= totalPages} onPress={() => onPageChange(page + 1)}>
              Next
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
        <Pagination.Summary>
          Page {page} of {totalPages}
        </Pagination.Summary>
      </Pagination>
    </div>
  );
}
