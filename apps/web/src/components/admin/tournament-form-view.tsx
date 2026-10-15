import type { JSX } from 'react';
import Link from 'next/link';
import type { AdminTournament } from '@sportbet/db';
import {
  STANDINGS_DEADLINE_ROUND,
  type TournamentStatus,
} from '@sportbet/domain';
import type { Flash } from '../../server/flash';
import { FlashAlert } from '../hub/flash-alert';
import { BUTTON_PRIMARY, CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import {
  ADMIN_TOURNAMENTS_PATH,
  TOURNAMENT_STORE_PATH,
  tournamentUpdatePath,
} from './admin-paths';
import { ACTION_BUTTON, FIELD_INPUT, FIELD_LABEL } from './admin-styles';
import { STATUS_TEXT } from './tournaments-view';

/** What the form's boxes start with. */
interface Start {
  readonly name: string;
  readonly slug: string;
  readonly status: TournamentStatus;
  readonly deadlineRound: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly description: string;
  readonly isPublic: boolean;
  readonly survival: boolean;
}

/** A new tournament: public, upcoming, nothing else. */
const NEW_TOURNAMENT: Start = {
  name: '',
  slug: '',
  status: 'upcoming',
  deadlineRound: '',
  startsOn: '',
  endsOn: '',
  description: '',
  isPublic: true,
  survival: false,
};

function startOf({ tournament, profile }: AdminTournament): Start {
  return {
    name: tournament.name,
    slug: tournament.slug,
    status: profile.status,
    deadlineRound: String(tournament.standingsDeadlineRound ?? ''),
    startsOn: profile.startsOn ?? '',
    endsOn: tournament.endsOn ?? '',
    description: profile.description ?? '',
    isPublic: profile.isPublic,
    survival: tournament.survival,
  };
}

/** R-55: the form offers `upcoming` and `active`; a stored `finished` is shown while it stays. */
const statusesOffered = (stored: TournamentStatus): TournamentStatus[] =>
  stored === 'finished'
    ? ['upcoming', 'active', 'finished']
    : ['upcoming', 'active'];

/** Name, slug, status and the standings deadline round. */
function IdentityFields({ start }: { start: Start }): JSX.Element {
  return (
    <>
      <label className={`${FIELD_LABEL} md:col-span-3`}>
        Pavadinimas
        <input
          name="name"
          defaultValue={start.name}
          required
          maxLength={255}
          className={FIELD_INPUT}
        />
      </label>
      <label className={`${FIELD_LABEL} md:col-span-3`}>
        Slug (URL)
        <input
          name="slug"
          defaultValue={start.slug}
          placeholder="euroleague-2026-27"
          required
          maxLength={100}
          className={FIELD_INPUT}
        />
      </label>
      <label className={`${FIELD_LABEL} md:col-span-2`}>
        Statusas
        <select
          name="status"
          defaultValue={start.status}
          className={FIELD_INPUT}
        >
          {statusesOffered(start.status).map((status) => (
            <option key={status} value={status}>
              {STATUS_TEXT[status]}
            </option>
          ))}
        </select>
      </label>
      <div className="md:col-span-4">
        <label className={FIELD_LABEL}>
          Eigos prognozės užsidaro nuo turo
          <input
            type="number"
            name="standings_deadline_round"
            defaultValue={start.deadlineRound}
            min={1}
            max={255}
            placeholder={String(STANDINGS_DEADLINE_ROUND)}
            className={FIELD_INPUT}
          />
        </label>
        <div className="mt-1 text-[0.75rem] text-muted">
          Tuščia - formato numatytasis.
        </div>
      </div>
    </>
  );
}

/** The two dates, the description and the two switches. */
function DetailFields({ start }: { start: Start }): JSX.Element {
  return (
    <>
      <label className={`${FIELD_LABEL} md:col-span-3`}>
        Pradžia
        <input
          type="date"
          name="start_date"
          defaultValue={start.startsOn}
          className={FIELD_INPUT}
        />
      </label>
      <label className={`${FIELD_LABEL} md:col-span-3`}>
        Pabaiga
        <input
          type="date"
          name="end_date"
          defaultValue={start.endsOn}
          className={FIELD_INPUT}
        />
      </label>
      <label className={`${FIELD_LABEL} md:col-span-6`}>
        Aprašymas
        <textarea
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={start.description}
          className={FIELD_INPUT}
        />
      </label>
      <div className="flex items-center gap-4 md:col-span-6">
        <label className="flex items-center gap-1.5 text-[0.85rem]">
          <input
            type="checkbox"
            name="is_public"
            value="1"
            defaultChecked={start.isPublic}
          />
          Viešas
        </label>
        <label className="flex items-center gap-1.5 text-[0.85rem]">
          <input
            type="checkbox"
            name="survival_game"
            value="1"
            defaultChecked={start.survival}
          />
          Išlikimas
        </label>
      </div>
    </>
  );
}

/**
 * admin/tournaments/form.blade.php: "Naujas turnyras" or "Redaguoti
 * turnyrą" - name, slug, status (R-55), the standings deadline round
 * (empty is the format's own), the two dates, the description, "Viešas"
 * and "Išlikimas". sportbet's sport, standings format and cover image are
 * not carried (decision 11, A23). The boxes post the names adminStore reads.
 */
export function TournamentFormView({
  existing,
  flash,
}: {
  existing: AdminTournament | null;
  flash: Flash | null;
}): JSX.Element {
  const start = existing === null ? NEW_TOURNAMENT : startOf(existing);
  return (
    <div className={CARD}>
      <h1 className={`mb-3 flex items-center gap-2 ${CARD_TITLE}`}>
        <Icon name="globe2" />
        {existing === null ? 'Naujas turnyras' : 'Redaguoti turnyrą'}
      </h1>
      {flash === null ? null : <FlashAlert flash={flash} />}
      <form
        method="post"
        action={
          existing === null
            ? TOURNAMENT_STORE_PATH
            : tournamentUpdatePath(existing.tournament.id)
        }
        className="grid grid-cols-1 gap-3 md:grid-cols-6"
      >
        <IdentityFields start={start} />
        <DetailFields start={start} />
        <div className="flex items-center gap-2 md:col-span-6">
          <button type="submit" className={BUTTON_PRIMARY}>
            {existing === null ? 'Sukurti' : 'Atnaujinti'}
          </button>
          <Link href={ADMIN_TOURNAMENTS_PATH} className={ACTION_BUTTON}>
            Atšaukti
          </Link>
        </div>
      </form>
    </div>
  );
}
