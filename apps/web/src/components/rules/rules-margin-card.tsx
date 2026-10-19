import type { JSX } from 'react';
import type { RulesPage } from '@sportbet/domain';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import {
  CAPTION,
  FORMULA,
  PARAGRAPH,
  POS,
  SECTION,
  TABLE,
  TD,
  TH_HEAD,
  ZERO,
} from '../static/page-styles';
import { missCostWords, plain, pointsText } from './rules-format';

type Example = RulesPage['marginExamples'][number];

const HEADERS = [
  'Rungtynės',
  'Prognozė',
  'Skirtumo klaida',
  'Taškai',
  'Premija',
] as const;

const scoreText = (score: Example['actual']): string =>
  `${String(score.home)}:${String(score.away)}`;

/** "+50 (Bingo)" for the exact score, "+20" for the exact margin, "-" for none (R-138: the rule set's figures, from the page). */
function bonusText(example: Example): string {
  if (example.bonusHundredths <= 0) return '-';
  return `+${pointsText(example.bonusHundredths)}${example.exactScore ? ' (Bingo)' : ''}`;
}

function Row({ example }: { example: Example }): JSX.Element {
  return (
    <tr>
      <td className={TD}>{scoreText(example.actual)}</td>
      <td className={TD}>{scoreText(example.predicted)}</td>
      <td className={TD}>{example.miss}</td>
      <td className={`${TD} ${example.pointsHundredths > 0 ? POS : ZERO}`}>
        {pointsText(example.pointsHundredths)}
      </td>
      <td className={`${TD} ${example.bonusHundredths > 0 ? POS : ZERO}`}>
        {bonusText(example)}
      </td>
    </tr>
  );
}

/**
 * "Tikslumas pagal rezultato skirtumą": the margin rule, the bonus rule and
 * five worked examples scored by the scorers themselves, a miss past the base
 * showing as a real minus.
 */
export function RulesMarginCard({ page }: { page: RulesPage }): JSX.Element {
  const base = plain(page.tiles.marginBase);
  const { differenceSlope } = page.tiles;
  // R-138: the miss at which the accuracy reaches 0, where it turns negative.
  const zeroAt = plain(page.tiles.marginBase / differenceSlope);
  const slopeFactor =
    differenceSlope === 1 ? '' : `${plain(differenceSlope)} × `;
  return (
    <div className={CARD}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="rulers" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>
          Tikslumas pagal rezultato skirtumą
        </h2>
      </div>
      <div className={SECTION}>
        <p className={PARAGRAPH}>
          {`Svarbus komandų rezultatų skirtumas: nuo ${base} atimama ${missCostWords(differenceSlope)}, kiek prognozuotas skirtumas prasilenkia su tikruoju.`}
        </p>
        <p className={FORMULA}>
          {`Tikslumas = ${base} − ${slopeFactor}|prognozuotas skirtumas − tikrasis skirtumas|`}
        </p>
        <p className={`${PARAGRAPH} mt-2.5`}>
          {`Atspėjus tikslų skirtumą, bet ne tikslų rezultatą, prie tikslumo taškų pridedama +${plain(page.tiles.exactMargin)}. Atspėjus tikslų rezultatą, vietoj to skiriamas Bingo +${plain(page.tiles.bingo)} - šios premijos nesumuojamos.`}
        </p>
        <table className={`${TABLE} mt-3 max-w-[520px]`}>
          <thead>
            <tr>
              {HEADERS.map((header) => (
                <th key={header} className={TH_HEAD}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.marginExamples.map((example) => (
              <Row key={scoreText(example.predicted)} example={example} />
            ))}
          </tbody>
        </table>
        <p className={CAPTION}>
          {`Prašovus skirtumą daugiau nei ${zeroAt} taškais, tikslumo taškai tampa neigiami.`}
        </p>
      </div>
    </div>
  );
}
