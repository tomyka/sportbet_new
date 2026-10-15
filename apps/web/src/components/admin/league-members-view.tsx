import type { JSX } from 'react';
import Link from 'next/link';
import type { AdminLeagueMember, AdminLeagueMembers } from '@sportbet/db';
import type { Flash } from '../../server/flash';
import { vilniusDate } from '../format/vilnius-time';
import { FlashAlert } from '../hub/flash-alert';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { ADMIN_LEAGUE_GUEST_PATH, ADMIN_LEAGUES_PATH } from './admin-paths';
import { TABLE, TD, TH, TITLE_ROW } from './admin-styles';

const BADGE =
  'badge ml-1.5 rounded-full border border-border px-1.5 py-px text-[0.66rem] font-bold text-muted';

/** What the member is in the league: its owner, an admin of it (R-105), or a guest (R-87). */
function Badges({ row }: { row: AdminLeagueMember }): JSX.Element {
  return (
    <>
      {row.isOwner ? <span className={BADGE}>savininkas</span> : null}
      {row.member.isAdmin && !row.isOwner ? (
        <span className={BADGE}>administratorius</span>
      ) : null}
      {row.member.isGuest ? <span className={BADGE}>svečias</span> : null}
    </>
  );
}

/** The "Svečias" switch (R-87): a post that marks the member a guest, or a full member again; its box says what it would do. */
function GuestSwitch({ row }: { row: AdminLeagueMember }): JSX.Element {
  const { member } = row;
  return (
    <form method="post" action={ADMIN_LEAGUE_GUEST_PATH} className="m-0">
      <input type="hidden" name="leagueID" value={String(member.league)} />
      <input type="hidden" name="userID" value={member.player} />
      <input type="hidden" name="guest" value={member.isGuest ? '0' : '1'} />
      <button
        type="submit"
        role="switch"
        aria-checked={member.isGuest}
        aria-label="Svečias"
        className="inline-flex cursor-pointer items-center gap-2 border-none bg-transparent text-[0.8rem] font-semibold text-text"
      >
        <span
          aria-hidden="true"
          className={`relative inline-block h-4 w-7 rounded-full border border-border ${member.isGuest ? 'bg-accent' : 'bg-surface-2'}`}
        >
          <span
            className={`absolute top-px h-3 w-3 rounded-full bg-card transition-[left] ${member.isGuest ? 'left-[13px]' : 'left-px'}`}
          />
        </span>
        Svečias
      </button>
    </form>
  );
}

function MemberRow({ row }: { row: AdminLeagueMember }): JSX.Element {
  const { member } = row;
  return (
    <tr data-testid="member-row" data-username={row.username}>
      <td className={TD}>
        <div className="font-semibold">
          {row.username}
          <Badges row={row} />
        </div>
        {row.fullName === '' ? null : (
          <div className="text-[0.75rem] text-muted">{row.fullName}</div>
        )}
      </td>
      <td className={TD}>
        {member.joinedAt === null ? '-' : vilniusDate(member.joinedAt)}
      </td>
      <td className={`${TD} text-right`}>
        <GuestSwitch row={row} />
      </td>
    </tr>
  );
}

/**
 * A league's members for the superadmin (R-87, R-105): who they are, when
 * they joined, who owns it and who is an admin or a guest, and the switch
 * that marks a member a guest. No points change, so the roster narrows and
 * nothing else.
 */
export function LeagueMembersView({
  data,
  flash,
}: {
  data: AdminLeagueMembers;
  flash: Flash | null;
}): JSX.Element {
  return (
    <div className={CARD}>
      <div className={TITLE_ROW}>
        <h1 className={`m-0 flex items-center gap-2 ${CARD_TITLE}`}>
          <Icon name="people" />
          {`Nariai · ${data.league.name}`}
          <span
            data-testid="member-count"
            className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-normal text-muted"
          >
            {data.members.length}
          </span>
        </h1>
        <Link
          href={ADMIN_LEAGUES_PATH}
          className="inline-flex items-center text-[0.8rem] font-semibold text-accent no-underline hover:text-accent-hover"
        >
          <Icon name="arrow-left-short" />
          Lygos
        </Link>
      </div>
      {flash === null ? null : <FlashAlert flash={flash} />}
      {data.members.length === 0 ? (
        <p className="py-3 text-[0.9rem] text-muted">Narių nėra</p>
      ) : (
        <div className="overflow-x-auto">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>Narys</th>
                <th className={TH}>Prisijungė</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {data.members.map((row) => (
                <MemberRow key={row.member.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
