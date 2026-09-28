import { Alert, Button } from '@heroui/react';
import { ORDERING_PAST_SEASON_NOTICE } from './ordering-board.constants';

/** Props for the read-only notice shown while the ordering board cannot be edited. */
export interface OrderingReadOnlyNoticeProps {
  /** True while a closed season is open: the notice then describes the stored board. */
  readonly isPastSeason: boolean;
  /** How many animes the applied schedule placed, for the applied-season summary. */
  readonly scheduledCount: number;
  readonly onReopen: () => Promise<void>;
  readonly onCloseSeason: () => void;
}

/**
 * OrderingReadOnlyNotice explains why the board is read-only and, for an applied open
 * season, offers the two ways out (reopen for corrections, or close the season). A past
 * season gets no controls and never claims the board reflects the live schedule.
 */
export function OrderingReadOnlyNotice({
  isPastSeason,
  scheduledCount,
  onReopen,
  onCloseSeason,
}: Readonly<OrderingReadOnlyNoticeProps>) {
  return (
    <Alert status={isPastSeason ? 'warning' : 'success'}>
      <Alert.Content>
        <Alert.Description>
          {isPastSeason
            ? ORDERING_PAST_SEASON_NOTICE
            : `Schedule applied — ${scheduledCount} animes scheduled. Close the season to turn season mode off (the registry stays queryable), or reopen ordering to make corrections.`}
        </Alert.Description>
      </Alert.Content>
      {!isPastSeason && (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onPress={() => void onReopen()}>
            Reopen ordering
          </Button>
          <Button size="sm" variant="primary" onPress={onCloseSeason}>
            Close season
          </Button>
        </div>
      )}
    </Alert>
  );
}
