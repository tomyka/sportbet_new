// The admin structure pages' URLs (slice 13): sportbet's, at the same path
// and method. Next cannot serve a page and a handler at one path (slice 6,
// decision 1), so a POST sportbet made to a page's own address goes to
// `/save` beside it.

/** "Turnyrai": every tournament, newest first (sportbet's route 'admin.tournaments'). */
export const ADMIN_TOURNAMENTS_PATH = '/admin/tournaments';

/** "Naujas turnyras". */
export const ADMIN_TOURNAMENT_CREATE_PATH = '/admin/tournaments/create';

/** Where the new-tournament form posts (sportbet posts to `/admin/tournaments`). */
export const TOURNAMENT_STORE_PATH = '/admin/tournaments/save';

/** "Redaguoti turnyrą". */
export const tournamentEditPath = (tournament: number): string =>
  `/admin/tournaments/${String(tournament)}/edit`;

/** Where a tournament's edit form posts. */
export const tournamentUpdatePath = (tournament: number): string =>
  `/admin/tournaments/${String(tournament)}`;

/** "Dirbti šiame turnyre": a POST choosing the tournament the admin works on. */
export const tournamentContextPath = (tournament: number): string =>
  `/admin/tournaments/${String(tournament)}/context`;

/** "Turai": the working tournament's rounds. */
export const ADMIN_EVENTS_PATH = '/admin/events';

/** Where a round's row posts (sportbet's POST `/admin/events`). */
export const EVENT_SAVE_PATH = '/admin/events/save';

/** Where the insert row posts. */
export const EVENT_INSERT_PATH = '/admin/eventInsert';

/** "Žaidimai": the working tournament's games. */
export const ADMIN_GAMES_PATH = '/admin/games';

export const INSERT_GAME_PATH = '/admin/insertGame';
export const UPDATE_GAME_PATH = '/admin/updateGame';

/** "Ištrinti žaidimą": asks for the emailed code (R-26 amended), deletes nothing itself. */
export const DELETE_GAME_PATH = '/admin/deleteGame';

/** "Komandos": the working tournament's standings facts. */
export const ADMIN_TEAMS_PATH = '/admin/teams';

/** Where the facts form posts (sportbet's POST `/admin/teams`). */
export const TEAMS_SAVE_PATH = '/admin/teams/save';

/** "Įveskite komandų kiekį:": the placeholder teams' form. */
export const ADMIN_TEAM_INSERT_PATH = '/admin/teaminsert';

/** Where the placeholder form posts (sportbet's POST `/admin/teaminsert`). */
export const TEAM_INSERT_SAVE_PATH = '/admin/teaminsert/save';

/** Where the rename modal posts. */
export const UPDATE_TEAM_DETAILS_PATH = '/admin/updateTeamDetails';

/** The page that asks for the emailed code of a destructive action (R-26 amended). */
export const ADMIN_CONFIRM_PATH = '/admin/confirm';

/** Where its code box posts (sportbet has no such page; Next cannot serve both at one path). */
export const CONFIRM_SAVE_PATH = '/admin/confirm/save';

// The people screens (slice 14, #31): sportbet's URLs, at the same path and
// method; a POST sportbet made to a page's own address goes to `/save`.

/** "Vartotojai": every account. */
export const ADMIN_USERS_PATH = '/admin/users';

/** The role select posts here (sportbet's route 'admin.updateUser'); a change asks for the emailed code (R-26 amended). */
export const UPDATE_USER_PATH = '/admin/updateUser';

/** "Ištrinti": asks for the emailed code, deletes nothing itself. */
export const DELETE_USER_PATH = '/admin/deleteUser';

/** "Paslėpti" / "Rodyti": a form post (sportbet's JSON toggle), R-19. */
export const TOGGLE_HIDDEN_PATH = '/admin/toggleHidden';

/** "Lygos": the working tournament's leagues. */
export const ADMIN_LEAGUES_PATH = '/admin/leagues';

/** Where the edit dialog posts (sportbet's route 'admin.leagues.update'). */
export const ADMIN_LEAGUE_UPDATE_PATH = '/admin/leagues/update';

/** "Ištrinti": asks for the emailed code (R-118). */
export const ADMIN_LEAGUE_DELETE_PATH = '/admin/leagues/delete';

/** The "Svečias" switch (R-87). */
export const ADMIN_LEAGUE_GUEST_PATH = '/admin/leagues/guest';

/** A league's members, with the guest mark. */
export const adminLeagueMembersPath = (league: number): string =>
  `/admin/leagues/${String(league)}/members`;

/** A league's payments, the superadmin's door (the public league's only one). */
export const adminLeaguePaymentsPath = (league: number): string =>
  `/admin/leagues/${String(league)}/payments`;

export const adminLeaguePaymentsSavePath = (league: number): string =>
  `/admin/leagues/${String(league)}/payments/save`;

export const adminLeagueDetailsPath = (league: number): string =>
  `/admin/leagues/${String(league)}/payment-details`;

/** "Žinutės". */
export const ADMIN_MESSAGES_PATH = '/admin/messages';

/** A message row's "Išsaugoti" and "Ištrinti" (sportbet's POST `/admin/messages`). */
export const MESSAGES_SAVE_PATH = '/admin/messages/save';

/** The insert row. */
export const MESSAGE_INSERT_PATH = '/admin/messageInsert';

/** "Auditas". */
export const ADMIN_AUDIT_PATH = '/admin/audit';

/** The audit with one account's trail (the users page's link). */
export const auditUserPath = (player: string): string =>
  `${ADMIN_AUDIT_PATH}?user=${player}`;
