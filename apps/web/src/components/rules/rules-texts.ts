import { deadlineRoundGames, STAGE_MARKS } from '../static/shared-texts';

// The sentences of /rules (resources/views/partials/rules.blade.php at
// sportbet 1618164), one named entry for each a ruling or the owner's answer
// touches, so a change of wording is a one-line change (plan decision 6).
// Every other sentence is sportbet's, written where it is drawn.

export const RULES_TEXT = {
  /** R-133 Q2: sportbet's "...į :stages etapus", with R-76's names in the declined forms and the marks. */
  stageOne: `Rungtynių rezultatų ir vietų bendroje lentelėje spėjimas, komandų, patenkančių į atkrintamųjų (${STAGE_MARKS.playOffs}) ir finalo ketverto (${STAGE_MARKS.finalFour}) etapus, bei finalo išankstinis prognozavimas.`,
  /** R-133 Q2: sportbet's "Nuoseklus :stages etapų ir finalo rezultatų spėjimas." */
  stageTwo: `Nuoseklus atkrintamųjų (${STAGE_MARKS.playOffs}), finalo ketverto (${STAGE_MARKS.finalFour}) etapų ir finalo (${STAGE_MARKS.final}) rezultatų spėjimas.`,
  /** R-106, R-128, R-133 Q1: the deadline is the last result of the tournament's deadline round, not "iki pirmųjų rungtynių pradžios". */
  deadline: (round: number): string =>
    `turi būti pateikta iki bus įvesti ${deadlineRoundGames(round)} rezultatai.`,
  /** R-107: the prize tie-break, word for word. */
  tieBreak:
    'Jei keli dalyviai surenka po lygiai taškų, žiūrima į eigos prognozės taškus, po to į daugiausiai tiksliai atspėtų rungtynių skaičių.',
  /** R-7, R-32, R-133 Q4: the owner may reword it. */
  switchOff: (misses: number): string =>
    `Praleidus ${String(misses)} rungtynių per turnyrą, žaidėjas paslepiamas lentelėse ir spėjimai už jį nebegeneruojami, kol jis vėl išsaugo spėjimą.`,
  /** R-2, R-133 Q3. */
  oddsRealOnly:
    'Koeficientas skaičiuojamas tik pagal tikrus spėjimus - automatiškai sugeneruoti spėjimai į jį neįskaičiuojami.',
  /** R-106: a run follows kick-off order, sportbet's "(ID tvarka)". */
  serijaOrder: 'Skaičiuojama pagal rungtynių pradžios laiką.',
} as const;
