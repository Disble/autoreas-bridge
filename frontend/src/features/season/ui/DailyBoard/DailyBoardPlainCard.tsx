import { Card } from '@heroui/react';
import todayAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { DAILY_BOARD_PLAIN_COPY, DAILY_BOARD_PLAIN_LIST_LABEL, VISTO_LIST_CLASS } from './daily-board.constants';
import { listRowWithoutChip } from './daily-board.helpers';
import type { DailyBoardPlainCardProps } from './daily-board.types';
import { DailyBoardWatchList } from './DailyBoardWatchList';

/**
 * The Daily board of a season that closed before its board was recorded: no
 * section can be claimed, so it is one plain list of the season's animes, cover
 * and name only, with no section, count or chip, and a muted note saying why.
 */
export function DailyBoardPlainCard({ rows, getCoverThumb }: Readonly<DailyBoardPlainCardProps>) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{DAILY_BOARD_PLAIN_COPY.title}</Card.Title>
        <Card.Description>{DAILY_BOARD_PLAIN_COPY.description}</Card.Description>
      </Card.Header>
      <Card.Content>
        {rows.length === 0 ? (
          <AirisEmptyState
            description={DAILY_BOARD_PLAIN_COPY.emptyDescription}
            imageSrc={todayAirisArtwork}
            size="compact"
            title={DAILY_BOARD_PLAIN_COPY.emptyTitle}
          />
        ) : (
          <DailyBoardWatchList
            getCoverThumb={getCoverThumb}
            getRowChip={listRowWithoutChip}
            label={DAILY_BOARD_PLAIN_LIST_LABEL}
            listClassName={VISTO_LIST_CLASS}
            rows={rows}
          />
        )}
      </Card.Content>
    </Card>
  );
}
