import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Chip, ScrollShadow, Separator as Divider } from '@heroui/react';
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
        if (entries.length === 0) {
            return;
        }
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [entries.length]);

    const renderedEntries = keepRecent(entries);

    return (
        <Card>
            <CardHeader>
                <CardTitle>Observability</CardTitle>
            </CardHeader>
            <CardContent>
                <ScrollShadow className="max-h-80" ref={scrollRef}>
                    {renderedEntries.length === 0 ? (
                        <Chip color="default" variant="flat">No logs yet</Chip>
                    ) : (
                        renderedEntries.map((entry, index) => (
                            <Card key={`${entry.timestamp}-${entry.domain}-${index}`} className="mb-2">
                                <CardContent className="gap-2 p-3">
                                    <Chip color="default" variant="flat">{entry.timestamp}</Chip>
                                    <Chip color="default" variant="bordered">{entry.domain}</Chip>
                                    {entry.level ? (
                                        <Chip color={levelColor(entry.level)} variant="flat">{entry.level}</Chip>
                                    ) : null}
                                    <Chip color="default" variant="solid">{entry.message}</Chip>
                                    {index < renderedEntries.length - 1 ? <Divider /> : null}
                                </CardContent>
                            </Card>
                        ))
                    )}
                </ScrollShadow>
            </CardContent>
        </Card>
    );
}

export { MAX_LOG_ENTRIES, OBSERVABILITY_EVENT_NAME, keepRecent };
