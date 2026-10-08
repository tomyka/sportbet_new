import { z } from 'zod';
import { normalizeEmail, storedEmailAddress } from '../account/email';
import { personNameInvariant } from '../account/person-name';
import {
  localeInvariant,
  type StoredPlayerSettings,
} from '../account/player-settings';
import { roleOfSportbetLevel } from '../account/role';
import { usernameInvariant, type StoredPlayer } from '../player/player';
import { playerId, roundNumber, type RoundNumber } from '../shared/ids';
import { ok, refuse, type Result } from '../shared/result';
import { FORMATS } from '../tournament/format';
import {
  slugSchema,
  tournamentNameInvariant,
  type Tournament,
} from '../tournament/tournament';
import {
  TOURNAMENT_STATUSES,
  type TournamentProfile,
} from '../tournament/tournament-profile';
import type {
  SportbetSettingsRow,
  SportbetTournamentProfileRefusal,
  SportbetTournamentProfileRow,
  SportbetTournamentRefusal,
  SportbetTournamentRow,
  SportbetUserRow,
} from './sportbet-rows';

const isoDateSchema = z.iso.date();

/** A sportbet row id: a positive integer, as every auto-increment id is. */
const sportbetIdSchema = z.int().positive();

/**
 * sportbet's `users`, `user_settings`, `tournaments` and their profile
 * columns read into the domain's stored rows: part of sportbetColumns
 * (sportbet-columns.ts), whose doc lists each quirk.
 */
export const sportbetAccountColumns = Object.freeze({
  player(
    row: SportbetUserRow,
  ): Result<
    StoredPlayer,
    'bad-id' | 'bad-username' | 'unnormalized-email' | 'bad-email' | 'bad-name'
  > {
    if (!sportbetIdSchema.safeParse(row.id).success) {
      return refuse('bad-id');
    }
    const id = playerId(String(row.id));
    if (!id.ok) {
      return refuse('bad-id');
    }
    if (!usernameInvariant.schema.safeParse(row.username).success) {
      return refuse('bad-username');
    }
    // Sign-in looks an address up normalized (#41): an account stored
    // otherwise could never sign in, so it is refused and counted.
    if (normalizeEmail(row.email) !== row.email) {
      return refuse('unnormalized-email');
    }
    const email = storedEmailAddress(row.email);
    if (!email.ok) {
      return refuse('bad-email');
    }
    if (
      !personNameInvariant.schema.safeParse(row.name).success ||
      !personNameInvariant.schema.safeParse(row.surname).success
    ) {
      return refuse('bad-name');
    }
    return ok({
      id: id.value,
      username: row.username,
      email: email.value,
      name: row.name,
      surname: row.surname,
    });
  },

  settings(
    row: SportbetSettingsRow,
  ): Result<StoredPlayerSettings, 'bad-admin-level' | 'bad-locale'> {
    const role = roleOfSportbetLevel(row.admin);
    if (!role.ok) {
      return refuse('bad-admin-level');
    }
    if (!localeInvariant.schema.safeParse(row.locale).success) {
      return refuse('bad-locale');
    }
    return ok({
      player: row.player,
      locale: row.locale,
      role: role.value,
      lastTournament: null,
    });
  },

  tournament(
    row: SportbetTournamentRow,
  ): Result<Tournament, SportbetTournamentRefusal> {
    if (!sportbetIdSchema.safeParse(row.id).success) {
      return refuse('bad-id');
    }
    const format = FORMATS.find((each) => each === row.standings_format);
    if (format === undefined) {
      return refuse('format-not-ported');
    }
    const endsOn = isoDateSchema.nullable().safeParse(row.end_date);
    if (!endsOn.success) {
      return refuse('bad-end-date');
    }
    const slug = slugSchema.safeParse(row.slug);
    if (!slug.success) {
      return refuse('bad-slug');
    }
    if (!tournamentNameInvariant.schema.safeParse(row.name).success) {
      return refuse('bad-name');
    }
    let standingsDeadlineRound: RoundNumber | null = null;
    if (row.standings_deadline_round !== null) {
      const round = roundNumber(row.standings_deadline_round);
      if (!round.ok) {
        return refuse('bad-deadline-round');
      }
      standingsDeadlineRound = round.value;
    }
    return ok({
      id: row.id,
      slug: slug.data,
      name: row.name,
      format,
      endsOn: endsOn.data,
      standingsDeadlineRound,
      survival: row.survival_game !== 0,
      standingsTableFinal: false,
    });
  },

  /**
   * The tournament's profile: `status` one of sportbet's three, `start_date`
   * a date or none, `is_public` true unless 0 (a tinyint(1), as
   * `survival_game`); `sport` and `description` as typed.
   */
  tournamentProfile(
    row: SportbetTournamentProfileRow,
  ): Result<TournamentProfile, SportbetTournamentProfileRefusal> {
    const status = TOURNAMENT_STATUSES.find((each) => each === row.status);
    if (status === undefined) {
      return refuse('bad-status');
    }
    const startsOn = isoDateSchema.nullable().safeParse(row.start_date);
    if (!startsOn.success) {
      return refuse('bad-start-date');
    }
    return ok({
      status,
      startsOn: startsOn.data,
      sport: row.sport,
      description: row.description,
      isPublic: row.is_public !== 0,
    });
  },
});
