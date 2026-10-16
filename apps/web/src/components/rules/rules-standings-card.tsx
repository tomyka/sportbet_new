import type { JSX } from 'react';
import type { RulesPage } from '@sportbet/domain';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import {
  CAPTION,
  POS,
  TABLE,
  TABLE_TITLE,
  TD,
  TH_HEAD,
  TH_ROW,
  ZERO,
} from '../static/page-styles';
import { stageLabel } from '../static/shared-texts';
import { plain } from './rules-format';

const COLUMN = 'col-span-12 md:col-span-6 lg:col-span-4';

/** "Vietos lentelėje": what a miss pays, down to the floor or seven, then how the rule goes on and how far the table runs. */
function Places({ page }: { page: RulesPage }): JSX.Element {
  return (
    <div className={COLUMN}>
      <p className={TABLE_TITLE}>Vietos lentelėje</p>
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH_HEAD}>Nuokrypis nuo tikrosios vietos</th>
            <th className={TH_HEAD}>Taškai</th>
          </tr>
        </thead>
        <tbody>
          {page.placeExamples.map((example) => (
            <tr key={example.miss}>
              <td className={TD}>
                {example.last
                  ? `${String(example.miss)} ir daugiau`
                  : example.miss}
              </td>
              <td className={`${TD} ${example.points > 0 ? POS : ZERO}`}>
                {example.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.placesContinue ? (
        <p className={CAPTION}>
          {`Toliau - po ${plain(page.placeStep)} taškų už kiekvieną papildomą vietą, kol nukrenta iki 0.`}
        </p>
      ) : null}
      {page.teamCount === null ? null : (
        <p className={CAPTION}>
          {`Vieta spėjama bendroje lentelėje (1-${String(page.teamCount)}).`}
        </p>
      )}
    </div>
  );
}

/** "Nokautų etapas - patekimas": R-76's names with their marks (R-133 Q2), what a hit pays and a miss does not. */
function Bracket({ page }: { page: RulesPage }): JSX.Element {
  return (
    <div className={COLUMN}>
      <p className={TABLE_TITLE}>Nokautų etapas - patekimas</p>
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH_HEAD}>Etapas</th>
            <th className={TH_HEAD}>
              <Icon name="check-lg" /> atspėta
            </th>
            <th className={TH_HEAD}>
              <Icon name="x-lg" /> neatspėta
            </th>
          </tr>
        </thead>
        <tbody>
          {page.bracket.map((row) => (
            <tr key={row.stage}>
              <td className={TD}>{stageLabel(row.stage)}</td>
              <td className={`${TD} ${POS}`}>{row.points}</td>
              <td className={`${TD} ${ZERO}`}>0</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** "Finalas (F) - vietos": the places 1 and 2 against each other, the diagonal marked. */
function Finals({ page }: { page: RulesPage }): JSX.Element {
  const places = page.finalsGrid.map((_, index) => index + 1);
  return (
    <div className={COLUMN}>
      <p className={TABLE_TITLE}>
        {`${stageLabel('final')} - vietos (prognozė vs tikroji)`}
      </p>
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH_HEAD} />
            {places.map((place) => (
              <th key={place} className={TH_HEAD}>
                {place}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {page.finalsGrid.map((row, index) => (
            <tr key={places[index]}>
              <th className={TH_ROW}>{places[index]}</th>
              {row.map((value, actual) => (
                <td
                  key={places[actual]}
                  className={`${TD} ${actual === index ? POS : ''}`}
                >
                  {value}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={CAPTION}>Eilutė = prognozė, stulpelis = tikroji vieta</p>
      <p className={CAPTION}>1 - čempionas, 2 - vicečempionas.</p>
    </div>
  );
}

/** "Taškų skaičiavimas - turnyro eiga": the places, the bracket and the finals. */
export function RulesStandingsCard({ page }: { page: RulesPage }): JSX.Element {
  return (
    <div className={CARD}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="diagram-3-fill" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>
          Taškų skaičiavimas - turnyro eiga
        </h2>
      </div>
      <div className="grid grid-cols-12 gap-6">
        <Places page={page} />
        <Bracket page={page} />
        <Finals page={page} />
      </div>
    </div>
  );
}
