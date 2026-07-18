import { Button, Chip } from '@heroui/react';
import { LabeledCheckbox } from '../../../../shared/ui/LabeledCheckbox';
import { IntakeRowActions } from './IntakeRowActions';
import { formatCandidateOption, getMatchStatusColor, getMatchStatusLabel, isCreatableRow } from './intake-panel.helpers';
import type { IntakeRowProps } from './intake-panel.types';

/**
 * IntakeRow renders one editable intake row in List mode: its create checkbox,
 * match-status chip, availability hint, the trailing action cluster, and the
 * candidate picker for unresolved matches. Purely presentational — all
 * selection and I/O callbacks come from the parent panel.
 */
export function IntakeRow({
  row,
  readOnly,
  isSelected,
  folderOverride,
  folderPreview,
  onToggleSelect,
  onPickFolder,
  onDiscard,
  onResolve,
  onOpenPage,
}: Readonly<IntakeRowProps>) {
  const creatable = isCreatableRow(row);

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider py-2">
        <LabeledCheckbox isDisabled={!creatable || readOnly} isSelected={isSelected} onChange={onToggleSelect}>
          <span className="font-medium text-foreground">{row.rawName}</span>
        </LabeledCheckbox>
        <Chip color={getMatchStatusColor(row.matchStatus)} size="sm" variant="soft">
          {getMatchStatusLabel(row.matchStatus)}
        </Chip>
        {creatable && (
          <span className="text-xs text-success">
            {row.availableChapters} chapter{row.availableChapters === 1 ? '' : 's'} available
          </span>
        )}
        <IntakeRowActions
          creatable={creatable}
          folderOverride={folderOverride}
          folderPreview={folderPreview}
          readOnly={readOnly}
          row={row}
          onDiscard={onDiscard}
          onOpenPage={onOpenPage}
          onPickFolder={onPickFolder}
        />
        {creatable && folderOverride !== undefined && (
          <span className="w-full break-all text-xs text-success">Folder: {folderOverride}</span>
        )}
        {!readOnly && row.candidates.length > 0 && row.matchStatus !== 'matched' && (
          <div className="flex w-full flex-wrap gap-2">
            {row.candidates.map((candidate) => (
              <Button key={candidate.pageUrl} size="sm" variant="tertiary" onPress={() => onResolve(candidate.pageUrl)}>
                {formatCandidateOption(candidate)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
