import type { JSX } from 'react';
import { STAGES, type Stage } from '@sportbet/domain';

/**
 * A round's stage as the form's select words it (R-10; sportbet's
 * `round_type` select showed 1/16, 1/8, 1/4, 1/2 and F, a football
 * tournament's, which the Euroleague's stages replace).
 */
const STAGE_TEXT: Readonly<Record<Stage, string>> = {
  regular: 'Reguliarusis sezonas',
  'play-in': 'Play-in',
  'play-offs': 'Play-off',
  'final-four': 'Final Four',
  final: 'Finalas',
};

/** The options of a stage select, in the domain's order. */
export function StageOptions(): JSX.Element {
  return (
    <>
      {STAGES.map((stage) => (
        <option key={stage} value={stage}>
          {STAGE_TEXT[stage]}
        </option>
      ))}
    </>
  );
}
