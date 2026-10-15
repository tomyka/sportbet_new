import type { JSX } from 'react';
import {
  isNoop,
  type DroppedGame,
  type ImportPlan,
  type PlannedMove,
  type SkippedMove,
  type SkipReason,
} from '@sportbet/domain';
import { vilniusDateTime } from '../../format/vilnius-time';
import { CARD, CARD_TITLE } from '../../hub/styles';
import { Alert } from '../../hub/alert';
import { Icon } from '../../shell/icon';
import { IMPORT_SAVE_PATH } from '../admin-paths';
import { PRIMARY_BUTTON, TABLE, TD, TH, TITLE_ROW } from '../admin-styles';
import { ConfirmForm } from '../confirm-form';

/** sportbet's confirm before the import. */
const QUESTION = 'Importuoti tvarkaraštį į šį turnyrą?';

/** Why a move the feed asks for is not made (R-13): sportbet said only "užrakintos"; each row now says which. */
const REASON_TEXT: Readonly<Record<SkipReason, string>> = {
  scored: 'turi rezultatą',
  postponed: 'atidėtos',
  locked: 'jau prasidėjo',
};

/** One line of the counts: its label, the count, and what the count names, when there is anything to name. */
function Count({
  label,
  count,
  names = [],
}: {
  label: string;
  count: number;
  names?: readonly string[];
}): JSX.Element {
  return (
    <li>
      {label}: <strong>{count}</strong>
      {names.length === 0 ? null : (
        <span className="text-muted"> - {names.join(', ')}</span>
      )}
    </li>
  );
}

/** sportbet's list, and the lines R-94 and R-96 add, shown only when they have something to say. */
function Counts({ plan }: { plan: ImportPlan }): JSX.Element {
  return (
    <ul data-testid="import-counts" className="mb-3 text-[0.88rem]">
      <Count
        label="Naujos komandos"
        count={plan.teamsToCreate.length}
        names={plan.teamsToCreate}
      />
      <Count label="Nauji turai" count={plan.roundsToCreate.length} />
      <Count label="Naujos rungtynės" count={plan.gamesToCreate.length} />
      <Count label="Perkeltos rungtynės" count={plan.moves.length} />
      <Count label="Nepakitusios rungtynės" count={plan.unchanged} />
      {plan.skippedMoves.length === 0 ? null : (
        <Count
          label="Neperkeliamos - jau užrakintos"
          count={plan.skippedMoves.length}
        />
      )}
      {plan.postSeasonLeftOut === 0 ? null : (
        <Count
          label="Atkrintamųjų rungtynių neimportuota"
          count={plan.postSeasonLeftOut}
        />
      )}
      {plan.dropped.length === 0 ? null : (
        <Count label="Tvarkaraštyje nebėra" count={plan.dropped.length} />
      )}
      <Count
        label="Žaidėjai, kuriems bus sukurtos spėjimų eilutės"
        count={plan.playersAffected}
      />
      {plan.teamsWithoutCrest.length === 0 ? null : (
        <Count
          label="Komandos be logotipo"
          count={plan.teamsWithoutCrest.length}
          names={plan.teamsWithoutCrest}
        />
      )}
    </ul>
  );
}

function Moves({ moves }: { moves: readonly PlannedMove[] }): JSX.Element {
  return (
    <div className="mb-3 overflow-x-auto" data-testid="import-moves">
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>Rungtynės</th>
            <th className={TH}>Buvo</th>
            <th className={TH}>Bus</th>
          </tr>
        </thead>
        <tbody>
          {moves.map((move) => (
            <tr key={move.game}>
              <td className={TD}>{move.label}</td>
              <td className={`${TD} text-muted`}>
                {vilniusDateTime(move.from)}
              </td>
              <td className={TD}>
                <strong>{vilniusDateTime(move.to)}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Issue 286: the moves the feed asks for and the import will not make, shown rather than silently dropped. */
function Skipped({
  skipped,
}: {
  skipped: readonly SkippedMove[];
}): JSX.Element {
  return (
    <div
      data-testid="import-skipped"
      className="mb-3 rounded-[6px] border border-warn bg-warn-tint px-3 py-2"
    >
      <div className="mb-2 text-[0.83rem]">
        Šių rungtynių data nebus pakeista: jos jau prasidėjo arba turi
        rezultatą, o spėjimai lieka tokie, kokie buvo.
      </div>
      <div className="overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr>
              <th className={TH}>Rungtynės</th>
              <th className={TH}>Lieka</th>
              <th className={TH}>Tinklelyje</th>
              <th className={TH}>Priežastis</th>
            </tr>
          </thead>
          <tbody>
            {skipped.map((kept) => (
              <tr key={kept.game}>
                <td className={TD}>{kept.label}</td>
                <td className={TD}>
                  <strong>{vilniusDateTime(kept.from)}</strong>
                </td>
                <td className={`${TD} text-muted`}>
                  {vilniusDateTime(kept.to)}
                </td>
                <td className={TD}>{REASON_TEXT[kept.reason]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** R-94: games of the regular season the feed no longer lists; the import never deletes one. */
function Dropped({
  dropped,
}: {
  dropped: readonly DroppedGame[];
}): JSX.Element {
  return (
    <div data-testid="import-dropped" className="mb-3 overflow-x-auto">
      <h2 className="mb-2 text-[0.85rem] font-semibold">
        Tvarkaraštyje nebėra
      </h2>
      <table className={TABLE}>
        <thead>
          <tr>
            <th className={TH}>Turas</th>
            <th className={TH}>Rungtynės</th>
            <th className={TH}>Data</th>
          </tr>
        </thead>
        <tbody>
          {dropped.map((game) => (
            <tr key={game.game}>
              <td className={TD}>{`${String(game.round)} turas`}</td>
              <td className={TD}>{game.label}</td>
              <td className={`${TD} text-muted`}>
                {vilniusDateTime(game.tipOff)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * admin/import.blade.php's "Ką padarys importas": the counts, each list with
 * sportbet's heading, "Viskas jau atnaujinta" when nothing would change, and
 * the import button - carrying the season and this plan's fingerprint, so the
 * save applies only the plan the admin read (R-93) - disabled for a plan with
 * nothing to do. Times are Vilnius's (R-51), where sportbet's were UTC.
 */
export function ImportPlanView({
  plan,
  season,
  fingerprint,
}: {
  plan: ImportPlan;
  season: string;
  fingerprint: string;
}): JSX.Element {
  const noop = isNoop(plan);
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h2 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="list-check" /> Ką padarys importas
        </h2>
      </div>
      {noop ? (
        <Alert tone="accent" icon="info-circle">
          Viskas jau atnaujinta - nieko keisti nereikia.
        </Alert>
      ) : null}
      <Counts plan={plan} />
      {plan.moves.length === 0 ? null : <Moves moves={plan.moves} />}
      {plan.skippedMoves.length === 0 ? null : (
        <Skipped skipped={plan.skippedMoves} />
      )}
      {plan.dropped.length === 0 ? null : <Dropped dropped={plan.dropped} />}
      <ConfirmForm action={IMPORT_SAVE_PATH} question={QUESTION}>
        <input type="hidden" name="season" value={season} />
        <input type="hidden" name="fingerprint" value={fingerprint} />
        <button
          type="submit"
          disabled={noop}
          className={`${PRIMARY_BUTTON} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          <Icon name="cloud-download" /> Importuoti
        </button>
      </ConfirmForm>
    </div>
  );
}
