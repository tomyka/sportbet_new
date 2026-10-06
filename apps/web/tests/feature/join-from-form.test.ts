import { listPlayerSettings, type PlayerViewer } from '@sportbet/db';
import { useTestDatabase } from '@sportbet/db/testing';
import { ruledRules } from '@sportbet/domain';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PLAYER_HOME } from '../../src/components/shell/shell-paths';
import { now } from '../../src/server/clock';
import { cryptoDice } from '../../src/server/dice';
import { joinFromForm } from '../../src/server/joining/join-from-form';
import { JONAS_ACCOUNT, saveAccounts } from '../support/accounts';
import { ACTIVE_PROFILE, withProfile } from '../support/hub';
import {
  CLOSED,
  LATER,
  saveTournamentWithGames,
  type PlannedTournament,
} from '../support/registration';

// The registration form's submit as a use case (TournamentController::
// register): the step from the domain, the join through
// registerForTournament, the last-used tournament, and the message and
// page to answer with - against the test database, without the route.

const { db, client } = useTestDatabase();

const JONAS: PlayerViewer = { player: JONAS_ACCOUNT.id, isAdmin: false };

const submitted = (
  tournament: PlannedTournament,
  confirm: string | null,
  viewer: PlayerViewer = JONAS,
) =>
  joinFromForm(db, {
    viewer,
    slug: tournament.tournament.slug,
    confirm,
    now: now(),
    rules: ruledRules,
    dice: cryptoDice,
  });

const places = async (tournament: number) =>
  z
    .array(z.object({ n: z.int() }))
    .parse(
      (
        await client.query(
          'select count(*)::int as n from tournament_players where player_id = 1 and tournament_id = $1',
          [tournament],
        )
      ).rows,
    )[0]?.n;

const lastTournament = async () =>
  (await listPlayerSettings(db))[0]?.lastTournament ?? null;

beforeEach(async () => {
  await saveAccounts(db, [JONAS_ACCOUNT]);
  for (const planned of [LATER, CLOSED]) {
    await saveTournamentWithGames(db, planned);
    await withProfile(db, planned.tournament.slug, ACTIVE_PROFILE);
  }
});

describe('joinFromForm', () => {
  it('confirmed and open: joins, makes it the last used, and answers "registered" at the player\'s home', async () => {
    expect(await submitted(LATER, '1')).toEqual({
      kind: 'answered',
      flash: { kind: 'registered', tournament: LATER.tournament.name },
      location: PLAYER_HOME,
    });
    expect(await places(LATER.id)).toBe(1);
    expect(await lastTournament()).toBe(LATER.id);
  });

  it('unconfirmed: back to the form with "confirm-required", nothing written', async () => {
    for (const confirm of [null, '', '0', 'off']) {
      expect(await submitted(LATER, confirm)).toEqual({
        kind: 'answered',
        flash: { kind: 'confirm-required' },
        location: `/tournament/${LATER.tournament.slug}/register`,
      });
    }
    expect(await places(LATER.id)).toBe(0);
    expect(await lastTournament()).toBeNull();
  });

  it('a newcomer after the close: home with "registration-closed", nothing written', async () => {
    expect(await submitted(CLOSED, '1')).toEqual({
      kind: 'answered',
      flash: { kind: 'registration-closed' },
      location: '/',
    });
    expect(await places(CLOSED.id)).toBe(0);
    expect(await lastTournament()).toBeNull();
  });

  it('a member after the close is taken in (R-53): the last used, "registered", no second place', async () => {
    await client.query(
      'insert into tournament_players (tournament_id, player_id, switched_off, admin_hidden, fill_ins) values ($1, 1, false, false, 0)',
      [CLOSED.id],
    );
    expect(await submitted(CLOSED, '1')).toEqual({
      kind: 'answered',
      flash: { kind: 'registered', tournament: CLOSED.tournament.name },
      location: PLAYER_HOME,
    });
    expect(await places(CLOSED.id)).toBe(1);
    expect(await lastTournament()).toBe(CLOSED.id);
  });

  it('an unknown tournament, or one the viewer may not see (R-50), is not found', async () => {
    expect(
      await joinFromForm(db, {
        viewer: JONAS,
        slug: 'no-such',
        confirm: '1',
        now: now(),
        rules: ruledRules,
        dice: cryptoDice,
      }),
    ).toEqual({ kind: 'not-found' });
    await withProfile(db, LATER.tournament.slug, {
      ...ACTIVE_PROFILE,
      isPublic: false,
    });
    expect(await submitted(LATER, '1')).toEqual({ kind: 'not-found' });
    expect(await places(LATER.id)).toBe(0);
  });
});
