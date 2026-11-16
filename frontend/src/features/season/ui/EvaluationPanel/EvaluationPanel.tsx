import { Alert, Button, Card, Chip, Skeleton } from '@heroui/react';
import seasonAirisArtwork from '../../../../assets/airis-empty-states/season.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { RateAnimeModal } from '../RateAnimeModal/RateAnimeModal';
import { SeasonCoverThumb } from '../SeasonCoverThumb/SeasonCoverThumb';
import {
  EVALUATION_EMPTY_ACTION_LABEL,
  EVALUATION_EMPTY_DESCRIPTION,
  EVALUATION_EMPTY_TITLE,
} from './evaluation-panel.constants';
import type { EvaluationPanelProps } from './evaluation-panel.types';
import { useEvaluationPanel } from './use-evaluation-panel';

/**
 * EvaluationPanel is the grading progress/audit view: created candidates with
 * their cover, grade chip, and capture source and date, ungraded first. An
 * ungraded row offers Rate and Skip; a graded or skipped row offers a round
 * star that reopens the same rate modal. Grading opens the shared
 * RateAnimeModal (same component the Episodes card uses). All Wails I/O and
 * state live in the colocated `useEvaluationPanel` hook.
 */
export function EvaluationPanel({ onNavigate }: Readonly<EvaluationPanelProps>) {
  const { readOnly, items, ungradedCount, errorMessage, view, onSkip, getCoverThumb, listWindow } = useEvaluationPanel();

  return (
    <section className="flex flex-col gap-4">
      {view.kind === 'loading' && (
        <Card><Card.Content>
          <div aria-labelledby="evaluation-loading-label" aria-live="polite" role="status">
            <span className="sr-only" id="evaluation-loading-label">Loading evaluation candidates</span>
            <div className="flex min-h-13 items-center gap-3 py-2"><Skeleton className="size-11 rounded-lg" /><Skeleton className="h-4 w-40" /></div>
            <div className="flex min-h-13 items-center gap-3 py-2"><Skeleton className="size-11 rounded-lg" /><Skeleton className="h-4 w-40" /></div>
          </div>
        </Card.Content></Card>
      )}
      {view.kind !== 'loading' && view.kind === 'failure' && errorMessage === undefined && (
        <Alert status="danger"><Alert.Content><Alert.Description>{view.message}</Alert.Description></Alert.Content></Alert>
      )}
      {view.kind !== 'loading' && errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {view.kind !== 'loading' && ungradedCount > 0 && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>
              {ungradedCount} ungraded — they derive as not approved at selection unless graded or skipped.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {view.kind === 'empty' && errorMessage === undefined ? (
        <AirisEmptyState
          action={{ label: EVALUATION_EMPTY_ACTION_LABEL, onPress: () => onNavigate('intake') }}
          description={EVALUATION_EMPTY_DESCRIPTION}
          imageSrc={seasonAirisArtwork}
          kind="waiting-on-step"
          title={EVALUATION_EMPTY_TITLE}
        />
      ) : view.kind !== 'loading' && items.length > 0 ? (
        <Card>
          <Card.Content>
            <div ref={listWindow.scrollRef} className="max-h-[36rem] overflow-y-auto" onScroll={listWindow.onScroll}>
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
            </div>
          </Card.Content>
        </Card>
      ) : null}
    </section>
  );
}
