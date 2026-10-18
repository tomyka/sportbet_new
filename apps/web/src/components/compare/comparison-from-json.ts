import { playerId, roundNumber, type Comparison } from '@sportbet/domain';
import { z } from 'zod';

const sideSchema = z.object({
  player: z.string(),
  username: z.string(),
  rank: z.number(),
  totalCents: z.number(),
  matchCents: z.number(),
  standingsCents: z.number(),
  survivalCents: z.number(),
  serijaCents: z.number(),
  bingo: z.number(),
});

const comparisonSchema = z.object({
  me: sideSchema,
  them: sideSchema,
  record: z
    .object({ wins: z.number(), draws: z.number(), losses: z.number() })
    .nullable(),
  rounds: z.array(
    z.object({
      round: z.number(),
      name: z.string(),
      meCents: z.number(),
      themCents: z.number(),
    }),
  ),
});

type SideJson = z.infer<typeof sideSchema>;

function sideFrom(json: SideJson): Comparison['me'] | null {
  const player = playerId(json.player);
  return player.ok ? { ...json, player: player.value } : null;
}

/**
 * The comparison the card route sends (`/compare/{id}/card`), read back into
 * the domain's own shape; null for an answer that is not one, so the modal
 * shows its error rather than a broken card.
 */
export function comparisonFromJson(body: unknown): Comparison | null {
  const parsed = comparisonSchema.safeParse(body);
  if (!parsed.success) return null;
  const { me: meJson, them: themJson, record, rounds } = parsed.data;
  const me = sideFrom(meJson);
  const them = sideFrom(themJson);
  const read = rounds.map((round) => {
    const number = roundNumber(round.round);
    return number.ok ? { ...round, round: number.value } : null;
  });
  if (me === null || them === null || read.includes(null)) return null;
  return {
    me,
    them,
    record,
    rounds: read.filter((round) => round !== null),
  };
}
