import type { OrderingCardMeta, OrderingInstance } from '../../src/features/season/ui/OrderingBoard/ordering-board.types';

/**
 * Synthetic cards for the Ordering weekday grid fixture. The names are
 * adversarial on purpose: a long title, an unbroken token no wrap point can
 * split, and a short one, so a lane too narrow for its cards shows up as a card
 * or a button outside its box.
 */

/** A title long enough to need its two-line clamp. */
const LONG_NAME = 'Honzuki no Gekokujou: Shisho ni Naru Tame ni wa Shudan wo Erandeiraremasen';

/** A single token with no break opportunity, wider than a narrow lane. */
const UNBROKEN_NAME = 'Supercalifragilisticexpialidocious_Gekijouban_Soushuuhen_2026';

/** Builds one board card; the key is the sortable id, so it is unique per card. */
function card(animeId: string, copy: number, name: string, isNewcomer: boolean): OrderingInstance {
  return { key: `${animeId}#${copy}`, animeId, name, baseModifiedAt: 0, originHighlighted: false, isPendingDuplicate: false, section: 'Visto', orden: copy, isNewcomer };
}

/**
 * The cards of each weekday. Saturday is empty so the fixture also measures an
 * empty lane; every other weekday holds one to three cards, with the newcomer
 * tag, grade chip and all four desktop actions present on the widest rows.
 */
export const FIXTURE_COLUMNS: Readonly<Record<string, readonly OrderingInstance[]>> = {
  Lunes: [card('a', 0, LONG_NAME, true), card('b', 0, 'Short', false), card('c', 0, UNBROKEN_NAME, true)],
  Martes: [card('d', 0, LONG_NAME, false), card('a', 1, LONG_NAME, false)],
  Miércoles: [card('e', 0, 'Mid length title here', true)],
  Jueves: [card('f', 0, UNBROKEN_NAME, false), card('g', 0, 'Another show', true), card('h', 0, LONG_NAME, true)],
  Viernes: [card('i', 0, 'Friday show', false), card('j', 0, LONG_NAME, false)],
  Sábado: [],
  Domingo: [card('k', 0, 'Sunday special', true), card('b', 1, 'Short', false)],
};

/** Every anime id used above, so each card carries a grade chip and both desktop actions. */
const ANIME_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] as const;

/** Grade and desktop-action metadata for every anime, so the action row is as wide as it gets. */
export const FIXTURE_META: Readonly<Record<string, OrderingCardMeta>> = Object.fromEntries(
  ANIME_IDS.map((id) => [id, { grade: 7, hasPage: true, hasFolder: true, pageUrl: `https://example.test/${id}`, folderPath: `D:/anime/${id}` }]),
);

/** How many cards each anime holds, so Remove is enabled where an anime sits on two days. */
export const FIXTURE_COUNTS: Readonly<Record<string, number>> = { ...Object.fromEntries(ANIME_IDS.map((id) => [id, 1])), a: 2, b: 2 };
