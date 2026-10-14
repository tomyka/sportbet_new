import { describe, expect, it } from 'vitest';
import { PlayerStatus } from '../player/player-status';
import { ruledRules, sportbetRules, type RuleSet } from '../rules/rule-set';
import { playerId, tournamentId, type PlayerId } from '../shared/ids';
import { leagueRoster } from './roster';

function must<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('expected an accepted result');
  return result.value;
}

const tournament = must(tournamentId('7'));
const full = must(playerId('1'));
const guest = must(playerId('2'));
const away = must(playerId('3'));
const hidden = must(playerId('4'));
const nobody = must(playerId('9'));

const switchedOff = (rules: RuleSet) =>
  must(
    PlayerStatus.stored(
      {
        switchedOffIn: new Set([tournament]),
        adminHidden: false,
        fillIns: new Map(),
      },
      rules,
    ),
  );

function roster(
  rules: RuleSet,
  viewerIsGuest: boolean,
  members: readonly { player: PlayerId; isGuest: boolean }[],
) {
  const statuses = new Map<PlayerId, PlayerStatus>([
    [full, PlayerStatus.NEW],
    [guest, PlayerStatus.NEW],
    [away, switchedOff(rules)],
    [hidden, PlayerStatus.NEW.hiddenByAdmin(rules)],
  ]);
  return leagueRoster({ members, statuses, viewerIsGuest, tournament, rules });
}

describe.each([
  ['sportbetRules', sportbetRules],
  ['ruledRules', ruledRules],
])('leagueRoster under %s', (_name, rules) => {
  const members = [
    { player: full, isGuest: false },
    { player: guest, isGuest: true },
  ];

  it('shows a full member the full members only', () => {
    expect(roster(rules, false, members)).toEqual(new Set([full]));
  });

  it('shows a guest everyone listed', () => {
    expect(roster(rules, true, members)).toEqual(new Set([full, guest]));
  });

  it('leaves out a member switched off (R-7) or hidden by an admin (R-19), at both levels', () => {
    const withOthers = [
      ...members,
      { player: away, isGuest: false },
      { player: hidden, isGuest: true },
    ];
    expect(roster(rules, false, withOthers)).toEqual(new Set([full]));
    expect(roster(rules, true, withOthers)).toEqual(new Set([full, guest]));
  });

  it('is empty for a league with no members', () => {
    expect(roster(rules, true, [])).toEqual(new Set());
  });

  it('throws for a member with no status: an impossible state', () => {
    expect(() =>
      roster(rules, true, [{ player: nobody, isGuest: false }]),
    ).toThrow(/no status/);
  });
});
