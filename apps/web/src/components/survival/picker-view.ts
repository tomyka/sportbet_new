import type {
  SurvivalCard,
  SurvivalPickPage,
  SurvivalVerdict,
  TeamId,
} from '@sportbet/domain';
import { teamName } from './survival-text';

// The open survival page as the client grid draws it: plain strings and
// numbers (a server component cannot hand a Points to a client one), every
// line and mark already chosen as survival.blade.php chooses them.

/** A card's mark: a check when used, a lock when disabled, otherwise its ground. */
type CardMark = 'used' | 'locked' | 'home' | 'away';

export interface PickCardView {
  readonly team: string;
  readonly name: string;
  readonly ground: 'home' | 'away';
  readonly line: string;
  readonly mark: CardMark;
  readonly disabled: boolean;
}

export type HeroVerdict = SurvivalVerdict | null;

export interface PickerView {
  readonly round: number;
  /** The round's name, "· Rinkis komandą" after it while a pick can be made. */
  readonly heading: string;
  readonly free: number;
  readonly used: number;
  /** R-4's notice: the pick is locked and the round not yet scored. */
  readonly lockNotice: boolean;
  readonly held: string | null;
  readonly cards: readonly PickCardView[];
  readonly streak: number;
  readonly runPoints: number;
  readonly verdict: HeroVerdict;
  readonly stake: { readonly home: number; readonly away: number };
}

const cardLine = (card: SurvivalCard, opponent: string): string => {
  switch (card.state.kind) {
    case 'used':
      return card.state.round === null
        ? 'Panaudota'
        : `Panaudota · ${String(card.state.round)} turas`;
    case 'started':
      return 'Rungtynės prasidėjo';
    case 'open':
      return `vs. ${opponent}`;
  }
};

const cardMark = (card: SurvivalCard): CardMark => {
  if (card.state.kind === 'used') return 'used';
  return card.selectable ? card.ground : 'locked';
};

const cardView = (
  card: SurvivalCard,
  names: ReadonlyMap<TeamId, string>,
): PickCardView => ({
  team: card.team,
  name: teamName(names, card.team),
  ground: card.ground,
  line: cardLine(card, teamName(names, card.opponent)),
  mark: cardMark(card),
  disabled: !card.selectable,
});

/** The open page, ready for the grid; a round without a name is headed "Išlikimas". */
export function pickerView(
  page: Extract<SurvivalPickPage, { kind: 'open' }>,
  names: ReadonlyMap<TeamId, string>,
  roundName: string | null,
): PickerView {
  const name = roundName === null || roundName === '' ? 'Išlikimas' : roundName;
  return {
    round: page.round,
    heading: page.choosing ? `${name} · Rinkis komandą` : name,
    free: page.free,
    used: page.used,
    lockNotice: page.lockNotice,
    held: page.picked,
    cards: page.cards.map((card) => cardView(card, names)),
    streak: page.streak,
    runPoints: page.runPoints,
    verdict: page.verdict,
    stake: page.stake,
  };
}

/**
 * The stake "Už šį turą": once scored, what the round paid; else the held
 * pick's ground from the last running total, or both ("+10/12") until a
 * team is held, as the two grounds pay differently.
 */
export function stakeText(view: PickerView, held: string | null): string {
  if (view.verdict !== null) {
    return `+${String(view.verdict.state === 'survived' ? view.verdict.points : 0)}`;
  }
  const { home, away } = view.stake;
  const ground = view.cards.find((card) => card.team === held)?.ground;
  if (ground === undefined) {
    return home === away
      ? `+${String(home)}`
      : `+${String(home)}/${String(away)}`;
  }
  return `+${String(ground === 'home' ? home : away)}`;
}
