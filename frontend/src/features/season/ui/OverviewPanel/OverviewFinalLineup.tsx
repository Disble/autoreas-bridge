import { Alert, Card, Chip, Typography } from '@heroui/react';
import todayAirisArtwork from '../../../../assets/airis-empty-states/today.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { LoadingBars } from '../../../../shared/ui/LoadingBars/LoadingBars';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import { OVERVIEW_LINEUP_COPY, OVERVIEW_LINEUP_LOADING_LABEL } from './overview-panel.constants';
import { useOverviewLineup } from './use-overview-lineup';

/**
 * OverviewFinalLineup is a closed season's final lineup: the weekday schedule
 * its ordering board RECORDED at close, with each anime's cover, stored name and
 * season-owned grade. It never reads the live schedule. Loading, failure, the
 * not-recorded season and an empty record are exclusive states that replace
 * the lineup.
 */
export function OverviewFinalLineup() {
  const { view, getCoverThumb } = useOverviewLineup();

  return (
    <Card>
      <Card.Header>
        <Card.Title>{OVERVIEW_LINEUP_COPY.title}</Card.Title>
      </Card.Header>
      <Card.Content>
        {view.display === 'loading' ? <LoadingBars barClassName="h-11 w-full rounded-lg" count={3} label={OVERVIEW_LINEUP_LOADING_LABEL} /> : null}

        {view.display === 'failed' ? (
          <Alert status="danger">
            <Alert.Content>
              <Alert.Description>{view.errorMessage}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {view.display === 'unrecorded' ? (
          <AirisEmptyState
            description={OVERVIEW_LINEUP_COPY.notRecordedDescription}
            imageSrc={todayAirisArtwork}
            size="row"
            title={OVERVIEW_LINEUP_COPY.notRecordedTitle}
          />
        ) : null}

        {view.display === 'empty' ? (
          <AirisEmptyState
            description={OVERVIEW_LINEUP_COPY.emptyDescription}
            imageSrc={todayAirisArtwork}
            size="row"
            title={OVERVIEW_LINEUP_COPY.emptyTitle}
          />
        ) : null}

        {view.display === 'lineup' ? (
          <section aria-label={OVERVIEW_LINEUP_COPY.regionLabel} className="flex flex-col gap-3">
            <Typography color="muted" type="body-sm">
              {view.summary}
            </Typography>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {view.days.map((day) => (
                <div key={day.day} className="flex min-w-0 flex-col gap-2">
                  <p className="text-xs font-semibold text-muted" id={`overview-lineup-${day.day}`}>
                    {day.day}
                  </p>
                  <ul aria-labelledby={`overview-lineup-${day.day}`} className="flex flex-col gap-2">
                    {day.items.map((item) => (
                      <li key={item.key} className="flex min-w-0 items-center gap-3">
                        <SeasonCoverThumb {...getCoverThumb(item.animeId)} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={item.name}>
                          {item.name}
                        </span>
                        {item.grade === null ? (
                          <span className="w-8 shrink-0 text-center text-xs text-muted">
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">{OVERVIEW_LINEUP_COPY.noGradeLabel}</span>
                          </span>
                        ) : (
                          <Chip aria-label={`Approval grade ${item.grade}`} className="w-8 shrink-0 justify-center" size="sm" variant="soft">
                            {item.grade}
                          </Chip>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </Card.Content>
    </Card>
  );
}
