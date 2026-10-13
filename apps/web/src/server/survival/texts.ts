import { SURVIVAL_NOT_SAVED } from '../../components/survival/survival-protocol';

/**
 * The survival save's texts, sportbet's verbatim
 * (PredictionSurvivalController::updatePredictionSurvivalUser's form,
 * SurvivalPick::decide, survival.blade.php's fallback).
 */
export const SURVIVAL_TEXTS = {
  noTeam: 'Nepasirinkta komanda.',
  unknownTeam: 'Ši komanda nepasiekiama.',
  noCurrentRound: 'Šiuo metu nėra raundo, kuriam būtų galima rinktis.',
  roundChanged: 'Turas pasikeitė - perkraukite puslapį.',
  roundHasNoSurvival: 'Šiame ture išlikimo žaidimo nėra.',
  roundAlreadyScored: 'Šis turas jau užskaitytas.',
  teamNotPlaying: 'Ši komanda šiame ture nežaidžia.',
  teamAlreadyStarted: 'Šios komandos rungtynės jau prasidėjo.',
  pickLocked:
    'Tavo pasirinktos komandos rungtynės jau prasidėjo - šio turo pasirinkimo keisti nebegalima.',
  teamUsedInRun:
    'Šią komandą jau rinkaisi - kiekvieną komandą galima rinktis tik kartą, kol išnaudosi visas.',
  notSaved: SURVIVAL_NOT_SAVED,
} as const;
