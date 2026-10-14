import { STANDINGS_LINE_KEYS } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { STAGE_LABELS } from './stage-labels';

// sportbet's badge labels, as printed today. They are not the league table's
// Euroleague names (EUROLEAGUE_STAGE_NAMES, R-76), which stay separate.
describe('STAGE_LABELS', () => {
  it.each([
    {
      stage: 'place',
      expected: ['Grupės vieta', 'Grupės vieta: spėta 3', 'G', 'Grupė'],
    },
    { stage: 'playOffs', expected: ['Ketvirtfinalis', '1/4', 'QF', '1/4'] },
    { stage: 'finalFour', expected: ['Pusfinalis', '1/2', 'SF', '1/2'] },
    {
      stage: 'final',
      expected: ['Finalas', 'Finalas: spėta 3', 'F', 'Finalas'],
    },
  ] as const)('$stage reads as sportbet prints it', ({ stage, expected }) => {
    const label = STAGE_LABELS[stage];
    expect([
      label.popover,
      label.title('3'),
      label.letters,
      label.legend,
    ]).toEqual(expected);
  });

  it('has one entry for each of the four lines', () => {
    expect(Object.keys(STAGE_LABELS)).toEqual([...STANDINGS_LINE_KEYS]);
  });
});
