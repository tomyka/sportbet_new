import type { JSX } from 'react';
import { helpPage } from '@sportbet/domain';
import { connection } from 'next/server';
import { HelpView } from '../../components/help/help-view';
import { describedTournament } from '../../server/visitor-tournament';

/**
 * HelpController::index: public. What it says of the standings and of
 * survival is `helpPage`'s, for the tournament the visitor is in or would
 * join (describedTournament); with none, the table length and the deadline
 * round are left out and no survival is described.
 */
export default async function HelpRoute(): Promise<JSX.Element> {
  await connection();
  const described = await describedTournament();
  return (
    <HelpView
      help={helpPage(
        described === null
          ? {
              teamCount: null,
              deadlineRound: null,
              standingsCloses: null,
              survival: false,
            }
          : described.facts,
      )}
    />
  );
}
