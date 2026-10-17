// Narrow entry `@sportbet/db/tournament` (#36): Tournaments, their seasons and teams.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  findTournamentById,
  findTournamentBySlug,
  insertTournaments,
  listTournaments,
  type NewTournament,
} from '../tournament/repository';
export { saveTournamentProfile } from '../tournament/profile';
export {
  loadTournamentCatalogue,
  type CatalogueTournament,
} from '../tournament/catalogue';
export {
  loadTournamentFacts,
  type DescribedTournament,
} from '../tournament/facts';
export {
  chooseAdminTournament,
  createTournament,
  loadAdminTournament,
  updateTournament,
  type TournamentUpdate,
  type TournamentWriteRefusal,
} from '../tournament/admin';
export {
  loadRoundNames,
  loadSeason,
  type SavedRound,
} from '../season/repository';
export { listTeams, loadTeamOutcomes, type TeamRow } from '../team/repository';
