import type { JSX } from 'react';
import type { SurvivalPickPageData } from '@sportbet/db';
import { CARD } from '../hub/styles';
import { pickerView } from './picker-view';
import { SurvivalPicker } from './survival-grid';
import { SurvivalRules } from './survival-rules';
import { SurvivalRunCard } from './survival-run-card';

/**
 * sportbet's survival page (prediction/survival.blade.php): while the
 * round plays survival, the hero and the pick grid, the run, and the
 * rules; otherwise one card, "Išlikimo žaidimas baigėsi.".
 */
export function SurvivalView({
  data,
}: {
  data: SurvivalPickPageData;
}): JSX.Element {
  const { page, teamNames, roundName } = data;
  if (page.kind === 'over') {
    return (
      <div className={`${CARD} mb-4 text-muted`}>
        Išlikimo žaidimas baigėsi.
      </div>
    );
  }
  return (
    <>
      <SurvivalPicker view={pickerView(page, teamNames, roundName)} />
      {page.run.length === 0 ? null : (
        <SurvivalRunCard run={page.run} teamNames={teamNames} />
      )}
      <SurvivalRules />
    </>
  );
}
