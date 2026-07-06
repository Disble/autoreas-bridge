/** Props for the IntakePanel; all data flows through its hook. */
export interface IntakePanelProps {
  readonly className?: string;
}

/** The two intake editing modes: plain-text draft vs rendered rows. */
export type IntakeMode = 'raw' | 'list';

/** Semantic HeroUI chip colors used by the intake status chips. */
export type IntakeChipColor = 'success' | 'warning' | 'danger' | 'default';
