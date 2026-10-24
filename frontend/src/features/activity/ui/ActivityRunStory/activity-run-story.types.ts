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

/** One step of the run story, ready to draw. */
export interface ActivityRunStepModel {
  /** Event row id, the stable React key. */
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

/** The steps of one run story. */
export interface ActivityRunStoryModel {
  /** The ordered steps. */
  readonly steps: readonly ActivityRunStepModel[];
  /** A note when Go capped the steps; empty otherwise. */
  readonly truncatedNote: string;
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

/** A resolved, failed or gone read, tagged with the request it answers. */
export interface ActivityTaggedRead<T> {
  /** Key of the request that produced it, such as `<id>#<attempt>`. */
  readonly key: string;
  /** What that request produced. */
  readonly read: ActivityRead<T>;
}
