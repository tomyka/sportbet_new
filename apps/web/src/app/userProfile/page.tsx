import type { JSX } from 'react';
import { loadProfile } from '@sportbet/db/account';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { ProfileView } from '../../components/profile/profile-view';
import { getDb } from '../../server/db';
import { readFlash } from '../../server/flash';
import { signedInPlayer } from '../../server/request-context';
import { signInAndReturn } from '../../server/sign-in/guarded-pages';

/**
 * UserProfileController::getUserProfile, behind sportbet's `auth`: a guest
 * goes to sign in and comes back here (the return path, #16); a player sees
 * their own profile, the account the session names and no other, with the
 * one-time message or the refusals the last post left.
 */
export default async function UserProfilePage(): Promise<JSX.Element> {
  await connection();
  const signedIn = await signedInPlayer();
  if (signedIn === null) redirect(signInAndReturn('profile'));
  const profile = await loadProfile(getDb(), signedIn.player);
  if (profile === undefined) notFound();
  return <ProfileView profile={profile} flash={await readFlash()} />;
}
