import { Alert, Button, Card, Chip } from '@heroui/react';
import { LabeledCheckbox } from '../../../../shared/ui/LabeledCheckbox';
import { DAILY_BOARD_EMPTY_MESSAGE } from './daily-board.constants';
import { useDailyBoard } from './use-daily-board';

/**
 * DailyBoard is the conveyor: created animes grouped by section. Pick from the
 * Sin ver pool which to watch today → Ver hoy (auto-downloads); Ver hoy drains
 * automatically as chapters are watched; Visto flows on to evaluation. All Wails
 * I/O and state live in the colocated `useDailyBoard` hook.
 */
export function DailyBoard() {
  const { readOnly, sections, selected, toggleSelect, onSendToVerHoy, downloadNotice, onDownloadNow, onDismissNotice, onRecheck, errorMessage } =
    useDailyBoard();
  const isEmpty = sections.sinVer.length === 0 && sections.verHoy.length === 0 && sections.visto.length === 0;

  const readonlyGroups = [
    { key: 'verHoy', title: 'Ver hoy — watching (drains as you watch)', color: 'accent' as const, rows: sections.verHoy },
    { key: 'visto', title: 'Visto — watched, ready for evaluation', color: 'success' as const, rows: sections.visto },
  ];

  return (
    <section className="flex flex-col gap-4">
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {downloadNotice !== null && (
        <Alert status="warning">
          <Alert.Content>
            <Alert.Description>
              Sent to Ver hoy after today&apos;s {downloadNotice.downloadTime || 'scheduled'} auto-download. Download now
              so you have episodes to watch today.
            </Alert.Description>
          </Alert.Content>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="primary" onPress={onDownloadNow}>
              Download now
            </Button>
            <Button size="sm" variant="tertiary" onPress={onDismissNotice}>
              Dismiss
            </Button>
          </div>
        </Alert>
      )}

      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button variant="tertiary" onPress={onRecheck}>
            Re-check now
          </Button>
        </div>
      )}

      {isEmpty ? (
        <p className="text-sm text-muted">{DAILY_BOARD_EMPTY_MESSAGE}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <Card>
            <Card.Header>
              <Card.Title>Sin ver — pick what you watch today</Card.Title>
              <Card.Description>
                Sent animes download at the daily scheduled time — or manually if that window has already passed.
              </Card.Description>
            </Card.Header>
            <Card.Content>
              {sections.sinVer.length === 0 ? (
                <p className="text-sm text-muted">Nothing left to schedule.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {sections.sinVer.map((row) => (
                    <li key={row.id}>
                      {readOnly ? (
                        <span className="text-sm text-foreground">{row.rawName}</span>
                      ) : (
                        <LabeledCheckbox
                          isSelected={selected.has(row.animeId)}
                          onChange={() => toggleSelect(row.animeId)}
                        >
                          {row.rawName}
                        </LabeledCheckbox>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!readOnly && (
                <div className="mt-3 flex items-center gap-3">
                  <Button isDisabled={selected.size === 0} variant="primary" onPress={onSendToVerHoy}>
                    Send to Ver hoy
                  </Button>
                  <span className="text-sm text-muted">{selected.size} selected for today</span>
                </div>
              )}
            </Card.Content>
          </Card>

          {readonlyGroups.map(
            (group) =>
              group.rows.length > 0 && (
                <div key={group.key} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                    <Chip color={group.color} size="sm" variant="soft">
                      {group.rows.length}
                    </Chip>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {group.rows.map((row) => (
                      <li key={row.id} className="text-sm text-foreground">
                        {row.rawName}
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
        </div>
      )}
    </section>
  );
}
