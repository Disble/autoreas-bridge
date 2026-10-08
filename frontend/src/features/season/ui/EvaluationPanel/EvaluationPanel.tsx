import { Alert, Button, Card, Chip } from '@heroui/react';
import { RateAnimeModal } from '../RateAnimeModal/RateAnimeModal';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import { EVALUATION_EMPTY_MESSAGE } from './evaluation-panel.constants';
import { useEvaluationPanel } from './use-evaluation-panel';

/**
 * EvaluationPanel is the grading progress/audit view: created candidates with
 * their cover, grade chip, and capture source and date, ungraded first. An
 * ungraded row offers Rate and Skip; a graded or skipped row offers a round
 * star that reopens the same rate modal. Grading opens the shared
 * RateAnimeModal (same component the Episodes card uses). All Wails I/O and
 * state live in the colocated `useEvaluationPanel` hook.
 */
export function EvaluationPanel() {
  const { readOnly, items, ungradedCount, errorMessage, onSkip, getCoverThumb } = useEvaluationPanel();

  return (
    <section className="flex flex-col gap-4">
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {ungradedCount > 0 && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>
              {ungradedCount} ungraded — they derive as not approved at selection unless graded or skipped.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-muted">{EVALUATION_EMPTY_MESSAGE}</p>
      ) : (
        <Card>
          <Card.Content>
            <ul aria-label="Candidates" className="flex flex-col divide-y divide-separator">
              {items.map(({ row, isPending, meta, chip }) => (
                <li key={row.id} className="flex min-h-13 items-center gap-3 px-1 py-2">
                  <SeasonCoverThumb {...getCoverThumb(row.animeId)} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-foreground" title={row.rawName}>
                      {row.rawName}
                    </span>
                    <span className="text-xs text-muted">{meta}</span>
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 items-center gap-2">
                      <RateAnimeModal
                        animeId={row.animeId}
                        currentGrade={row.grade}
                        gradeSource={row.gradeSource}
                        rawName={row.rawName}
                        triggerVariant={isPending ? 'rate' : 'icon'}
                      />
                      {isPending && (
                        <Button size="sm" variant="ghost" onPress={() => onSkip(row.id)}>
                          Skip
                        </Button>
                      )}
                    </div>
                  )}
                  <Chip className="w-20 shrink-0 justify-center" color={chip.color} size="sm" variant="soft">
                    {chip.label}
                  </Chip>
                </li>
              ))}
            </ul>
          </Card.Content>
        </Card>
      )}
    </section>
  );
}
