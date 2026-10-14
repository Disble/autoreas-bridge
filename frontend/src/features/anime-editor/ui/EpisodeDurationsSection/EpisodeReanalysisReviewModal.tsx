import { Alert, Button, Chip, Modal, Table, Typography } from '@heroui/react';
import { EPISODE_REANALYZE_LABEL } from './episode-durations-section.constants';
import type { EpisodeDurationsDialogsProps } from './episode-durations-section.types';

/**
 * Renders the re-analysis review (guide section 4): the folder, a status alert,
 * the summary chips, the Episode | Current | Measured now | Result table, and
 * the actions the outcome allows. Confirming moves the changes into the draft;
 * nothing is saved until the Editor's Save.
 */
export function EpisodeReanalysisReviewModal({ viewModel }: Readonly<EpisodeDurationsDialogsProps>) {
  const review = viewModel.review;
  return (
    <Modal isOpen={review !== undefined} onOpenChange={viewModel.onCloseReview}>
      <Modal.Backdrop variant="blur"><Modal.Container><Modal.Dialog className="sm:max-w-2xl">
        <Modal.CloseTrigger />
        <Modal.Header>
          <Modal.Heading>{EPISODE_REANALYZE_LABEL}</Modal.Heading>
          <Typography className="break-all font-mono" color="muted" type="body-xs">{review?.folder}</Typography>
        </Modal.Header>
        <Modal.Body className="flex flex-col gap-3">
          {review === undefined ? null : (
            <Alert status={review.alertStatus}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{review.title}</Alert.Title>
                <Alert.Description>{review.description}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {review === undefined || review.chips.length === 0 ? null : (
            <div className="flex flex-wrap gap-1.5" data-testid="episode-review-chips">
              {review.chips.map((chip) => <Chip color={chip.color} key={chip.id} size="sm" variant="soft">{chip.label}</Chip>)}
            </div>
          )}
          {review === undefined || review.rows.length === 0 ? null : (
            <div className="max-h-[22rem] min-w-0 overflow-y-auto" data-testid="episode-review-scroll" ref={viewModel.reviewWindow.scrollRef} onScroll={viewModel.reviewWindow.onScroll}>
              <Table aria-label="Re-analysis review" variant="secondary">
                <Table.ScrollContainer>
                  <Table.Content aria-label="Re-analysis review" className="w-full table-fixed">
                    <Table.Header>
                      <Table.Column className="w-[88px]" isRowHeader>Episode</Table.Column>
                      <Table.Column>Current</Table.Column>
                      <Table.Column>Measured now</Table.Column>
                      <Table.Column className="w-[132px]">Result</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {viewModel.visibleReviewRows.map((row) => (
                        <Table.Row data-testid="episode-review-row" id={row.id} key={row.id}>
                          <Table.Cell><span className="font-mono text-[13px]">{row.number}</span></Table.Cell>
                          <Table.Cell><span className="block truncate text-muted">{row.current}</span></Table.Cell>
                          <Table.Cell><span className="block truncate">{row.measured}</span></Table.Cell>
                          <Table.Cell><Chip color={row.result.color} size="sm" variant="soft">{row.result.label}</Chip></Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant={review?.dismissVariant} onPress={viewModel.onCloseReview}>{review?.dismissLabel}</Button>
          {review?.canTryAgain === true ? <Button variant="secondary" onPress={() => void viewModel.onReanalyze()}>Try again</Button> : null}
          {review?.confirmLabel === undefined ? null : <Button variant="primary" onPress={viewModel.onConfirmReview}>{review.confirmLabel}</Button>}
        </Modal.Footer>
      </Modal.Dialog></Modal.Container></Modal.Backdrop>
    </Modal>
  );
}
