import {
  feePanel,
  messageTextInvariant,
  type FeePanel,
  type LeagueId,
  type PlayerId,
  type Tournament,
} from '@sportbet/domain';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Executor } from '../client';
import { memberColumns, memberRows, readMember, leagueOf } from './list';
import { findLeague } from './locked';
import { rosterLeagueOf } from './roster';
import { leagueMembers, messages } from './schema';

const messageRows = z.array(z.object({ text: messageTextInvariant.schema }));

/**
 * `MessageController::getProfileMessages`: the league's active messages, in
 * id order, as the texts (R-122: always listed, fee or not).
 */
async function activeMessages(
  db: Executor,
  league: LeagueId,
): Promise<readonly string[]> {
  return messageRows
    .parse(
      await db
        .select({ text: messages.text })
        .from(messages)
        .where(and(eq(messages.leagueId, league), eq(messages.active, true)))
        .orderBy(asc(messages.id)),
    )
    .map(({ text }) => text);
}

/**
 * What `/main` shows of the viewer's selected league beside its tables: the
 * fee panel (`feePanel`, R-104, R-124) and the league's active messages.
 * The league is the viewer's selection in the tournament; a viewer who plays
 * no part reads the public league at full-member level (as `loadRoster`),
 * and one with no membership in it has no panel (sportbet's `$groupDetails`
 * is for a member), only the messages. Read with no lock.
 */
export async function loadDashboardLeague(
  db: Executor,
  query: {
    readonly player: PlayerId;
    readonly tournament: Tournament;
  },
): Promise<{
  readonly panel: FeePanel | null;
  readonly messages: readonly string[];
}> {
  const read = await rosterLeagueOf(db, query.tournament, {
    selectedBy: query.player,
  });
  if (read === null) return { panel: null, messages: [] };
  const id = leagueOf(read.league);
  const league = await findLeague(db, id);
  const members = memberRows
    .parse(
      await db
        .select(memberColumns)
        .from(leagueMembers)
        .where(eq(leagueMembers.leagueId, read.league))
        .orderBy(asc(leagueMembers.id)),
    )
    .map(readMember);
  const viewer = members.find((member) => member.player === query.player);
  return {
    panel:
      league === null || viewer === undefined
        ? null
        : feePanel({
            league: league.league,
            viewer,
            members,
          }),
    messages: await activeMessages(db, id),
  };
}
