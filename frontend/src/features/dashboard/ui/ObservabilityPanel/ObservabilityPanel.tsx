import { Card, Chip, ScrollShadow, Separator } from '@heroui/react';
import { getLogLevelColor } from './observability-panel.helpers';
import { useObservabilityPanel } from './use-observability-panel';

export function ObservabilityPanel() {
  const { entries } = useObservabilityPanel();

  return (
    <Card className="w-full">
      <Card.Header>
        <Card.Title>Observability</Card.Title>
        <Card.Description>Bridge runtime log feed</Card.Description>
      </Card.Header>
      <Card.Content className="p-0">
        <ScrollShadow className="max-h-[32rem] px-4 pb-4 2xl:max-h-[40rem]" hideScrollBar>
          <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto 2xl:max-h-[40rem]">
            {entries.length === 0 ? (
              <div className="py-4 text-center">
                <Chip color="default" variant="soft">No logs yet</Chip>
              </div>
            ) : (
              entries.map((entry, index) => (
                <div key={`${entry.timestamp}-${entry.domain}-${index}`}>
                  <div className="flex flex-wrap items-center gap-2 py-1">
                    <Chip color="default" size="sm" variant="tertiary">{entry.timestamp}</Chip>
                    <Chip color="default" size="sm" variant="secondary">{entry.domain}</Chip>
                    {entry.level ? (
                      <Chip color={getLogLevelColor(entry.level)} size="sm" variant="soft">{entry.level}</Chip>
                    ) : null}
                    <span className="text-sm text-foreground">{entry.message}</span>
                  </div>
                  {index < entries.length - 1 ? <Separator /> : null}
                </div>
              ))
            )}
          </div>
        </ScrollShadow>
      </Card.Content>
    </Card>
  );
}
