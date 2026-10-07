import type { HubLeader, UpcomingGame } from '@sportbet/db';
import { leaderPoints, numberFormat, type MedalRow } from '@sportbet/domain';
import { vilniusDateTime } from '../format/vilnius-time';
import { CardIcon } from './card-icon';
import { GLYPH } from './glyphs';
import { CARD, CARD_TITLE, PANEL, PANEL_TITLE } from './styles';
import { TeamCrest } from './team-crest';

const HOW_IT_WORKS = [
  {
    glyph: GLYPH.target,
    title: 'Spėk rungtynių rezultatus',
    text: 'Prognozuok tikslų rezultatą prieš kiekvieną rungtynę',
  },
  {
    glyph: GLYPH.chart,
    title: 'Rink taškus',
    // R-52: sportbet's "įvarčių skirtumą" is "taškų skirtumą" here.
    text: 'Taškus gauni už tikslų rezultatą, nugalėtoją ir taškų skirtumą',
  },
  {
    glyph: GLYPH.trophy,
    title: 'Konkuruok lygoje',
    text: 'Sukurk privačią lygą su draugais arba prisijunk prie esamos',
  },
] as const;

/** "Kaip tai veikia?" on an upcoming card. */
export function HowItWorks() {
  return (
    <div data-testid="how-it-works" className={PANEL}>
      <div className={PANEL_TITLE}>
        <CardIcon name="info-circle" /> Kaip tai veikia?
      </div>
      <div className="flex flex-col gap-3">
        {HOW_IT_WORKS.map((item) => (
          <div key={item.title} className="flex items-start gap-3">
            <span aria-hidden="true" className="text-[1.4rem] leading-none">
              {item.glyph}
            </span>
            <div>
              <div className="text-[0.88rem] font-semibold">{item.title}</div>
              <div className="text-[0.8rem] text-muted">{item.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Artėjančios rungtynės": each game's time in Vilnius (R-51), then "home vs away". */
export function UpcomingGames({ games }: { games: readonly UpcomingGame[] }) {
  return (
    <div data-testid="upcoming-games" className={PANEL}>
      <div className={PANEL_TITLE}>
        <CardIcon name="calendar3" /> Artėjančios rungtynės
      </div>
      <div className="flex flex-col gap-[10px]">
        {games.map((game) => (
          <div key={game.id} className="text-[0.85rem]">
            <div className="mb-[2px] text-[0.75rem] text-muted">
              {vilniusDateTime(game.tipOff)}
            </div>
            <div className="font-semibold">
              {game.home} <span className="font-normal text-muted">vs</span>{' '}
              {game.away}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const MEDAL = [GLYPH.gold, GLYPH.silver, GLYPH.bronze] as const;

/**
 * "Lyderiai": ranks 1 to 3 as medals, the rest as numbers, the username
 * and the total to one decimal. "Visos vietos →" leads to the leaderboard
 * once slice 8 builds it; until then it is text, in the link's colour.
 */
export function LeadersPanel({ leaders }: { leaders: readonly HubLeader[] }) {
  return (
    <div data-testid="leaders" className={PANEL}>
      <div className={PANEL_TITLE}>
        <CardIcon name="trophy-fill" tone="warn" /> Lyderiai{' '}
        <span className="text-[0.75rem] font-medium text-accent">
          Visos vietos →
        </span>
      </div>
      <div className="flex flex-col gap-[6px]">
        {leaders.map((leader) => (
          <div
            key={leader.username}
            data-testid="leader"
            data-rank={leader.rank}
            className="flex items-center gap-2 border-b border-border py-[5px] last:border-b-0"
          >
            <span className="w-6 shrink-0 text-center text-[1rem]">
              {MEDAL[leader.rank - 1] ?? (
                <span className="text-[0.8rem] text-muted">{leader.rank}</span>
              )}
            </span>
            <span className="flex-1 text-[0.85rem] font-semibold">
              {leader.username}
            </span>
            <span className="text-[0.85rem] font-bold text-accent">
              {leaderPoints(leader.totalCents)} pt
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** .pos-1 to .pos-4: each place's medal colour. */
const PLACE = [
  'bg-medal-1 text-on-medal',
  'bg-medal-2 text-on-medal',
  'bg-medal-3 text-on-medal',
  'bg-medal-4 text-on-medal-4',
] as const;

/** The hub card's panel, or a league's card (partials/standings.blade.php). */
const MEDALS_FRAME = {
  hub: { frame: PANEL, title: PANEL_TITLE, text: 'Finalų prognozės' },
  league: {
    frame: CARD,
    title: `mb-3 ${CARD_TITLE}`,
    text: 'Finalų dalyvių prognozės',
  },
} as const;

/**
 * "Finalų prognozės" (.stnl-list): each team's crest and how many put it
 * 1st to 4th, on round badges in the medals' colours, a zero faded. The
 * game page and the tournament page draw it as a league's card, "Finalų
 * dalyvių prognozės".
 */
export function MedalsPanel({
  medals,
  variant = 'hub',
}: {
  medals: readonly MedalRow[];
  variant?: keyof typeof MEDALS_FRAME;
}) {
  const { frame, title, text } = MEDALS_FRAME[variant];
  return (
    <div data-testid="medals" className={frame}>
      <div className={title}>
        <CardIcon name="graph-up-arrow" /> {text}
      </div>
      <div className="flex flex-col">
        {medals.map((row) => (
          <div
            key={row.team}
            data-testid="medal-row"
            className="flex items-center justify-between gap-2 border-b border-border px-[2px] py-[6px] last:border-b-0"
          >
            <span className="flex min-w-0 flex-1 items-center gap-[6px]">
              <TeamCrest team={row.team} />
              <span className="truncate text-[0.82rem] font-semibold text-text">
                {row.team}
              </span>
            </span>
            <span className="flex shrink-0 gap-[6px]">
              {[row.first, row.second, row.third, row.fourth].map(
                (count, place) => (
                  <span
                    key={place}
                    data-testid="medal-count"
                    data-place={place + 1}
                    className={`flex size-[22px] items-center justify-center rounded-full text-[0.72rem] font-bold ${PLACE[place] ?? ''}${count === 0 ? ' opacity-30' : ''}`}
                  >
                    {count}
                  </span>
                ),
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "Statistika": the players, and the predictions once there are any. */
export function StatsPanel({
  participants,
  predictions,
}: {
  participants: number;
  predictions: number;
}) {
  return (
    <div data-testid="stats" className={PANEL}>
      <div className={PANEL_TITLE}>
        <CardIcon name="bar-chart-fill" /> Statistika
      </div>
      <div className="flex flex-wrap gap-4">
        <div>
          <div className="text-[1.4rem] font-bold text-accent">
            {participants}
          </div>
          <div className="text-[0.75rem] text-muted">dalyviai</div>
        </div>
        {predictions > 0 ? (
          <div>
            <div className="text-[1.4rem] font-bold text-accent">
              {numberFormat(predictions, 0)}
            </div>
            <div className="text-[0.75rem] text-muted">prognozės</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
