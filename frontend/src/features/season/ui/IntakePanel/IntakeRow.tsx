import { Button, Chip } from '@heroui/react';
import { formatCandidateOption, getMatchStatusColor, getMatchStatusLabel, isCreatableRow } from './intake-panel.helpers';
import { IntakeRowActions } from './IntakeRowActions';
import { IntakeRowHints } from './IntakeRowHints';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import { LabeledCheckbox } from '../../../../shared/ui/LabeledCheckbox';
import type { IntakeRowProps } from './intake-panel.types';

/**
 * IntakeRow renders one editable intake row in List mode: the create checkbox
 * leading the row (named by the visible anime name through `aria-labelledby`),
 * the cover a lookup attached, the name with the muted summary line under it,
 * a match-status chip only while the match needs attention, the trailing
 * action group, and the candidate picker for unresolved matches. Purely
 * presentational -- all selection, lookup and I/O callbacks come from the
 * parent panel, and the action group receives them as they arrive.
 */
export function IntakeRow(props: Readonly<IntakeRowProps>) {
  const { row, readOnly, heldMetadata } = props;
  const creatable = isCreatableRow(row);
  const nameId = `intake-row-name-${row.id}`;

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 border-b border-divider py-2">
        <LabeledCheckbox
          aria-labelledby={nameId}
          isDisabled={!creatable || readOnly}
          isSelected={props.isSelected}
          onChange={props.onToggleSelect}
        >
          {null}
        </LabeledCheckbox>
        <SeasonCoverThumb coverSrc={heldMetadata?.coverURL} isLoading={false} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-foreground" id={nameId}>{row.rawName}</span>
          <IntakeRowHints creatable={creatable} heldMetadata={heldMetadata} row={row} />
        </div>
        {row.matchStatus === 'matched' ? null : (
          <Chip color={getMatchStatusColor(row.matchStatus)} size="sm" variant="soft">
            {getMatchStatusLabel(row.matchStatus)}
          </Chip>
        )}
        <IntakeRowActions {...props} creatable={creatable} />
        {!readOnly && row.candidates.length > 0 && row.matchStatus !== 'matched' && (
          <div className="flex w-full flex-wrap gap-2">
            {row.candidates.map((candidate) => (
              <Button key={candidate.pageUrl} size="sm" variant="tertiary" onPress={() => props.onResolve(candidate.pageUrl)}>
                {formatCandidateOption(candidate)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
