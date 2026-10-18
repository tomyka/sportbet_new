import { leagueNo, player } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { mapSportbet, type Mapped, type MappedTournament } from '../src/map';
import type { SportbetTable } from '../src/read-columns';
import type { DumpTable } from './fixtures/create-tables';
import {
  EUROLEAGUE,
  IDS,
  readRows,
  syntheticDump,
  type Dump,
  type DumpRow,
} from './fixtures/sportbet-dump';

const map = (dump: Dump = syntheticDump()) => mapSportbet(readRows(dump));

/** The dump with one table's rows changed. */
function changed(
  table: DumpTable,
  rows: (current: readonly DumpRow[]) => readonly DumpRow[],
): Dump {
  const dump = syntheticDump();
  return { ...dump, [table]: rows(dump[table]) };
}

const countOf = (mapped: Mapped, table: SportbetTable) => {
  const count = mapped.tables.find((each) => each.table === table);
  if (count === undefined) throw new Error(`no count for ${table}`);
  return count;
};

const euroleague = (mapped: Mapped): MappedTournament => {
  const found = mapped.tournaments.find(
    ({ tournament }) => tournament.id === EUROLEAGUE,
  );
  if (found === undefined) throw new Error('no Euroleague tournament mapped');
  return found;
};

const GOLDEN_LEAGUE = 2;
const FRIENDS = 3;

const leagueOf = (mapped: Mapped, id: number) => {
  const found = euroleague(mapped).leagues.find(
    ({ league }) => league.id === id,
  );
  if (found === undefined) throw new Error(`no league ${String(id)}`);
  return found;
};

