import { roundNumber, type RoundNumber } from '../shared/ids';
import { instantSchema, type Instant } from '../shared/instant';
import { ok, refuseWith, type DetailedResult } from '../shared/result';
import { teamNameKey } from '../team/crests';
import type { SeasonCode } from './season-code';

/** Why the feed could not be read: the adapter's failures, not the payload's. */
export type FeedFailure =
  | { readonly kind: 'unreachable' }
  | { readonly kind: 'http-error'; readonly status: number }
  | { readonly kind: 'not-json' };

/** The Euroleague schedule feed; the live one is the only code naming its host. */
export interface EuroleagueFeed {
  games(season: SeasonCode): Promise<DetailedResult<unknown, FeedFailure>>;
}

/** One regular-season game as the feed lists it. */
export interface EuroleagueFixture {
  readonly round: RoundNumber;
  readonly tipOff: Instant;
  readonly home: string;
  readonly away: string;
}

export type FeedRefusal =
  | { readonly kind: 'no-games' }
  | {
      readonly kind: 'malformed';
      readonly number: number;
      readonly field: string;
    };

export interface FeedSeason {
  readonly fixtures: readonly EuroleagueFixture[];
  /** R-94: games of another phase, counted and not planned. */
  readonly postSeasonLeftOut: number;
}

/** phaseType.code of a regular-season game (R-94). */
const REGULAR_SEASON_PHASE = 'RS';

const TIP_OFF =
  /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/u;

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `value[a][b][c]`, null as soon as a level is missing or not an object. */
function dig(value: unknown, ...path: readonly string[]): unknown {
  let level = value;
  for (const key of path) {
    if (!isObject(level) || !(key in level)) return null;
    level = level[key];
  }
  return level;
}

/** The feed's round: an integer or a string of digits only. */
function roundOf(value: unknown): RoundNumber | null {
  const whole =
    typeof value === 'number' && Number.isInteger(value)
      ? value
      : typeof value === 'string' && /^[0-9]+$/u.test(value)
        ? Number(value)
        : null;
  if (whole === null) return null;
  const round = roundNumber(whole);
  return round.ok ? round.value : null;
}

/** `+0200` as `+02:00`; a `Z`, an absent zone (read as UTC) and `+02:00` as they are. */
function isoZone(zone: string | undefined): string {
  if (zone === undefined) return 'Z';
  return zone.length === 5 ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone;
}

/**
 * `utcDate`, the only UTC field of the feed, to the second. A value with no
 * zone is read as UTC; one with an offset is moved to UTC. A date or time the
 * calendar lacks (02-30, 24:00) is refused, not rolled over.
 */
function tipOffOf(value: unknown): Instant | null {
  if (typeof value !== 'string') return null;
  const [, date, time, zone] = TIP_OFF.exec(value) ?? [];
  if (date === undefined || time === undefined) return null;
  const written = `${date}T${time.length === 5 ? `${time}:00` : time}`;
  const utc = Date.parse(`${written}Z`);
  if (Number.isNaN(utc) || !new Date(utc).toISOString().startsWith(written)) {
    return null;
  }
  const ms = Date.parse(`${written}${isoZone(zone)}`);
  const parsed = instantSchema.safeParse(ms - (ms % 1000));
  return parsed.success ? parsed.data : null;
}

/** The most games one feed may list: a season is 380, a feed of more is not one. */
export const MAX_FEED_GAMES = 2000;

/** The longest club name taken: the longest real one is under 40 characters. */
export const MAX_CLUB_NAME = 100;

/**
 * A club's name, whitespace collapsed and trimmed; null when blank, not
 * text, longer than `MAX_CLUB_NAME` or holding a control character (C0, DEL
 * or C1: an escape sequence in a name would reach a terminal).
 */
function clubName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\s+/gu, ' ').trim();
  return name === '' || name.length > MAX_CLUB_NAME || /\p{Cc}/u.test(name)
    ? null
    : name;
}

type Parsed =
  | { readonly field: string }
  | { readonly fixture: EuroleagueFixture; readonly phase: string };

/** One game of `data`, its fields checked in sportbet's order, then the phase (R-94). */
function parseGame(game: unknown): Parsed {
  const round = roundOf(dig(game, 'round'));
  if (round === null) return { field: 'round' };
  const tipOff = tipOffOf(dig(game, 'utcDate'));
  if (tipOff === null) return { field: 'utcDate' };
  const home = clubName(dig(game, 'local', 'club', 'name'));
  if (home === null) return { field: 'local.club.name' };
  const away = clubName(dig(game, 'road', 'club', 'name'));
  if (away === null || teamNameKey(away) === teamNameKey(home)) {
    return { field: 'road.club.name' };
  }
  const phase = dig(game, 'phaseType', 'code');
  if (typeof phase !== 'string' || phase === '') {
    return { field: 'phaseType.code' };
  }
  return { fixture: { round, tipOff, home, away }, phase };
}

/**
 * The feed's `data[]` as the regular season's fixtures (R-94), and how many
 * games of another phase were left out. The game number a refusal names is
 * the game's place in the list, from 1; a list past `MAX_FEED_GAMES` is
 * refused as malformed at the first game past it.
 */
export function parseEuroleagueFeed(
  payload: unknown,
): DetailedResult<FeedSeason, FeedRefusal> {
  const games = dig(payload, 'data');
  if (!Array.isArray(games) || games.length === 0) {
    return refuseWith({ kind: 'no-games' });
  }
  if (games.length > MAX_FEED_GAMES) {
    return refuseWith({
      kind: 'malformed',
      number: MAX_FEED_GAMES + 1,
      field: 'data',
    });
  }
  const fixtures: EuroleagueFixture[] = [];
  let postSeasonLeftOut = 0;
  for (const [index, game] of games.entries()) {
    const parsed = parseGame(game);
    if ('field' in parsed) {
      return refuseWith({
        kind: 'malformed',
        number: index + 1,
        field: parsed.field,
      });
    }
    if (parsed.phase === REGULAR_SEASON_PHASE) fixtures.push(parsed.fixture);
    else postSeasonLeftOut += 1;
  }
  return ok({ fixtures, postSeasonLeftOut });
}
