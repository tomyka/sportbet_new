import type { JSX } from 'react';
import { connection } from 'next/server';
import { HelpView } from '../../components/help/help-view';
import { loadHelpPageData } from '../../server/described-tournament';

/** HelpController::index: public (the data: loadHelpPageData). */
export default async function HelpRoute(): Promise<JSX.Element> {
  await connection();
  return <HelpView help={await loadHelpPageData()} />;
}
