import type { JSX } from 'react';
import type { RulesPage } from '@sportbet/domain';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import {
  LIST,
  PARAGRAPH,
  SECTION,
  TABLE,
  TD,
  TH_HEAD,
} from '../static/page-styles';
import { oddsText, plain, winnerPointsText } from './rules-format';
import { RULES_TEXT } from './rules-texts';

type Example = RulesPage['oddsExamples'][number];

function Row({
  example,
  winnerBonus,
}: {
  example: Example;
  winnerBonus: string;
}): JSX.Element {
  const odds = oddsText(example.oddsHundredths);
  return (
    <tr>
      <td
        className={TD}
      >{`${String(example.share)} % (${String(example.chose)}/${String(example.total)})`}</td>
      <td className={TD}>{odds}</td>
      <td className={TD}>
        {`(1+${odds})×${winnerBonus} = `}
        <strong>{winnerPointsText(example.winnerPointsHundredths)}</strong>
      </td>
    </tr>
  );
}

/**
 * "Koeficientas": the crowd-odds formula, its bullets - R-2's under the ruled
 * set only - and the five crowd sizes, scored by the odds code itself.
 */
export function RulesOddsCard({ page }: { page: RulesPage }): JSX.Element {
  const winnerBonus = plain(page.tiles.winnerBonus);
  return (
    <div className={CARD}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="graph-up" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Koeficientas</h2>
      </div>
      <div className={SECTION}>
        <p className={PARAGRAPH}>
          Koeficientas atlygina už drąsų, retai atspėtą spėjimą - kuo mažiau
          dalyvių pasirinko tą baigtį, tuo daugiau taškų už nugalėtoją.
        </p>
        <ul className={LIST}>
          <li>
            Koef. formulė:{' '}
            <code>log₂(Dalyvių_skaičius / Spėjusiųjų_šią_baigtį)</code>
          </li>
          <li>Taikomas tik atspėjus nugalėtoją.</li>
          <li>Automatiškai sugeneruotiems spėjimams koeficientas = 0</li>
          {page.oddsCountRealOnly ? <li>{RULES_TEXT.oddsRealOnly}</li> : null}
        </ul>
        <table className={`${TABLE} mt-3 max-w-[340px]`}>
          <thead>
            <tr>
              <th className={TH_HEAD}>Spėjo šią baigtį</th>
              <th className={TH_HEAD}>Koef.</th>
              <th className={TH_HEAD}>Nugalėtojas</th>
            </tr>
          </thead>
          <tbody>
            {page.oddsExamples.map((example) => (
              <Row
                key={example.chose}
                example={example}
                winnerBonus={winnerBonus}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
