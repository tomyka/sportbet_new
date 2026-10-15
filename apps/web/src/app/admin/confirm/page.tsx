import type { JSX } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import {
  ConfirmGone,
  ConfirmView,
} from '../../../components/admin/confirm-view';
import { ADMIN_PATH } from '../../../components/shell/shell-paths';
import { loadConfirmPage } from '../../../server/admin/confirm/confirm-page';
import { readFlash } from '../../../server/flash';

/**
 * The emailed confirmation's page (R-26 amended), decided by
 * loadConfirmPage: the pending action and its code box, or home, or the
 * dashboard when there is nothing to confirm, or - for a target deleted
 * since the ask - what is missing and no code box.
 */
export default async function AdminConfirmPage(): Promise<JSX.Element> {
  await connection();
  const shown = await loadConfirmPage();
  if (shown.kind === 'home') redirect('/');
  if (shown.kind === 'dashboard') redirect(ADMIN_PATH);
  if (shown.kind === 'gone') return <ConfirmGone text={shown.text} />;
  return (
    <ConfirmView description={shown.description} flash={await readFlash()} />
  );
}
