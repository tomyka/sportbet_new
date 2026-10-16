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
import { plain, pointsText } from './rules-format';
import { RULES_TEXT } from './rules-texts';

/**
 * "Sekos premija": the bullets, the order sentence R-106 corrects to kick-off
 * order, and the table: runs 1, 2 and 3 as the scorer pays them, then the
 * N row's `+(N-1)xstep`.
 */
export function RulesSerijaCard({ page }: { page: RulesPage }): JSX.Element {
  const step = plain(page.tiles.serijaStep);
  return (
    <div className={CARD}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="lightning-fill" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Sekos premija</h2>
      </div>
      <div className={SECTION}>
        <p className={PARAGRAPH}>
          Už kiekvieną iš eilės teisingai atspėtą nugalėtoją kaupiama sekos
          premija.
        </p>
        <ul className={LIST}>
          <li>{RULES_TEXT.serijaOrder}</li>
          <li>Vienas teisingas spėjimas iš eilės - premijos nėra.</li>
          <li>
            Kiekvienas papildomas teisingas spėjimas iš eilės prideda{' '}
            <strong>{`+${step}`}</strong>.
          </li>
          <li>
            Sekos premija dauginama iš etapo koeficiento kartu su kitais
            taškais.
          </li>
        </ul>
        <table className={`${TABLE} mt-3 max-w-[300px]`}>
          <thead>
            <tr>
              <th className={TH_HEAD}>Atspėjimų iš eilės</th>
              <th className={TH_HEAD}>Sekos premija</th>
            </tr>
          </thead>
          <tbody>
            {page.serijaExamples.map(({ run, bonusHundredths }) => (
              <tr key={run}>
                <td className={TD}>{run}</td>
                <td className={TD}>{`+${pointsText(bonusHundredths)}`}</td>
              </tr>
            ))}
            <tr>
              <td className={TD}>N</td>
              <td className={TD}>{`+(N−1)×${step}`}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
