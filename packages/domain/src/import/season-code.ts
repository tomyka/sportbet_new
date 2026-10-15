import { z } from 'zod';

/**
 * A Euroleague season code: the competition's letters and the starting
 * year, `E2026` for 2026-27 (EuroleagueImportController::validated,
 * `^[A-Z]{1,2}[0-9]{4}$`).
 */
export const seasonCodeSchema = z
  .string()
  .regex(/^[A-Z]{1,2}[0-9]{4}$/u)
  .brand<'SeasonCode'>();

export type SeasonCode = z.infer<typeof seasonCodeSchema>;
