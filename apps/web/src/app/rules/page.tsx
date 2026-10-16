import type { JSX } from 'react';
import { connection } from 'next/server';
import { RulesView } from '../../components/rules/rules-view';
import { loadRulesPageData } from '../../server/described-tournament';

/** RulesController::index: public (the data: loadRulesPageData). */
export default async function RulesRoute(): Promise<JSX.Element> {
  await connection();
  const { page, player, panel } = await loadRulesPageData();
  return <RulesView page={page} player={player} panel={panel} />;
}
