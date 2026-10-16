import { SURVIVAL_REPEAT_RULE } from '@sportbet/domain';
import { STAGE_MARKS } from '../rules/rules-texts';

// The sentences of /help (help.blade.php at sportbet 1618164), one named
// entry for each a ruling or the owner's answer touches. Every other
// sentence is sportbet's, written where it is drawn.

/** R-133 Q2: sportbet's ":stages" - the stage names the table ticks, R-76's with the marks. */
const STAGES = `atkrintamąsias (${STAGE_MARKS.playOffs}) ir finalo ketvertą (${STAGE_MARKS.finalFour})`;

export const HELP_TEXT = {
  /**
   * R-106, R-128, R-133 Q1: sportbet's "Iki pirmųjų rungtynių pradžios" is the
   * tournament's deadline round; with no tournament the clause and the
   * table's length are left out.
   */
  standings: (round: number | null, length: number | null): string =>
    `${
      round === null
        ? 'Reikia'
        : `Kol neįvesti paskutinių ${String(round)}-ojo turo rungtynių rezultatai, reikia`
    } numatyti, kaip baigsis reguliarusis sezonas: kiekvienos komandos vietą bendroje lentelėje${
      length === null ? '' : ` (1-${String(length)})`
    } ir kas prasibraus į tolesnius etapus: ${STAGES}.`,
  /** ST-1: sportbet's help.blade.php:41, the Euroleague's final. */
  twoPlaces: 'Finale nurodomi du: čempionas ir sidabras.',
  /** R-106, R-133 Q5: what the standings save does - a short table is saved - not sportbet's "nepilna prognozė nepriimama". */
  partialTable:
    'Lentelę galima pildyti dalimis - nepilna prognozė taip pat išsaugoma.',
  /** R-133 Q6: the survival page's rule 4, one sentence for both pages. */
  survival: `Kiekvieną turą renkiesi vieną komandą, kuri, tavo manymu, laimės. Jei ji laimi - serija tęsiasi ir taškai auga. Jei pralaimi - serija nutrūksta, skaičiavimas prasideda iš naujo, o visos komandos vėl laisvos. ${SURVIVAL_REPEAT_RULE}`,
} as const;
