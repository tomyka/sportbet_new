import { describe, expect, it } from 'vitest';
import {
  deadlineRoundGames,
  stageLabel,
  STAGE_MARKS,
  SURVIVAL_REPEAT_RULE,
} from './shared-texts';

describe('stageLabel (R-76, R-133 Q2)', () => {
  it('writes the stage name with the mark the standings page ticks', () => {
    expect(stageLabel('playOffs')).toBe('Atkrintamosios (1/4)');
    expect(stageLabel('finalFour')).toBe('Finalo ketvertas (1/2)');
    expect(stageLabel('final')).toBe('Finalas (F)');
  });

  it('has the three marks', () => {
    expect(STAGE_MARKS).toEqual({
      playOffs: '1/4',
      finalFour: '1/2',
      final: 'F',
    });
  });
});

describe('deadlineRoundGames (R-106, R-128, R-133 Q1)', () => {
  it('names the round whose last games close the standings', () => {
    expect(deadlineRoundGames(5)).toBe('paskutinių 5-ojo turo rungtynių');
    expect(deadlineRoundGames(12)).toBe('paskutinių 12-ojo turo rungtynių');
  });
});

describe('SURVIVAL_REPEAT_RULE (R-133, R-11)', () => {
  it('names both ways the used list ends: the run breaking, and every team being used', () => {
    expect(SURVIVAL_REPEAT_RULE).toBe(
      'Tos pačios komandos antrą kartą rinktis negalima, kol serija nenutrūksta arba kol panaudotos visos komandos.',
    );
  });
});
