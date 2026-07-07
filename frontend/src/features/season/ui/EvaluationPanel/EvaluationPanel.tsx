import { Alert, Button, Chip } from '@heroui/react';
import { RateAnimeModal } from '../RateAnimeModal/RateAnimeModal';
import { EVALUATION_EMPTY_MESSAGE } from './evaluation-panel.constants';
import { formatRatedAt, getGradeSourceLabel } from './evaluation-panel.helpers';
import { useEvaluationPanel } from './use-evaluation-panel';

/**
 * EvaluationPanel is the grading progress/audit view: created candidates with
 * their grade, capture source, and rated-at, plus a per-row skip. Grading opens
 * the shared RateAnimeModal (same component the Chapters card uses). All Wails
 * I/O and state live in the colocated `useEvaluationPanel` hook.
 */
export function EvaluationPanel() {
  const { rows, ungradedCount, errorMessage, onSkip } = useEvaluationPanel();

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

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{EVALUATION_EMPTY_MESSAGE}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-foreground">{row.rawName}</span>
                <span className="text-xs text-muted">
                  {getGradeSourceLabel(row.gradeSource) !== '' ? `${getGradeSourceLabel(row.gradeSource)} · ` : ''}
                  {formatRatedAt(row.ratedAt)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {row.grade >= 1 ? (
                  <Chip color="success" size="sm" variant="soft">
                    Grade {row.grade}
                  </Chip>
                ) : row.skipGrading ? (
                  <Chip size="sm" variant="soft">
                    Skipped
                  </Chip>
                ) : (
                  <Chip color="warning" size="sm" variant="soft">
                    No grade
                  </Chip>
                )}
                <RateAnimeModal
                  animeId={row.animeId}
                  currentGrade={row.grade}
                  gradeSource={row.gradeSource}
                  rawName={row.rawName}
                />
                <Button isDisabled={row.skipGrading} size="sm" variant="tertiary" onPress={() => onSkip(row.id)}>
                  Skip
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
