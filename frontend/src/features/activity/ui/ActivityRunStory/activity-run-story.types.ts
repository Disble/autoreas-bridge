import type { ActivityRunStory } from '../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../activity-source/activity-source.types';

/** The semantic tone of a mark, a chip or a step. */
export type ActivityTone = 'danger' | 'warning' | 'success' | 'default';

/** A read the Activity detail panes render: loading, failed, gone, or resolved. */
export type ActivityRead<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'gone' }
  | { readonly status: 'ready'; readonly value: T };

/** A soft chip with its words and its color. */
export interface ActivityChipModel {
  /** Chip words. */
  readonly label: string;
  /** Semantic color. */
  readonly color: ActivityTone;
}

/** One step of the run story, ready to draw. */
export interface ActivityRunStepModel {
  /** Event row id, stable React key and selection id. */
  readonly id: number;
  /** Local `HH:mm:ss.SSS`. */
  readonly time: string;
  /** The event's message, or its type in words when it has none. */
  readonly title: string;
  /** The event type in words, with its duration when recorded. */
  readonly detail: string;
  /** Emphasis: errors danger, warnings warning, finished steps success. */
  readonly tone: ActivityTone;
}

/** The header and steps of one run story. */
export interface ActivityRunStoryModel {
  /** What ran, from the first step's type. */
  readonly title: string;
  /** The domain the run belongs to, as stored. */
  readonly domain: string;
  /** The result in plain words. */
  readonly outcome: ActivityChipModel;
  /** What started it: the first step's message. */
  readonly trigger: string;
  /** Time span and duration. */
  readonly span: string;
  /** The ordered steps. */
  readonly steps: readonly ActivityRunStepModel[];
  /** A note when Go capped the steps; empty otherwise. */
  readonly truncatedNote: string;
  /** The MCP-ready reference "Copy for AI" copies. */
  readonly copyText: string;
}

/** One labelled field of the recorded detail. A sequence draws probes or retries in order. */
export type ActivityMetadataField =
  | { readonly kind: 'value'; readonly label: string; readonly value: string }
  | { readonly kind: 'sequence'; readonly label: string; readonly items: readonly string[] };

/** The selected step's metadata as labelled fields. */
export interface ActivityMetadataModel {
  /** Labelled fields in recorded order. */
  readonly fields: readonly ActivityMetadataField[];
  /** The raw JSON, pretty when it parses; empty when nothing was recorded. */
  readonly raw: string;
}

/** Props of the run story. */
export interface ActivityRunStoryProps {
  /** The run's correlation id. */
  readonly correlationId: string;
}

/** Props of the resolved run story. */
export interface ActivityRunStoryContentProps {
  /** The worded story. */
  readonly model: ActivityRunStoryModel;
  /** Id of the selected step. */
  readonly selectedStepId: number | undefined;
  /** The selected step's recorded detail. */
  readonly metadata: ActivityMetadataModel;
  /** Whether the raw metadata is open. */
  readonly isRawOpen: boolean;
  /** Selects one step. */
  readonly onSelectStep: (stepId: number) => void;
  /** Opens or closes the raw metadata. */
  readonly onToggleRaw: () => void;
  /** Copies the run reference. */
  readonly onCopy: () => void;
}

/** Props of the recorded detail of one step. */
export interface ActivityRunMetadataProps {
  /** The labelled fields and the raw JSON. */
  readonly metadata: ActivityMetadataModel;
  /** Whether the raw JSON is open. */
  readonly isRawOpen: boolean;
  /** Opens or closes the raw JSON. */
  readonly onToggleRaw: () => void;
}

/** Props of the "Copy for AI" icon button. */
export interface ActivityCopyForAiButtonProps {
  /** What the button copies, named in its tooltip and label. */
  readonly label: string;
  /** Copies the reference. */
  readonly onCopy: () => void;
}

/** The run story's own request state. */
export type ActivityRunStoryRead = ActivityRead<ActivityRunStory>;

/** Reads one thing by its id through the Activity port, worded as a read. */
export type ActivityReader<K extends string | number, T> = (source: ActivitySource, id: K) => Promise<ActivityRead<T>>;

/** What a by-id read hook returns; `Absent` is undefined when the id may be missing. */
export interface ActivityReadState<T, Absent = never> {
  /** The current read. */
  readonly read: ActivityRead<T> | Absent;
  /** Reads again. */
  readonly retry: () => void;
}

/** A step the owner chose, remembered with the run it was chosen in. */
export interface ActivityChosenStep {
  /** The run shown when the step was chosen. */
  readonly correlationId: string;
  /** The chosen step. */
  readonly stepId: number;
}

/** A resolved, failed or gone read, tagged with the request it answers. */
export interface ActivityTaggedRead<T> {
  /** Key of the request that produced it, such as `<id>#<attempt>`. */
  readonly key: string;
  /** What that request produced. */
  readonly read: ActivityRead<T>;
}
