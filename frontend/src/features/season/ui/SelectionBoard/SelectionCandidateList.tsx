import { Card } from '@heroui/react';
import { SelectionFilterToolbar } from './SelectionFilterToolbar';
import { SelectionListBody } from './SelectionListBody';
import type { SelectionCandidateListProps } from './selection-board.types';

/**
 * SelectionCandidateList is the candidate card: the filter toolbar and the list
 * body it narrows. It is presentational and owns no state: the board passes the
 * two prop groups it already derives, and the body decides between the visible
 * groups and the filtered empty state.
 */
export function SelectionCandidateList({ toolbar, body }: Readonly<SelectionCandidateListProps>) {
  return (
    <Card aria-label="Selection candidates" role="region">
      <Card.Content className="flex flex-col gap-3">
        <SelectionFilterToolbar {...toolbar} />
        <SelectionListBody {...body} />
      </Card.Content>
    </Card>
  );
}
