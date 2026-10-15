import type { ThrottleLimit } from '../account/sign-in-throttle';
import type { PlayerId } from '../shared/ids';

/**
 * Slice 15: previews of the Euroleague import, 10 a minute per account, so a
 * held key cannot hammer the feed. Counted after the season code passes. The
 * save counts against `adminWriteLimits`. sportbet sets no limit.
 */
export function importPreviewLimits(
  player: PlayerId,
): readonly ThrottleLimit[] {
  return [
    {
      key: `import-preview:player:${player}`,
      maxAttempts: 10,
      windowSeconds: 60,
    },
  ];
}
