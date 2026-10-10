import { Label, TextArea, TextField } from '@heroui/react';
import seasonAirisArtwork from '../../../../assets/airis-empty-states/season.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { IntakeRow } from './IntakeRow';
import {
  INTAKE_EMPTY_ACTION_LABEL,
  INTAKE_EMPTY_DESCRIPTION,
  INTAKE_EMPTY_TITLE,
  INTAKE_PASTE_PLACEHOLDER,
} from './intake-panel.constants';
import type { IntakePanelBodyProps } from './intake-panel.types';

/**
 * IntakePanelBody is the intake card's content switch: the raw-names textarea in
 * Raw mode, the Airis empty state when List mode has no rows and no error, and
 * otherwise the editable row list. Presentation only; `IntakePanel` passes the
 * hook's state down.
 */
export function IntakePanelBody(props: Readonly<IntakePanelBodyProps>) {
  const { mode, rawDraft, editableRows, errorMessage, selected, switchMode } = props;

  if (mode === 'raw') {
    return (
      <TextField value={rawDraft} onChange={props.onRawChange}>
        <Label className="sr-only">Intake names</Label>
        <TextArea className="border border-dashed border-muted" placeholder={INTAKE_PASTE_PLACEHOLDER} rows={8} />
      </TextField>
    );
  }

  if (editableRows.length === 0 && errorMessage === undefined) {
    return (
      <AirisEmptyState
        action={{ label: INTAKE_EMPTY_ACTION_LABEL, onPress: () => switchMode('raw') }}
        description={INTAKE_EMPTY_DESCRIPTION}
        imageSrc={seasonAirisArtwork}
        title={INTAKE_EMPTY_TITLE}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {editableRows.map((row) => (
        <IntakeRow
          key={row.id}
          appliedMetadata={props.appliedMetadataByRow[row.id]}
          heldMetadata={props.metadataByRow[row.id]}
          folderOverride={props.folderOverrides[row.id]}
          folderPreview={props.folderPreviews[row.id]}
          isSelected={selected.has(row.id)}
          metadataLookupSource={props.metadataLookupSource}
          readOnly={props.readOnly}
          row={row}
          onDiscard={() => props.onDiscard(row.id)}
          onMetadataApplied={(selection) => props.onMetadataApplied(row.id, selection)}
          onMetadataUndo={() => props.onMetadataUndo(row.id)}
          onMetadataClear={() => props.onMetadataClear(row.id)}
          onOpenPage={props.onOpenPage}
          onPickFolder={() => props.onPickFolder(row.id)}
          onResolve={(pageUrl) => props.onResolve(row.id, pageUrl)}
          onToggleSelect={() => props.toggleSelect(row.id)}
        />
      ))}
    </ul>
  );
}
