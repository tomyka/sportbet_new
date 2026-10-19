import type { JSX } from 'react';
import type { RulesPage } from '@sportbet/domain';
import { SAVE_TEXTS } from '../../server/predictions/texts';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import {
  FORMULA,
  LIST,
  SECTION,
  TILE,
  TILE_LABEL,
  TILE_POINTS,
  TILES,
} from '../static/page-styles';
import { missTerm, plain } from './rules-format';

function Tile({
  points,
  label,
}: {
  points: string;
  label: string;
}): JSX.Element {
  return (
    <div className={TILE}>
      <div className={TILE_POINTS}>{points}</div>
      <div className={TILE_LABEL}>{label}</div>
    </div>
  );
}

/** The rates as the tile writes them: "×1 / ×2" (R-10: "×1 / ×2 / ×3" under the ruled set). */
const ratesText = (rates: readonly number[]): string =>
  rates.map((rate) => `×${plain(rate)}`).join(' / ');

/**
 * "Taškų skaičiavimas - rungtynių rezultatai": the six tiles, the formula
 * and the entry bounds. The serija tile is `+(N-1)xstep` (R-106), the
 * bounds' sentences the prediction page's own.
 */
export function RulesMatchCard({ page }: { page: RulesPage }): JSX.Element {
  const { tiles } = page;
  return (
    <div className={CARD}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="award-fill" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>
          Taškų skaičiavimas - rungtynių rezultatai
        </h2>
      </div>
      <div className={TILES}>
        <Tile
          points={`(1+Koef.)×${plain(tiles.winnerBonus)}`}
          label="Nugalėtojas - su koeficiento premija"
        />
        <Tile
          points={`${plain(tiles.marginBase)} − ${missTerm(tiles.differenceSlope)}`}
          label="Tikslumas pagal rezultato skirtumą"
        />
        <Tile
          points={`+${plain(tiles.bingo)}`}
          label="Bingo - tikslus rezultatas"
        />
        <Tile
          points={`+${plain(tiles.exactMargin)}`}
          label="Tikslus skirtumas, kai rezultatas netikslus"
        />
        <Tile
          points={`+(N−1)×${plain(tiles.serijaStep)}`}
          label="Seka - N atspėjimų iš eilės"
        />
        <Tile points={ratesText(tiles.rates)} label="Etapo koeficientas" />
      </div>
      <div className={SECTION}>
        <p className={FORMULA}>
          Taškai = (Nugalėtojas + Tikslumas + Bingo + Seka) × Etapo_koef
        </p>
        <ul className={LIST}>
          <li>{SAVE_TEXTS.range}</li>
          <li>{SAVE_TEXTS.draw}</li>
        </ul>
      </div>
    </div>
  );
}
