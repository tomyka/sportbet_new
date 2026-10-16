import type { SignedInPlayer } from '@sportbet/db';
import { instantFrom, ok, playerId, refuse } from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { saveNotifications, type NotificationsWorld } from './notifications';
import type { ProfileRequest } from './profile-action';

const ME = unwrap(playerId('7'));
const PLAYER: SignedInPlayer = {
  player: ME,
  name: 'Jonas',
  surname: 'Petraitis',
  role: 'player',
  lastTournament: null,
};

const requestOf = (fields: Record<string, string>): ProfileRequest => {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  return {
    player: PLAYER,
    form,
    ip: '203.0.113.9',
    at: unwrap(instantFrom('2026-10-16T12:00:00Z')),
  };
};

const worldOf = (unknownPlayer = false) => {
  const written: { player: unknown; on: boolean }[] = [];
  const world: NotificationsWorld = {
    setReminders: (player, on) => {
      written.push({ player, on });
      return Promise.resolve(
        unknownPlayer ? refuse('unknown-player') : ok(undefined),
      );
    },
  };
  return { world, written };
};

// UserProfileController::updateNotifications: `$request->boolean(...)`.
describe('saveNotifications', () => {
  it.each(['1', 'true', 'on', 'yes', 'TRUE', ' On '])(
    'turns reminders on for the posted %j and says so',
    async (value) => {
      const { world, written } = worldOf();
      expect(
        await saveNotifications(requestOf({ receive_reminders: value }), world),
      ).toEqual({
        kind: 'redirect',
        to: '/userProfile',
        flash: { kind: 'notifications-saved' },
      });
      expect(written).toEqual([{ player: ME, on: true }]);
    },
  );

  it.each([
    [{}],
    [{ receive_reminders: '' }],
    [{ receive_reminders: '0' }],
    [{ receive_reminders: 'off' }],
    [{ receive_reminders: 'maybe' }],
  ])(
    'turns reminders off for an absent or false checkbox %j',
    async (fields) => {
      const { world, written } = worldOf();
      await saveNotifications(requestOf(fields), world);
      expect(written).toEqual([{ player: ME, on: false }]);
    },
  );

  it('goes home when no account has the player', async () => {
    const { world } = worldOf(true);
    expect(await saveNotifications(requestOf({}), world)).toEqual({
      kind: 'redirect',
      to: '/',
      flash: null,
    });
  });
});
