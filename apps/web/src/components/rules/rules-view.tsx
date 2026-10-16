import type { JSX } from 'react';
import type { FeePanel, RulesPage } from '@sportbet/domain';
import { PAGE } from '../static/page-styles';
import { RulesMarginCard } from './rules-margin-card';
import { RulesMatchCard } from './rules-match-card';
import { RulesOddsCard } from './rules-odds-card';
import { RulesOverviewCard } from './rules-overview-card';
import { RulesSerijaCard } from './rules-serija-card';
import { RulesStandingsCard } from './rules-standings-card';

/**
 * /rules (partials/rules.blade.php): six cards in sportbet's order, every
 * figure from the domain's `rulesPage` (R-100). A signed-in player gets the
 * standings page as a link and, with a league, the fee panel; a guest neither.
 */
export function RulesView({
  page,
  player,
  panel,
}: {
  page: RulesPage;
  /** Whether the viewer is signed in. */
  player: boolean;
  panel: FeePanel | null;
}): JSX.Element {
  return (
    <div className={PAGE}>
      <h1 className="sr-only">Taisyklės</h1>
      <RulesOverviewCard page={page} linked={player} panel={panel} />
      <RulesMatchCard page={page} />
      <RulesMarginCard page={page} />
      <RulesOddsCard page={page} />
      <RulesSerijaCard page={page} />
      <RulesStandingsCard page={page} />
    </div>
  );
}