describe('map: leagues, invites and messages (#29, R-103)', () => {
  it('maps a private league with its fee, payment details and owner, and its members with their flags and the amount paid in exact cents', () => {
    const { league, members } = leagueOf(map(), FRIENDS);
    expect(league).toMatchObject({
      name: 'Draugu lyga',
      kind: { public: false, owner: '1' },
      fee: { base: 10, penaltyStep: 2, reward: 'Sentinel-Reward ąčęėįšųūž' },
      payment: {
        beneficiary: 'Sentinel-Beneficiary',
        iban: 'LT00SENTINEL0IBAN',
        note: 'Sentinel-Payment-Note ąčęėįšųūž ĄČĘĖĮŠŲŪŽ',
      },
    });
    expect(
      members.map(({ id, player: who, isAdmin, isGuest, paid }) => ({
        id,
        player: who,
        isAdmin,
        isGuest,
        paid,
      })),
    ).toEqual([
      { id: 20, player: '1', isAdmin: true, isGuest: false, paid: null },
      { id: 21, player: '3', isAdmin: false, isGuest: false, paid: 1250 },
      { id: 22, player: '4', isAdmin: false, isGuest: true, paid: null },
    ]);
  });

  it('the selection is the tournament member row with active = 1: dan, whose only league it is, selects the private one; cai, active in two, the lowest member id (the public league)', () => {
    expect(euroleague(map()).selections).toEqual(
      new Map([[player(String(IDS.player('dan'))), leagueNo(FRIENDS)]]),
    );
  });

  it('counts how many players had no active league and how many had several, numbers only', () => {
    expect(map().notices).toContain(
      'league selections: 0 players had no active league (the public one is selected), 1 had several (the lowest member id is kept)',
    );
    const noneActive = map(
      changed('league_members', (rows) =>
        rows.map((row) => ({ ...row, active: 0 })),
      ),
    );
    expect(noneActive.notices).toContain(
      'league selections: 4 players had no active league (the public one is selected), 0 had several (the lowest member id is kept)',
    );
    expect(euroleague(noneActive).selections.size).toBe(0);
  });

  it('a player with no public membership gets one: counted as added, and in what reconcile expects', () => {
    const mapped = map();
    expect(euroleague(mapped).leaguesAdded).toEqual({
      leagues: 0,
      members: 1,
    });
    expect(mapped.added).toEqual({ leagues: 0, league_members: 1 });
    expect(mapped.notices).toContain(
      'league memberships added: 1 tournament players had no public membership, 0 tournaments had no public league',
    );
  });

  it('a tournament with no public league has one made: counted as added, with every player a member of it', () => {
    const mapped = map(
      changed('leagues', (rows) =>
        rows.filter((row) => row['id'] !== GOLDEN_LEAGUE),
      ),
    );
    expect(euroleague(mapped).leaguesAdded).toEqual({
      leagues: 1,
      members: 4,
    });
    expect(countOf(mapped, 'leagues')).toMatchObject({
      loaded: 1,
      refused: {},
    });
  });

  it('refuses a second public league of a tournament, and its members depend on it', () => {
    const mapped = map(
      changed('leagues', (rows) =>
        rows.map((row) =>
          row['id'] === FRIENDS
            ? { ...row, is_public: 1, owner_id: null }
            : row,
        ),
      ),
    );
    expect(countOf(mapped, 'leagues')).toMatchObject({
      refused: { 'second-public-league': 1 },
      refusals: [{ reason: 'second-public-league', row: 'id 3' }],
    });
    expect(countOf(mapped, 'league_members').refused).toEqual({
      'depends-on-refused (second-public-league)': 3,
    });
  });

  it.each([
    ['name', { name: '' }],
    ['public-has-owner', { is_public: 1 }],
    ['base-fee', { base_fee: -1 }],
    ['iban', { payment_iban: 'L'.repeat(35) }],
  ])(
    'refuses a league with a broken %s by name, and its members, invites and messages with it',
    (reason, change) => {
      const mapped = map(
        changed('leagues', (rows) =>
          rows.map((row) =>
            row['id'] === FRIENDS ? { ...row, ...change } : row,
          ),
        ),
      );
      expect(countOf(mapped, 'leagues').refusals).toEqual([
        { reason, row: 'id 3' },
      ]);
      const inherited = `depends-on-refused (${reason})`;
      expect(countOf(mapped, 'league_members').refused).toEqual({
        [inherited]: 3,
      });
      expect(countOf(mapped, 'league_invites').refused).toEqual({
        [inherited]: 1,
      });
      expect(countOf(mapped, 'messages').refused).toEqual({ [inherited]: 1 });
    },
  );

  it('refuses a member whose amount paid is no amount, by its member id, and keeps the rest', () => {
    const mapped = map(
      changed('league_members', (rows) =>
        rows.map((row) =>
          row['id'] === 21 ? { ...row, paid_amount: '-1.00' } : row,
        ),
      ),
    );
    expect(countOf(mapped, 'league_members').refusals).toEqual([
      { reason: 'bad-paid-amount', row: 'id 21' },
    ]);
    expect(leagueOf(mapped, FRIENDS).members.map(({ id }) => id)).toEqual([
      20, 22,
    ]);
  });

  it('a private league whose owner is not one of its members loses the owner, as a notice counts', () => {
    const mapped = map(
      changed('league_members', (rows) =>
        rows.filter((row) => row['id'] !== 20),
      ),
    );
    expect(leagueOf(mapped, FRIENDS).league.kind).toEqual({
      public: false,
      owner: null,
    });
    expect(mapped.notices).toContain(
      'leagues: 1 private leagues whose owner is not a member lose the owner',
    );
  });

  it('keeps only the pending invites, for a loaded invitee: the declined one is skipped, an invite to a user in no tournament too', () => {
    const mapped = map();
    expect(mapped.invites).toEqual([
      expect.objectContaining({ id: 1, invitee: '2', invitedBy: '1' }),
    ]);
    expect(countOf(mapped, 'league_invites')).toMatchObject({
      loaded: 1,
      skipped: { 'not-pending': 1 },
    });
    const toEve = map(
      changed('league_invites', (rows) =>
        rows.map((row) => ({ ...row, status: 'pending' })),
      ),
    );
    expect(countOf(toEve, 'league_invites')).toMatchObject({
      loaded: 1,
      skipped: { 'invitee-not-loaded': 1 },
    });
  });

  it('an inviter who is not loaded is none, counted', () => {
    const mapped = map(
      changed('league_invites', (rows) =>
        rows.map((row) => ({ ...row, invited_by_id: null })),
      ),
    );
    expect(mapped.invites[0]?.invitedBy).toBeNull();
    expect(mapped.notices).toContain(
      'league_invites: 1 pending invites with no inviter loaded',
    );
  });

  it('keeps a message of a league and a detached one, active or not, and skips the football one', () => {
    const mapped = map();
    expect(mapped.messages).toEqual([
      {
        id: 1,
        league: leagueNo(FRIENDS),
        text: 'Sentinel-Message-League ąčęėįšųūž ĄČĘĖĮŠŲŪŽ',
        active: true,
      },
      {
        id: 2,
        league: null,
        text: 'Sentinel-Message-Detached – „kabutės“ ąčęėįšųūž',
        active: false,
      },
    ]);
    expect(countOf(mapped, 'messages')).toMatchObject({
      loaded: 2,
      skipped: { 'not-euroleague': 1 },
    });
  });

  it('refuses a message whose text is empty, by its id', () => {
    const mapped = map(
      changed('messages', (rows) =>
        rows.map((row) => (row['id'] === 2 ? { ...row, message: '' } : row)),
      ),
    );
    expect(countOf(mapped, 'messages').refusals).toEqual([
      { reason: 'bad-text', row: 'id 2' },
    ]);
  });
});
