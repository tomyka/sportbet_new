import type { JSX } from 'react';
import { isSuperadmin } from '@sportbet/domain';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ImportPreviewView } from '../../../../components/admin/import/import-preview-view';
import { adminGate } from '../../../../server/admin/gate';
import { readFlash } from '../../../../server/flash';
import { previewImport } from '../../../../server/import/import';

/** The preview reads the feed too: three attempts of 15 s and their pauses are 47 s at the worst. */
export const maxDuration = 60;

/**
 * EuroleagueImportController::preview, behind the superadmin tier (R-26
 * amended): `?season=` read as one text (a repeated one is no code), the
 * plan decided by previewImport. Writes nothing; reached only by the form.
 */
export default async function AdminImportPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  await connection();
  const admin = await adminGate(isSuperadmin);
  if (admin === null) redirect('/');
  const { season } = await searchParams;
  const state = await previewImport(
    admin.player,
    typeof season === 'string' ? season : '',
  );
  return <ImportPreviewView state={state} flash={await readFlash()} />;
}
