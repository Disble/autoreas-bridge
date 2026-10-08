import { Label, ListBox, Select } from '@heroui/react';
import { AnimeDesktopActions } from '../../../../shared/ui/AnimeDesktopActions';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import { CONSIDERATION_OPTIONS } from './selection-board.constants';
import { formatSelectionGrade, getConsiderationLabel, toConsiderationToken } from './selection-board.helpers';
import type { SelectionCandidateRowProps } from './selection-board.types';

/**
 * One candidate of the selection list: cover, name (truncated, the full name as
 * its tooltip), the consideration select (plain text on a closed season), the
 * page and folder desktop actions, and the grade in a fixed-width slot. Every
 * control stays visible; nothing waits for hover.
 */
export function SelectionCandidateRow({
  row,
  readOnly,
  coverThumb,
  onSetConsideration,
  onOpenPage,
  onCopyPage,
  onOpenFolder,
  onCopyFolder,
}: Readonly<SelectionCandidateRowProps>) {
  return (
    <li className="flex min-h-13 items-center gap-3 px-1 py-2">
      <SeasonCoverThumb {...coverThumb} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={row.rawName}>
        {row.rawName}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {readOnly ? (
          <span className="w-52 text-sm text-foreground">{getConsiderationLabel(row.consideration)}</span>
        ) : (
          <Select
            aria-label={`Consideration for ${row.rawName}`}
            className="w-52"
            value={row.consideration}
            onChange={(value) => onSetConsideration(row.id, toConsiderationToken(value))}
          >
            <Label className="sr-only">Consideration</Label>
            <Select.Trigger>
              <Select.Value>{getConsiderationLabel(row.consideration)}</Select.Value>
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {CONSIDERATION_OPTIONS.map((option) => (
                  <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                    {option.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        )}
        <div className="flex w-18 items-center gap-2">
          <AnimeDesktopActions
            animeId={row.animeId}
            name={row.rawName}
            hasPage={row.hasPage}
            hasFolder={row.hasFolder}
            pageUrl={row.pageUrl}
            folderPath={row.folderPath}
            onOpenPage={onOpenPage}
            onCopyPage={onCopyPage}
            onOpenFolder={onOpenFolder}
            onCopyFolder={onCopyFolder}
          />
        </div>
      </div>
      <span className="w-7 shrink-0 text-right text-sm font-semibold text-foreground" data-testid="selection-grade">
        {formatSelectionGrade(row.grade)}
      </span>
    </li>
  );
}
