import { onePlace, type LeaderboardRow } from '@sportbet/domain';
import { CardIcon } from '../hub/card-icon';
import { CharityCard } from '../hub/charity-card';
import { GLYPH } from '../hub/glyphs';
import { CARD, CARD_TITLE } from '../hub/styles';
import { LEADERBOARD_PATH } from '../shell/shell-paths';

const MEDAL = [GLYPH.gold, GLYPH.silver, GLYPH.bronze] as const;

/** Bootstrap's `table` cell, and `text-end`. */
const CELL = 'border-b border-border px-2 py-2 align-middle';
const END = `${CELL} text-right`;

/** d-none d-sm-table-cell, d-none d-md-table-cell. */
const FROM_SM = 'hidden sm:table-cell';
const FROM_MD = 'hidden md:table-cell';

/** .lb-pub-medal for ranks 1 to 3, else .lb-pub-rank. */
function Rank({ rank }: { rank: number }) {
  const medal = MEDAL[rank - 1];
  return medal === undefined ? (
    <span className="text-[0.85rem] font-semibold text-muted">
      {String(rank)}
    </span>
  ) : (
    <span className="text-[1.2rem]">{medal}</span>
  );
}

/**
 * leaderboard.blade.php (MainController::leaderboard): "Lyderių lentelė",
 * its intro, then every counted player (loadLeaderboard) - the medal or
 * rank, the username, the total to one decimal, and from sm "Tikslūs",
 * from md "Nugalėtojai" and "Žaidimai"; ranks 1 to 3 on the warm tint. With
 * no row yet, sportbet's empty text (issue 131). Then the leaderboard's
 * charity card (R-75).
 */
export function LeaderboardView({ rows }: { rows: readonly LeaderboardRow[] }) {
  return (
    <>
      <div className={`${CARD} mb-4`}>
        <div className={`mb-3 ${CARD_TITLE}`}>
          <CardIcon name="trophy-fill" tone="warn" /> Lyderių lentelė
        </div>
        <p
          data-testid="leaderboard-intro"
          className="mb-4 text-[0.88rem] text-muted"
        >
          Žaidžiame nuo 2016 metų - kiekvienas turnyras prideda naujų iššūkių ir
          intrigų.{' '}
          <a href={LEADERBOARD_PATH} className="text-accent">
            Prisijunk
          </a>{' '}
          ir išbandyk save.
        </p>
        <div className="overflow-x-auto">
          <table className="mb-0 w-full border-collapse text-[0.9rem]">
            <thead className="bg-surface-2 text-left">
              <tr>
                <th className={`${CELL} w-12`}>#</th>
                <th className={CELL}>Žaidėjas</th>
                <th className={END}>Taškai</th>
                <th className={`${END} ${FROM_SM}`}>Tikslūs</th>
                <th className={`${END} ${FROM_MD}`}>Nugalėtojai</th>
                <th className={`${END} ${FROM_MD}`}>Žaidimai</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className={`${CELL} py-4 text-center text-[0.88rem] text-muted`}
                  >
                    Kol kas nesužaista nė vienų rungtynių - lentelė pasipildys
                    po pirmųjų rezultatų.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.player}
                    className={row.rank <= 3 ? 'bg-warn-tint' : undefined}
                  >
                    <td className={CELL}>
                      <Rank rank={row.rank} />
                    </td>
                    <td className={`${CELL} font-semibold`}>{row.username}</td>
                    <td className={`${END} font-bold text-accent`}>
                      {onePlace(row.totalCents)}
                    </td>
                    <td className={`${END} ${FROM_SM} text-muted`}>
                      {String(row.exact)}
                    </td>
                    <td className={`${END} ${FROM_MD} text-muted`}>
                      {String(row.winners)}
                    </td>
                    <td className={`${END} ${FROM_MD} text-muted`}>
                      {String(row.games)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      <CharityCard variant="leaderboard" />
    </>
  );
}
