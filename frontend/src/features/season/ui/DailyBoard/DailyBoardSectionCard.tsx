import { Card, Chip } from '@heroui/react';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import type { DailyBoardSectionCardProps } from './daily-board.types';

/**
 * The one card pattern every conveyor section (Sin ver, Ver hoy, Visto) uses:
 * a header with the title, the row count chip and an optional trailing
 * element, then the
 * section's rows, or its compact empty state when it has none, then an
 * optional footer.
 */
export function DailyBoardSectionCard({ copy, count, countColor, headerEnd, children, footer }: Readonly<DailyBoardSectionCardProps>) {
  return (
    <Card>
      <Card.Header className="flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Card.Title>{copy.title}</Card.Title>
          <Chip color={countColor} size="sm" variant="soft">
            {count}
          </Chip>
        </div>
        {headerEnd}
      </Card.Header>
      <Card.Content>
        {count === 0 ? <AirisEmptyState description={copy.emptyDescription} kind="caught-up" size="row" title={copy.emptyTitle} /> : children}
        {footer}
      </Card.Content>
    </Card>
  );
}
