import { Button, Modal, Typography } from '@heroui/react';
import { GRADE_OPTIONS } from './rate-anime-modal.constants';
import { formatGradeLabel, getGradeSourceNote } from './rate-anime-modal.helpers';
import type { RateAnimeModalProps } from './rate-anime-modal.types';
import { useRateAnimeModal } from './use-rate-anime-modal';

/**
 * RateAnimeModal is the shared grade-capture modal: a trigger showing the current
 * grade opens a dialog with a 1–6 picker. Picking a grade records it manually.
 * Two entry points reuse it (the Chapters card and the Evaluation panel). All
 * Wails I/O and state live in the colocated `useRateAnimeModal` hook.
 */
export function RateAnimeModal({ animeId, rawName, currentGrade, gradeSource }: Readonly<RateAnimeModalProps>) {
  const { onSelectGrade } = useRateAnimeModal(animeId);
  const sourceNote = getGradeSourceNote(gradeSource);

  return (
    <Modal>
      <Button aria-label={`Rate ${rawName}`} className="hover:text-accent" size="sm" variant="tertiary">
        {currentGrade >= 1 ? `Grade ${formatGradeLabel(currentGrade)}` : 'Rate'}
      </Button>
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[420px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Rate first episode</Modal.Heading>
              <Typography type="body-sm" color="muted">
                {rawName}
              </Typography>
            </Modal.Header>
            <Modal.Body>
              <div aria-label={`Grade for ${rawName}`} className="grid grid-cols-6 gap-2" role="radiogroup">
                {GRADE_OPTIONS.map((grade) => (
                  <Button
                    key={grade}
                    aria-label={`Grade ${grade}`}
                    variant={currentGrade === grade ? 'primary' : 'tertiary'}
                    onPress={() => onSelectGrade(grade)}
                  >
                    {grade}
                  </Button>
                ))}
              </div>
              {sourceNote !== '' && (
                <Typography className="mt-2" color="muted" type="body-sm">
                  {sourceNote}
                </Typography>
              )}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
