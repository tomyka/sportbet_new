import {
  dayAfter,
  tournamentProfileSchema,
  tournamentSchema,
  type RegistrationWindow,
  type Tournament,
  type TournamentProfile,
} from '@sportbet/domain';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { instantOf, stored } from '../edge';
import { games } from '../season/schema';
import { standingsDeadlineSql } from '../season/standings-deadline-sql';
import { tournamentColumns } from './repository';
import { tournaments } from './schema';

/** One tournament as the hub and sign-up read it. */
export interface CatalogueTournament {
  readonly tournament: Tournament;
  /** Its hub columns (slice 5), from the same row. */
  readonly profile: TournamentProfile;
  /** What R-21 and PL-2 read of its season (RegistrationWindow). */
  readonly window: RegistrationWindow;
}

const catalogueRows = z.array(
  z.object({
    tournament: tournamentSchema,
    profile: tournamentProfileSchema,
    games: z.int(),
    allScored: z.boolean(),
    firstTipOff: z.date().nullable(),
    standingsDeadline: z.date().nullable(),
  }),
);

/**
 * Every tournament by id, with its profile and its RegistrationWindow, in
 * one query and one parse: the only place the three are read together, so
 * none can be missing for another (the hub's visible tournaments, sign-up's
 * candidates and whether registration is open at all). The window is summed
 * up instead of loading the season: the end as loadSeason sets it (the day
 * after its end date), its games, whether each has a result, its first
 * tip-off and its standings deadline (ST-2, standingsDeadlineSql). The db
 * tests hold it equal to Season.registrationWindow on the same rows.
 */
export async function loadTournamentCatalogue(
  db: Executor,
): Promise<CatalogueTournament[]> {
  const rows = await db
    .select({
      ...tournamentColumns,
      status: tournaments.status,
      startsOn: tournaments.startsOn,
      sport: tournaments.sport,
      description: tournaments.description,
      isPublic: tournaments.isPublic,
      games: sql<number>`count(${games.id})::int`,
      allScored: sql<boolean>`coalesce(bool_and(${games.homeScore} is not null and ${games.awayScore} is not null) filter (where ${games.id} is not null), true)`,
      firstTipOff: sql<Date | null>`min(${games.tipOff})`.mapWith(games.tipOff),
      standingsDeadline: standingsDeadlineSql(),
    })
    .from(tournaments)
    .leftJoin(games, eq(games.tournamentId, tournaments.id))
    .groupBy(tournaments.id)
    .orderBy(asc(tournaments.id));
  const parsed = catalogueRows.parse(
    rows.map((row) => ({
      tournament: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        format: row.format,
        endsOn: row.endsOn,
        standingsDeadlineRound: row.standingsDeadlineRound,
        survival: row.survival,
        standingsTableFinal: row.standingsTableFinal,
      },
      profile: {
        status: row.status,
        startsOn: row.startsOn,
        sport: row.sport,
        description: row.description,
        isPublic: row.isPublic,
      },
      games: row.games,
      allScored: row.allScored,
      firstTipOff: row.firstTipOff,
      standingsDeadline: row.standingsDeadline,
    })),
  );
  return parsed.map(catalogueEntry);
}

/** One parsed catalogue row: its RegistrationWindow's moments as instants. */
function catalogueEntry(
  row: z.infer<typeof catalogueRows>[number],
): CatalogueTournament {
  const { id, endsOn } = row.tournament;
  const instant = (date: Date | null) =>
    date === null ? null : instantOf(date, 'tournaments', String(id));
  return {
    tournament: row.tournament,
    profile: row.profile,
    window: {
      endsAt:
        endsOn === null ? null : stored(dayAfter(endsOn), 'tournaments', id),
      games: row.games,
      allScored: row.allScored,
      firstTipOff: instant(row.firstTipOff),
      standingsDeadline: instant(row.standingsDeadline),
    },
  };
}
