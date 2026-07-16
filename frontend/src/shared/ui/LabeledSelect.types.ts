/** A single option rendered by the reusable labeled select primitive. */
export interface LabeledSelectOption {
  readonly value: string;
  readonly label: string;
}

interface LabeledSelectBaseProps {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly label: string;
  readonly options: readonly LabeledSelectOption[];
  readonly placeholder: string;
  readonly variant?: 'primary' | 'secondary';
}

/** Props for single-value labeled selects. */
export interface SingleLabeledSelectProps extends LabeledSelectBaseProps {
  readonly fallbackValue: string;
  readonly selectionMode?: 'single';
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** Props for multiple-value labeled selects. */
export interface MultipleLabeledSelectProps extends LabeledSelectBaseProps {
  readonly selectionMode: 'multiple';
  readonly value: readonly string[];
  readonly onChange: (value: readonly string[]) => void;
}

/** Props for the reusable HeroUI labeled select scaffold. */
export type LabeledSelectProps = SingleLabeledSelectProps | MultipleLabeledSelectProps;

/** Props for rendering a select option list inside a HeroUI ListBox. */
export interface LabeledSelectOptionsProps {
  readonly options: readonly LabeledSelectOption[];
}
