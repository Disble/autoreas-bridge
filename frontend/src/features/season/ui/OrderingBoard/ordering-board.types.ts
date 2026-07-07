import type { OrderingCard } from '../../../../infrastructure/season-source';

/** One anime's intended placement — a weekday+position or its Estrenos section. */
export interface DraftPlacement {
  readonly dia: string;
  readonly orden: number;
}

/** The seven weekday columns keyed by day name, each an ordered list of cards. */
export type WeekColumns = Record<string, readonly OrderingCard[]>;
