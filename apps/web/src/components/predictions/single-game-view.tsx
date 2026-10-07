import { TeamCrest } from '../hub/team-crest';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { PLAYER_HOME } from '../shell/shell-paths';
import { SingleGameForm } from './single-game-form';

/** One game's page, in strings. */
export interface SingleGameText {
  readonly game: number;
  readonly home: string;
  readonly away: string;
  /** The tip-off, `Y-m-d H:i` in Vilnius (vilniusStamp). */
  readonly stamp: string;
  readonly locked: boolean;
  /** The player's row as typed into the boxes, or null with none. */
  readonly prediction: { readonly home: string; readonly away: string } | null;
}

function Team({ name }: { name: string }) {
  return (
    <div className="text-center">
      <TeamCrest team={name} size="large" />
      <div className="mt-2 font-semibold">{name}</div>
    </div>
  );
}

/**
 * game-single.blade.php: "Spėjimas", the teams, the tip-off in Vilnius
 * with " LT". Locked: the notice, and the player's prediction when it has
 * scores; open with a row: the form; with no row, "Spėjimas nerastas"
 * and the way home.
 */
export function SingleGameView({ game }: { game: SingleGameText }) {
  const { prediction } = game;
  return (
    <div data-testid="single-game" className={`${CARD} mb-4`}>
      <h1 className={CARD_TITLE}>
        <Icon name="pencil-square" /> Spėjimas
      </h1>
      <div className="my-6 flex items-center justify-center gap-6">
        <Team name={game.home} />
        <div className="text-[1.5rem] font-bold text-muted">vs</div>
        <Team name={game.away} />
      </div>
      <div className="mb-6 text-center text-[0.85rem] text-muted">
        <Icon name="clock" /> {game.stamp} LT
      </div>
      {game.locked ? (
        <>
          <div className="rounded-[6px] border border-border bg-surface-2 px-4 py-3 text-center text-muted">
            <Icon name="lock-fill" /> Žaidimas jau prasidėjo - spėjimų keisti
            negalima.
          </div>
          {prediction !== null && prediction.home !== '' ? (
            <div className="mt-4 text-center">
              <span className="text-[1.75rem] font-bold">
                {prediction.home} : {prediction.away}
              </span>
              <div className="mt-1 text-[0.82rem] text-muted">
                Jūsų spėjimas
              </div>
            </div>
          ) : null}
        </>
      ) : prediction !== null ? (
        <SingleGameForm
          form={{
            game: game.game,
            homeTeam: game.home,
            awayTeam: game.away,
            home: prediction.home,
            away: prediction.away,
          }}
        />
      ) : (
        <div className="rounded-[6px] border border-warn bg-warn-tint px-4 py-3 text-center text-warn">
          Spėjimas nerastas. Bandykite dar kartą nuo{' '}
          <a href={PLAYER_HOME} className="text-accent underline">
            pagrindinio puslapio
          </a>
          .
        </div>
      )}
    </div>
  );
}
