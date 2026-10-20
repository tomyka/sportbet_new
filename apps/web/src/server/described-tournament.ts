import { findDescribedTournament } from '@sportbet/db';
import { loadDashboardLeague } from '@sportbet/db/league';
import type { DescribedTournament } from '@sportbet/db/tournament';
import {
  helpPage,
  rulesPage,
  type FeePanel,
  type HelpPage,
  type RulesPage,
} from '@sportbet/domain';
import { now } from './clock';
import { getDb } from './db';
import { requestContext, signedInPlayer } from './request-context';
import { hubViewer } from './viewer';

/**
 * Tournament::forVisitor (R-106, R-128): the tournament /rules and /help
 * describe, with its facts - the request's tournament for a player (R-28,
 * R-46), else the first hub card not yet finished that the viewer may see
 * (`findDescribedTournament`). Null with no tournament at all.
 */
async function describedTournament(): Promise<DescribedTournament | null> {
  const context = await requestContext();
  return findDescribedTournament(getDb(), {
    own: context.tournament?.tournament ?? null,
    viewer: await hubViewer(),
    now: now(),
  });
}

/** What /rules draws: the page, whether the viewer is signed in, and their league's fee panel. */
export interface RulesPageData {
  readonly page: RulesPage;
  readonly player: boolean;
  /** R-104, R-124: a signed-in player in a tournament with a league; never a guest's. */
  readonly panel: FeePanel | null;
}

/**
 * Every figure is `rulesPage`'s (R-100), for the
 * tournament the visitor is in or would join; with none, the page still
 * answers, without the table length and the deadline round.
 */
export async function loadRulesPageData(): Promise<RulesPageData> {
  const signedIn = await signedInPlayer();
  const described = await describedTournament();
  const page = rulesPage(described?.facts ?? null);
  if (signedIn === null || described === null) {
    return { page, player: signedIn !== null, panel: null };
  }
  const { panel } = await loadDashboardLeague(getDb(), {
    player: signedIn.player,
    tournament: described.tournament,
  });
  return { page, player: true, panel };
}

/** What /help says of the standings and of survival, for the tournament the visitor is in or would join. */
export async function loadHelpPageData(): Promise<HelpPage> {
  return helpPage((await describedTournament())?.facts ?? null);
}
