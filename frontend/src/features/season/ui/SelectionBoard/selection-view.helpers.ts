import {
  CONSIDERATION_OPTIONS,
  MAX_GRADE,
  MIN_GRADE,
  SELECTION_CANDIDATE_NOUN,
  SELECTION_FILTER_ALL_KEY,
  SELECTION_FILTER_ALL_LABEL,
  SELECTION_GROUP_VERDICTS,
  SELECTION_VERDICT_RANK,
} from './selection-board.constants';
import { formatSelectionGrade, getVerdictLabel } from './selection-board.helpers';
import type {
  SelectionFilterGroup,
  SelectionRow,
  SelectionSort,
  SelectionViewCriteria,
  SelectionViewSummaryEntry,
  Verdict,
} from './selection-board.types';

/** The default view: every dimension unrestricted and the board's own order. */
export function createSelectionView(): SelectionViewCriteria {
  return { grades: [], verdicts: [], considerations: [], sort: 'original' };
}

/** Report whether the view differs from the default in any dimension or order. */
export function hasSelectionViewCriteria(criteria: SelectionViewCriteria): boolean {
  return countSelectionFilterValues(criteria) > 0 || criteria.sort !== 'original';
}

/** Count the selected values across the three dimensions (not the dimensions in use). */
export function countSelectionFilterValues(criteria: SelectionViewCriteria): number {
  return criteria.grades.length + criteria.verdicts.length + criteria.considerations.length;
}

/**
 * Keep the rows a view matches: values inside one dimension OR together, and the
 * dimensions AND together. An empty dimension is unrestricted, never empty.
 */
export function filterSelectionRows(rows: readonly SelectionRow[], criteria: SelectionViewCriteria): SelectionRow[] {
  const grades = new Set(criteria.grades);
  const verdicts = new Set<string>(criteria.verdicts);
  const considerations = new Set(criteria.considerations);
  return rows.filter(
    (row) =>
      (grades.size === 0 || grades.has(String(row.grade))) &&
      (verdicts.size === 0 || verdicts.has(row.verdict)) &&
      (considerations.size === 0 || considerations.has(row.consideration)),
  );
}

/** Compare two grades: None (ungraded) trails in both directions. */
function compareGrades(left: SelectionRow, right: SelectionRow, sort: SelectionSort): number {
  if (left.grade === right.grade) {
    return 0;
  }
  if (left.grade === 0 || right.grade === 0) {
    return left.grade === 0 ? 1 : -1;
  }
  return sort === 'grade-desc' ? right.grade - left.grade : left.grade - right.grade;
}

/**
 * Return a sorted copy of the rows. Approved stays before Rejected, sorting only
 * reorders rows inside a verdict group, and equal keys keep the incoming order.
 */
export function sortSelectionRows(rows: readonly SelectionRow[], sort: SelectionSort): SelectionRow[] {
  if (sort === 'original') {
    return rows.slice();
  }
  const position = new Map(rows.map((row, index) => [row.id, index]));
  return rows.slice().sort((left, right) => {
    const byVerdict = SELECTION_VERDICT_RANK[left.verdict] - SELECTION_VERDICT_RANK[right.verdict];
    if (byVerdict !== 0) {
      return byVerdict;
    }
    const byKey = sort.startsWith('grade')
      ? compareGrades(left, right, sort)
      : left.rawName.localeCompare(right.rawName, 'en') * (sort === 'name-desc' ? -1 : 1);
    return byKey !== 0 ? byKey : (position.get(left.id) ?? 0) - (position.get(right.id) ?? 0);
  });
}

/** The trigger label: the active-value count is only worth showing when it is not zero. */
export function formatSelectionFiltersLabel(activeFilterCount: number): string {
  return activeFilterCount > 0 ? `Filters, ${activeFilterCount} active` : 'Filters';
}

/** The popover's close action, which only closes the panel: filtering is instant. */
export function formatSelectionShowLabel(matchingCount: number): string {
  return `Show ${matchingCount} ${SELECTION_CANDIDATE_NOUN}${matchingCount === 1 ? '' : 's'}`;
}

/** The toolbar's visible/total count. */
export function formatSelectionVisibleCount(visible: number, total: number): string {
  return `${visible} of ${total} ${SELECTION_CANDIDATE_NOUN}${total === 1 ? '' : 's'}`;
}

/** The three filter dimensions, in the order the popover renders them. */
export function toSelectionFilterGroups(): SelectionFilterGroup[] {
  const grades = Array.from({ length: MAX_GRADE - MIN_GRADE + 1 }, (_, index) => MIN_GRADE + index);
  return [
    {
      key: 'grades',
      label: 'Grade',
      options: [...grades, 0].map((grade) => ({ value: String(grade), label: formatSelectionGrade(grade) })),
    },
    { key: 'verdicts', label: 'Verdict', options: SELECTION_GROUP_VERDICTS.map((verdict) => ({ value: verdict, label: getVerdictLabel(verdict) })) },
    { key: 'considerations', label: 'Consideration', options: CONSIDERATION_OPTIONS },
  ];
}

/** The selected values of one dimension, in vocabulary order, or All while unrestricted. */
function summarizeDimension(values: readonly string[], labels: ReadonlyMap<string, string>): string {
  if (values.length === 0) {
    return SELECTION_FILTER_ALL_LABEL;
  }
  const selected = new Set(values);
  return [...labels.entries()]
    .filter(([value]) => selected.has(value))
    .map(([, label]) => label)
    .join(', ');
}

/** The TagGroup keys a dimension shows: All while unrestricted, otherwise its values. */
export function toSelectionFilterTagKeys(selectedValues: readonly string[]): string[] {
  return selectedValues.length === 0 ? [SELECTION_FILTER_ALL_KEY] : [...selectedValues];
}

/**
 * Read a TagGroup selection back into a dimension's values. All is a sentinel, not
 * a value: clicking a specific tag while All is selected keeps only the specifics,
 * and clicking All clears the dimension. The previous selection disambiguates the
 * two, because React Aria adds the clicked key to the existing set.
 */
export function toSelectionFilterValues(keys: Iterable<string>, previousValues: readonly string[]): string[] {
  const selected = [...keys];
  if (!selected.includes(SELECTION_FILTER_ALL_KEY)) {
    return selected;
  }
  const allWasSelected = previousValues.length === 0;
  return allWasSelected ? selected.filter((key) => key !== SELECTION_FILTER_ALL_KEY) : [];
}

/** The persistent criteria summary: one entry per dimension, All where unrestricted. */
export function toSelectionViewSummary(criteria: SelectionViewCriteria): SelectionViewSummaryEntry[] {
  return toSelectionFilterGroups().map((group) => {
    const labels = new Map(group.options.map((option) => [option.value, option.label]));
    const values = criteria[group.key] as readonly string[];
    return { label: group.label, value: summarizeDimension(values, labels) };
  });
}
