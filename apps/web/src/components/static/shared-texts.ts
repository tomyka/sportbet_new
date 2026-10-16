import { EUROLEAGUE_STAGE_NAMES } from '@sportbet/domain';

// The Lithuanian sentences and phrases /rules, /help and the survival page say
// the same way (text lives in components, decision 13): one place, so the
// pages cannot drift apart.

/** R-133 Q2: the stages' marks, which the standings page ticks ("1/4", "1/2", "F"). */
export const STAGE_MARKS = {
  playOffs: '1/4',
  finalFour: '1/2',
  final: 'F',
} as const;

/** R-76's name with its mark: "Atkrintamosios (1/4)", "Finalo ketvertas (1/2)", "Finalas (F)" (R-133 Q2). */
export const stageLabel = (stage: keyof typeof STAGE_MARKS): string =>
  `${EUROLEAGUE_STAGE_NAMES[stage]} (${STAGE_MARKS[stage]})`;

/**
 * R-106, R-128, R-133 Q1: the games whose last result closes the standings,
 * "paskutinių 5-ojo turo rungtynių" (sportbet said "pirmųjų rungtynių").
 */
export const deadlineRoundGames = (round: number): string =>
  `paskutinių ${String(round)}-ojo turo rungtynių`;

/**
 * The survival rule on repeating a team, as the survival page's fourth rule
 * and /help's survival paragraph both say it (R-133, R-11): a team is not
 * picked twice in a run, and the used list resets once every team has been
 * used.
 */
export const SURVIVAL_REPEAT_RULE =
  'Tos pačios komandos antrą kartą rinktis negalima, kol serija nenutrūksta arba kol panaudotos visos komandos.';
