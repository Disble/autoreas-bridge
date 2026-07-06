import { Alert, Button, Card, Chip } from '@heroui/react';
import { DAILY_BOARD_EMPTY_MESSAGE, SEASON_SECTIONS } from './daily-board.constants';
import { useDailyBoard } from './use-daily-board';

/**
 * DailyBoard is the "Daily Board" workspace section: it shows season animes
 * grouped by what to do today, lets the user stage created animes across the
 * Estrenos sections, and re-checks chapter-1 availability on demand. All Wails
 * I/O and state live in the colocated `useDailyBoard` hook.
 */
export function DailyBoard() {
  const { groups, errorMessage, onMove, onRecheck } = useDailyBoard();
  const isEmpty = groups.created.length === 0 && groups.waiting.length === 0 && groups.other.length === 0;

  const sections = [
    { title: 'Available today', color: 'success' as const, rows: groups.created, movable: true },
    { title: 'Waiting for chapter 1', color: 'warning' as const, rows: groups.waiting, movable: false },
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

      <div className="flex items-center gap-3">
        <Button variant="primary" onPress={onRecheck}>
          Re-check now
        </Button>
        <span className="text-sm text-muted">
          {groups.created.length} available · {groups.waiting.length} waiting
        </span>
      </div>

      {isEmpty ? (
        <p className="text-sm text-muted">{DAILY_BOARD_EMPTY_MESSAGE}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {sections.map(
            (group) =>
              group.rows.length > 0 && (
                <div key={group.title} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">{group.title}</h3>
                    <Chip color={group.color} size="sm" variant="soft">
                      {group.rows.length}
                    </Chip>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {group.rows.map((row) => (
                      <li key={row.id}>
                        <Card>
                          <Card.Content>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="font-medium text-foreground">{row.rawName}</span>
                              {group.movable && row.animeId !== '' && (
                                <div className="ml-auto flex flex-wrap gap-2">
                                  {SEASON_SECTIONS.map((section) => (
                                    <Button
                                      key={section}
                                      size="sm"
                                      variant="tertiary"
                                      onPress={() => onMove(row.animeId, section)}
                                    >
                                      {section}
                                    </Button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </Card.Content>
                        </Card>
                      </li>
                    ))}
                  </ul>
                </div>
              ),
          )}
          {groups.other.length > 0 && (
            <p className="text-sm text-muted">{groups.other.length} not yet available (unmatched or discarded).</p>
          )}
        </div>
      )}
    </section>
  );
}
