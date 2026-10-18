// The synthetic dump's leagues (#29): the football crowd league, the golden
// public league and a private one, with their members, invites and messages.

import { GOLDEN } from '@sportbet/domain/testing';
import type { Dump } from './dump-format';
import { EUROLEAGUE, IDS } from './synthetic-ids';

/** The private league's payment details (sportbet 3eb95e7), read under R-103 into the throwaway Postgres only. */
/** eve's sportbet id: the user after the golden players. */
const EVE = GOLDEN.players.length + 1;

export const PAYMENT = {
  payment_beneficiary: 'Sentinel-Beneficiary',
  payment_iban: 'LT00SENTINEL0IBAN',
  payment_note: 'Sentinel-Payment-Note ąčęėįšųūž ĄČĘĖĮŠŲŪŽ',
} as const;
/** The three messages' texts: sentinels, under the payment details' rules (R-103). */
export const MESSAGES = [
  'Sentinel-Message-League ąčęėįšųūž ĄČĘĖĮŠŲŪŽ',
  'Sentinel-Message-Detached – „kabutės“ ąčęėįšųūž',
  'Sentinel-Message-Football ąčęėįšųūž',
] as const;

/**
 * The football crowd league, the golden public league and a private one
 * (#29): its owner and admin ada, a fee, a reward and sentinel payment
 * details; cai a full member who paid 12.50 and is active in both leagues
 * (the lowest member id is kept), dan a guest whose only league it is (so
 * no public membership, and the private league is selected), a pending
 * invite for ben and a declined one for eve, and three messages: the
 * private league's, a detached one and the football league's.
 */
export function leagueRows(): Pick<
  Dump,
  'leagues' | 'league_members' | 'league_invites' | 'messages'
> {
  return {
    leagues: leagues(),
    league_members: leagueMembers(),
    league_invites: leagueInvites(),
    messages: messages(),
  };
}

function leagues(): Dump['leagues'] {
  return [
    {
      id: 1,
      tournament_id: 1,
      name: 'Crowd',
      is_public: 0,
      use_league_odds: 1,
    },
    {
      id: 2,
      tournament_id: EUROLEAGUE,
      name: 'Golden league',
      is_public: 1,
      use_league_odds: 0,
      created_at: '2026-09-01 10:00:00',
    },
    {
      id: 3,
      tournament_id: EUROLEAGUE,
      name: 'Draugu lyga',
      description: 'Sentinel-League-Description ąčęėįšųūž',
      is_public: 0,
      owner_id: IDS.player('ada'),
      base_fee: 10,
      penalty_step: 2,
      reward_description: 'Sentinel-Reward ąčęėįšųūž',
      ...PAYMENT,
      created_at: '2026-09-02 10:00:00',
    },
  ];
}

function leagueMembers(): Dump['league_members'] {
  return [
    { id: 1, league_id: 1, user_id: 6, is_admin: 0, is_guest: 0, active: 1 },
    { id: 2, league_id: 1, user_id: 3, is_admin: 0, is_guest: 0, active: 1 },
    // The golden league's members: every golden player but dan.
    ...GOLDEN.players
      .filter((name) => name !== 'dan')
      .map((name, index) => ({
        id: index + 3,
        league_id: 2,
        user_id: IDS.player(name),
        is_admin: 0,
        is_guest: 0,
        active: 1,
      })),
    {
      id: 20,
      league_id: 3,
      user_id: IDS.player('ada'),
      is_admin: 1,
      is_guest: 0,
      active: 0,
      created_at: '2026-09-02 10:00:00',
    },
    {
      id: 21,
      league_id: 3,
      user_id: IDS.player('cai'),
      is_admin: 0,
      is_guest: 0,
      active: 1,
      paid_amount: '12.50',
      created_at: '2026-09-03 10:00:00',
    },
    {
      id: 22,
      league_id: 3,
      user_id: IDS.player('dan'),
      is_admin: 0,
      is_guest: 1,
      active: 1,
      created_at: '2026-09-04 10:00:00',
    },
  ];
}

function leagueInvites(): Dump['league_invites'] {
  return [
    {
      id: 1,
      league_id: 3,
      invited_user_id: IDS.player('ben'),
      invited_by_id: IDS.player('ada'),
      status: 'pending',
      created_at: '2026-09-05 10:00:00',
    },
    {
      id: 2,
      league_id: 3,
      invited_user_id: EVE,
      invited_by_id: IDS.player('ada'),
      status: 'declined',
    },
  ];
}

function messages(): Dump['messages'] {
  return [
    { id: 1, league_id: 3, message: MESSAGES[0], active: 1 },
    { id: 2, league_id: null, message: MESSAGES[1], active: 0 },
    { id: 3, league_id: 1, message: MESSAGES[2], active: 1 },
  ];
}
