import { useEffect, useRef, useState } from 'react';
import { Card, Chip, ScrollShadow, Separator } from '@heroui/react';
import { GetRecentLogs } from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';

export type ObservabilityLogEntry = {
    timestamp: string;
    domain: string;
    level?: string;
    message: string;
};

const MAX_LOG_ENTRIES = 200;
const OBSERVABILITY_EVENT_NAME = 'observability.log';

function keepRecent(entries: ObservabilityLogEntry[]): ObservabilityLogEntry[] {
    return entries.slice(-MAX_LOG_ENTRIES);
}

function levelColor(level?: string): 'default' | 'success' | 'warning' | 'danger' {
    switch ((level ?? '').toLowerCase()) {
        case 'info':
            return 'success';
        case 'warn':
            return 'warning';
        case 'error':
            return 'danger';
        default:
            return 'default';
    }
}

export function ObservabilityPanel() {
    const [entries, setEntries] = useState<ObservabilityLogEntry[]>([]);
    const scrollRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let active = true;
        const stop = EventsOn(OBSERVABILITY_EVENT_NAME, (entry: ObservabilityLogEntry) => {
            setEntries((current) => keepRecent([...current, entry]));
        });

        GetRecentLogs().then((recent) => {
            if (!active) return;
            setEntries(keepRecent(recent));
        });

        return () => {
            active = false;
            stop?.();
        };
    }, []);

    useEffect(() => {
        if (entries.length === 0) return;
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries.length]);

    const renderedEntries = keepRecent(entries);

    return (
        <Card className="w-full">
            <Card.Header>
                <Card.Title>Observability</Card.Title>
                <Card.Description>Bridge runtime log feed</Card.Description>
            </Card.Header>
            <Card.Content className="p-0">
                <ScrollShadow className="max-h-80 px-4 pb-4" hideScrollBar>
                    <div ref={scrollRef} className="flex flex-col gap-2 overflow-y-auto max-h-80">
                        {renderedEntries.length === 0 ? (
                            <div className="py-4 text-center">
                                <Chip color="default" variant="soft">No logs yet</Chip>
                            </div>
                        ) : (
                            renderedEntries.map((entry, index) => (
                                <div key={`${entry.timestamp}-${entry.domain}-${index}`}>
                                    <div className="flex flex-wrap items-center gap-2 py-1">
                                        <Chip color="default" variant="tertiary" size="sm">
                                            {entry.timestamp}
                                        </Chip>
                                        <Chip color="default" variant="secondary" size="sm">
                                            {entry.domain}
                                        </Chip>
                                        {entry.level ? (
                                            <Chip color={levelColor(entry.level)} variant="soft" size="sm">
                                                {entry.level}
                                            </Chip>
                                        ) : null}
                                        <span className="text-sm text-foreground">{entry.message}</span>
                                    </div>
                                    {index < renderedEntries.length - 1 ? <Separator /> : null}
                                </div>
                            ))
                        )}
                    </div>
                </ScrollShadow>
            </Card.Content>
        </Card>
    );
}

export { MAX_LOG_ENTRIES, OBSERVABILITY_EVENT_NAME, keepRecent };
