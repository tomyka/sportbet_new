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
