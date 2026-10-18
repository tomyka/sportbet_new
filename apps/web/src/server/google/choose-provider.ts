import type { GoogleEnv } from '../../google-env';
import { fixtureGoogleProvider } from './google-fixture';
import { liveGoogleProvider } from './google-live';
import type { OAuthProvider, ProviderWorld } from './provider';

/** The provider the settings name: `live` is the only one that talks to Google. */
export function chooseProvider(
  env: GoogleEnv,
  world: ProviderWorld,
): OAuthProvider {
  return env.provider === 'live'
    ? liveGoogleProvider(env, world)
    : fixtureGoogleProvider(world);
}
