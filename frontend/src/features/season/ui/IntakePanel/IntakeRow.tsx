import { Button, Chip } from '@heroui/react';
import { formatCandidateOption, getMatchStatusColor, getMatchStatusLabel, isCreatableRow } from './intake-panel.helpers';
import { IntakeRowActions } from './IntakeRowActions';
import { IntakeRowMetadata } from './IntakeRowMetadata';
import { LabeledCheckbox } from '../../../../shared/ui/LabeledCheckbox';
import type { IntakeRowProps } from './intake-panel.types';

/**
 * IntakeRow renders one editable intake row in List mode: its create checkbox,
 * match-status chip, availability hint, the trailing action cluster, the
 * candidate picker for unresolved matches, and the row's own MyAnimeList lookup
 * with whatever it attached. Purely presentational -- all selection, lookup and
 * I/O callbacks come from the parent panel.
 */
export function IntakeRow({
  row,
  readOnly,
  isSelected,
  folderOverride,
  folderPreview,
  appliedMetadata,
  metadataLookupSource,
  onMetadataApplied,
  onMetadataUndo,
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
            {row.availableEpisodes} episode{row.availableEpisodes === 1 ? '' : 's'} available
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
        {/* The lookup lives on the row itself, brought in by the panel: no other
            row's name can reach it, and only a confirmed candidate is fetched.
            What it attached stays here for the session only. */}
        <IntakeRowMetadata
          rawName={row.rawName}
          readOnly={readOnly}
          appliedMetadata={appliedMetadata}
          metadataLookupSource={metadataLookupSource}
          onMetadataApplied={onMetadataApplied}
          onMetadataUndo={onMetadataUndo}
        />
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
