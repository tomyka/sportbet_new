import { z } from 'zod';

/**
 * sportbet's `tournaments.status`: the state the admin declared
 * (Tournament::effectiveStatus reads it; nothing writes it back).
 */
export const TOURNAMENT_STATUSES = ['upcoming', 'active', 'finished'] as const;

export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

/**
 * What the hub and the tournament page show of a tournament besides its
 * rules (spec slice 5): sportbet's status, start date, sport, description
 * and public switch, copied from production. Only the hub's grouping
 * (hubGroup) and who may see a tournament (canSeeTournament) read them;
 * scoring never does.
 */
export const tournamentProfileSchema = z.object({
  status: z.enum(TOURNAMENT_STATUSES),
  /** `start_date`, `YYYY-MM-DD` in UTC; null when the admin set none. */
  startsOn: z.iso.date().nullable(),
  /** `sport` as the admin typed it ("basketball"). */
  sport: z.string(),
  description: z.string().nullable(),
  /** `is_public`: R-50 hides a tournament without it. */
  isPublic: z.boolean(),
});

export type TournamentProfile = z.infer<typeof tournamentProfileSchema>;
