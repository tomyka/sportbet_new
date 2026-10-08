import type { SportbetRows } from './read-columns';
import { mapLeagues, mapSettings, mapUsers } from './mapping/accounts';
import {
  assembleTournaments,
  countAccounts,
  loadedSettingsOf,
  noticeLeaguesAndRoles,
} from './mapping/assemble';
import { Ledger, type MapContext } from './mapping/ledger';
import {
  CopyGuard,
  mapPredictions,
  mapStandingsPredictions,
  mapSurvivalPicks,
  type Parents,
} from './mapping/player-rows';
import {
  mapMatchPoints,
  mapStandingsPoints,
  mapSurvivalPoints,
} from './mapping/points';
import {
  mapEvents,
  mapGameOdds,
  mapGames,
  mapTeams,
  mapTournaments,
} from './mapping/structure';
import type { Mapped } from './mapping/types';

export type { TableCount } from './mapping/ledger';
export type {
  League,
  Mapped,
  MappedTournament,
  RefusedPoints,
} from './mapping/types';

/**
 * Maps sportbet's read rows to the domain's stored rows, and reconciles
 * every table: each row is loaded, skipped by design (a football
 * tournament's, a seeded survival slot, a user in no loaded tournament) or
 * refused with a reason. Every value goes through sportbetColumns and then
 * the domain's stored factory, and nothing is mapped anywhere else. Pure:
 * no I/O, so every quirk has a unit test.
 *
 * The tables are mapped parents first (src/mapping/): the tournaments'
 * structure, the accounts, the players' rows, production's points, then
 * each loaded tournament assembled and the accounts counted.
 *
 * A user whose user_settings cannot be read (no row, or rows that differ)
 * is refused under a named reason (`player-without-settings`,
 * `duplicate-key`), whether or not they play a loaded tournament: no
 * default is guessed, and every such account is counted. So every loaded
 * player has exactly one settings row.
 */
export function mapSportbet(rows: SportbetRows): Mapped {
  const ctx: MapContext = { rows, ledger: new Ledger(rows), notices: [] };
  const tournaments = mapTournaments(ctx);
  const rounds = mapEvents(ctx, tournaments.fates);
  const teams = mapTeams(ctx, tournaments.fates);
  const games = mapGames(ctx, { rounds, teams });
  const odds = mapGameOdds(ctx, games);
  const users = mapUsers(ctx);
  const settings = mapSettings(ctx, users);
  const leagues = mapLeagues(ctx, {
    tournamentFates: tournaments.fates,
    users,
  });
  const parents: Parents = { rounds, teams, games, users };
  const copies = new CopyGuard(ctx);
  const predictions = mapPredictions(ctx, parents, copies);
  const standings = mapStandingsPredictions(
    ctx,
    { ...parents, settings, anyTournament: tournaments.tournaments.size > 0 },
    copies,
  );
  const picks = mapSurvivalPicks(ctx, parents);
  const loaded = {
    odds,
    predictions,
    standings,
    matchPoints: mapMatchPoints(ctx, parents, copies),
    standingsPoints: mapStandingsPoints(ctx, parents, copies),
    survivalPoints: mapSurvivalPoints(ctx, parents),
  };
  const assembly = {
    ctx,
    tournaments,
    parents,
    settings,
    leagues,
    picks,
    loaded,
  };
  const assembled = assembleTournaments(assembly);
  countAccounts(assembly, assembled.loadedUsers);
  const loadedSettings = loadedSettingsOf(settings, assembled.loadedUsers);
  noticeLeaguesAndRoles(ctx, loadedSettings);
  return {
    players: [...assembled.loadedUsers]
      .sort((a, b) => a - b)
      .flatMap((id) => {
        const player = users.users.get(id);
        return player === undefined ? [] : [player];
      }),
    settings: loadedSettings,
    tournaments: assembled.tournaments,
    tables: ctx.ledger.tables(),
    notices: ctx.notices,
  };
}
