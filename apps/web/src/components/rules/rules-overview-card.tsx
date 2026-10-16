import type { JSX } from 'react';
import type { FeePanel as FeePanelView, RulesPage } from '@sportbet/domain';
import { FeePanel } from '../dashboard/fee-panel';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import { STANDINGS_PATH } from '../shell/shell-paths';
import {
  BADGE,
  LINK,
  LIST,
  PARAGRAPH,
  SECTION,
  STAGE,
} from '../static/page-styles';
import { RULES_TEXT } from './rules-texts';

/** "Turnyro eigos prognozė": a link for a signed-in player, text for a guest (sportbet's @auth). */
function StandingsName({ linked }: { linked: boolean }): JSX.Element {
  return linked ? (
    <a href={STANDINGS_PATH} className={LINK}>
      Turnyro eigos prognozė
    </a>
  ) : (
    <>Turnyro eigos prognozė</>
  );
}

/**
 * The results' deadline, then - with a tournament to describe - the
 * standings' (R-106, R-128, R-133 Q1): the last result of the tournament's
 * deadline round, its number written even before that round has a game.
 */
function Deadlines({
  round,
  linked,
}: {
  round: number | null;
  linked: boolean;
}): JSX.Element {
  return (
    <p className={PARAGRAPH}>
      Rezultatus pateikti galima iki kiekvienų rungtynių pradžios.
      {round === null ? null : (
        <>
          {' '}
          <StandingsName linked={linked} /> {RULES_TEXT.deadline(round)}
        </>
      )}
    </p>
  );
}

function Stages({
  deadlineRound,
  linked,
}: {
  deadlineRound: number | null;
  linked: boolean;
}): JSX.Element {
  return (
    <div className={SECTION}>
      <p className={PARAGRAPH}>Totalizatorius vykdomas dviem etapais:</p>
      <div className={STAGE}>
        <div className={BADGE}>I</div>
        <div>
          <strong className="mb-1 block">Reguliarusis sezonas</strong>
          <p className={PARAGRAPH}>{RULES_TEXT.stageOne}</p>
          <Deadlines round={deadlineRound} linked={linked} />
        </div>
      </div>
      <div className={STAGE}>
        <div className={BADGE}>II</div>
        <div>
          <strong className="mb-1 block">Atkrintamųjų etapas</strong>
          <p className={PARAGRAPH}>{RULES_TEXT.stageTwo}</p>
        </div>
      </div>
    </div>
  );
}

/** "Vertinimas": sportbet's four bullets, R-107's tie-break word for word, and R-7's switch-off. */
function Scoring({ misses }: { misses: number }): JSX.Element {
  return (
    <div className={`${SECTION} mt-3`}>
      <strong>Vertinimas</strong>
      <ul className={LIST}>
        <li>Prognozuojamų rezultatų tikslumas vertinamas taškais.</li>
        <li>Laimi daugiausiai surinkęs taškų.</li>
        <li>{RULES_TEXT.tieBreak}</li>
        <li>
          Neperdavus laiku rezultato, spėjimas bus sugeneruotas automatiškai -
          taškams už rungtynes nebus taikomas koeficientas.
        </li>
        <li>{RULES_TEXT.switchOff(misses)}</li>
      </ul>
    </div>
  );
}

/**
 * "Totalizatoriaus eiga": the two stages, the deadline, the player's fee
 * panel (a guest or a player with no league has none) and "Vertinimas".
 */
export function RulesOverviewCard({
  page,
  linked,
  panel,
}: {
  page: RulesPage;
  linked: boolean;
  panel: FeePanelView | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="list-check" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Totalizatoriaus eiga</h2>
      </div>
      <Stages deadlineRound={page.deadlineRound} linked={linked} />
      {panel === null ? null : (
        <div className="mt-3 text-[0.88rem]">
          <FeePanel panel={panel} />
        </div>
      )}
      <Scoring misses={page.switchOffAfterMisses} />
    </div>
  );
}
