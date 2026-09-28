import { Alert } from '@heroui/react';
import todayAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { LoadingBars } from '../../../../shared/ui/LoadingBars/LoadingBars';
import {
  ORDERING_BOARD_LOADING_LABEL,
  ORDERING_NOT_RECORDED_DESCRIPTION,
  ORDERING_NOT_RECORDED_TITLE,
} from './ordering-board.constants';

/** Props for the exclusive states that replace a past season's board. */
export interface OrderingHistoryStatesProps {
  /** True while the stored board is still being read. */
  readonly isHistoricalLoading: boolean;
  /** Whether the season stored a board; only meaningful once the read settled. */
  readonly historicalRecorded: boolean;
  /** Failure message when the stored board could not be read at all. */
  readonly historicalError?: string;
}

/**
 * OrderingHistoryStates renders the three exclusive outcomes that REPLACE a past
 * season's board: the read in flight, the read that failed, and the season that stored
 * no board. A failed read keeps the alert in charge even if a recorded flag arrives
 * beside the error, and no outcome here ever renders an empty rail and grid as if they
 * were the record.
 */
export function OrderingHistoryStates({ isHistoricalLoading, historicalRecorded, historicalError }: Readonly<OrderingHistoryStatesProps>) {
  return (
    <>
      {historicalError !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{historicalError}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {isHistoricalLoading ? (
        <LoadingBars barClassName="h-24 w-full rounded-lg" count={2} label={ORDERING_BOARD_LOADING_LABEL} />
      ) : null}

      {!isHistoricalLoading && historicalError === undefined && !historicalRecorded ? (
        <AirisEmptyState
          description={ORDERING_NOT_RECORDED_DESCRIPTION}
          imageSrc={todayAirisArtwork}
          title={ORDERING_NOT_RECORDED_TITLE}
        />
      ) : null}
    </>
  );
}
