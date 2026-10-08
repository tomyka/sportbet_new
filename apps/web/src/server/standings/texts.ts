import { STANDINGS_COUNTS } from '@sportbet/domain';

/**
 * The standings saves' texts: sportbet's (StandingsRules::rowConflicts,
 * PredictionStandingController; lang/lt.json), R-78's chain, and ours for
 * the field rules, whose Laravel defaults sportbet's page never shows.
 */
export const STANDINGS_TEXTS = {
  placeTaken: 'Ši vieta jau užimta kitos komandos.',
  // ':stage etape jau pažymėta :count komandų.', at the format's counts (ST-1).
  playOffsFull: `1/4 etape jau pažymėta ${String(STANDINGS_COUNTS.playOffs)} komandų.`,
  finalFourFull: `1/2 etape jau pažymėta ${String(STANDINGS_COUNTS.finalFour)} komandų.`,
  finalPlaceTaken: 'Ši finalo vieta jau užimta kitos komandos.',
  finalFourWithoutPlayOffs:
    'Komanda, pažymėta 1/2 etape, turi būti pažymėta ir 1/4 etape.',
  finalPlaceWithoutFinalFour:
    'Finalo vietą galima nurodyti tik komandai, pažymėtai 1/2 etape.',
  notThisPrediction: 'Šios prognozės išsaugoti negalima.',
  closed: 'Prognozių laikas baigėsi.',
  mismatch: 'Eilė nesutampa su jūsų lentele.',
  placeFromOne: 'Vieta turi būti teigiamas skaičius.',
  beyondTable: 'Tokios vietos lentelėje nėra.',
  badTick: 'Žymė turi būti 0 arba 1.',
  badFinalPlace: 'Finalo vieta turi būti 1 arba 2.',
  badOrder: 'Eilė neteisinga.',
} as const;
