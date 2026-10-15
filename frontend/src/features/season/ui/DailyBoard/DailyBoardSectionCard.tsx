import { Card, Chip } from '@heroui/react';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import type { DailyBoardSectionCardProps } from './daily-board.types';

/**
 * The one card pattern every conveyor section (Sin ver, Ver hoy, Visto) uses:
 * a header with the title, the row count chip and a description, then the
 * section's rows, or its compact empty state when it has none, then an
 * optional footer.
 */
export function DailyBoardSectionCard({ copy, count, countColor, children, footer }: Readonly<DailyBoardSectionCardProps>) {
  return (
    <Card>
      <Card.Header>
        <div className="flex items-center gap-2">
          <Card.Title>{copy.title}</Card.Title>
          <Chip color={countColor} size="sm" variant="soft">
            {count}
          </Chip>
        </div>
        <Card.Description>{copy.description}</Card.Description>
      </Card.Header>
      <Card.Content>
        {count === 0 ? <AirisEmptyState description={copy.emptyDescription} kind="caught-up" size="row" title={copy.emptyTitle} /> : children}
        {footer}
      </Card.Content>
    </Card>
  );
}
