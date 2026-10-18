import type { JSX } from 'react';
import type { Comparison } from '@sportbet/domain';
import { CARD, BUTTON_SECONDARY } from '../hub/styles';
import { Icon } from '../shell/icon';
import { PLAYER_HOME } from '../shell/shell-paths';
import { CompareHeader } from './compare-header';
import { CompareRounds } from './compare-rounds';
import { CompareStats } from './compare-stats';

/**
 * compare/_card.blade.php: the head-to-head card - header, "Bendri
 * statistikos", "Etapai" - which the compare page and the league table's
 * modal both show.
 */
export function CompareCard({
  comparison,
}: {
  comparison: Comparison;
}): JSX.Element {
  return (
    <>
      <CompareHeader comparison={comparison} />
      <CompareStats comparison={comparison} />
      <CompareRounds comparison={comparison} />
    </>
  );
}

/** sportbet's compare page (compare/show.blade.php): the card and "Atgal" to the game page. */
export function CompareView({
  comparison,
}: {
  comparison: Comparison;
}): JSX.Element {
  return (
    <div className={`${CARD} mx-auto max-w-[520px]`}>
      <CompareCard comparison={comparison} />
      <div className="mt-3 pb-1">
        <a href={PLAYER_HOME} className={BUTTON_SECONDARY}>
          <Icon name="arrow-left" /> Atgal
        </a>
      </div>
    </div>
  );
}
