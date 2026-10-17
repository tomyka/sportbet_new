// Narrow entry `@sportbet/db/admin` (#36): The admin pages' lists.
// Holds only modules that never load the points schema (entry-points.test.ts).
export {
  findAdminTournament,
  findAdminGame,
  loadAdminGames,
  loadAdminRounds,
  loadAdminTeams,
  loadAdminTournaments,
  type AdminGame,
  type AdminGamesPage,
  type AdminRoundOption,
  type AdminRoundRow,
  type AdminTeam,
  type AdminTeamsPage,
  type AdminTournament,
} from '../admin/pages';
export {
  findAdminUser,
  loadAdminUsers,
  type AdminUser,
  type AdminUserStanding,
} from '../admin/users';
export {
  loadAuditPage,
  type AuditPageData,
  type AuditTabRows,
} from '../admin/audit';
