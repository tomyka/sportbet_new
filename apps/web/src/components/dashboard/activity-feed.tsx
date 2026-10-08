import type { JSX } from 'react';
import type { ActivityFeed as Feed } from '@sportbet/domain';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon, type IconName } from '../shell/icon';

const ITEM =
  'flex items-start gap-2 border-b border-border py-[7px] last:border-b-0';

/** .af-icon: sportbet's emoji, drawn as the icon of the same meaning. */
function FeedIcon({ name }: { name: IconName }) {
  return (
    <span className="shrink-0 text-[1rem] leading-[1.5] text-accent">
      <Icon name={name} />
    </span>
  );
}

/**
 * partials/activity-feed.blade.php's "Aktyvumas" (ActivityFeedController):
 * the bingos of the latest scored games, each game's line and its players,
 * then the live runs, "username serija ×N". Nothing when both are empty.
 */
export function ActivityFeed({ feed }: { feed: Feed }): JSX.Element | null {
  if (feed.bingos.length === 0 && feed.runs.length === 0) return null;
  return (
    <div data-panel="activity-feed" className={CARD}>
      <div className={`mb-3 ${CARD_TITLE}`}>
        <CardIcon name="lightning-fill" /> Aktyvumas
      </div>
      <div className="flex flex-col">
        {feed.bingos.map((bingo) => (
          <div key={bingo.game} data-testid="feed-item" className={ITEM}>
            <FeedIcon name="bullseye" />
            <div className="text-[0.78rem] leading-[1.4]">
              <div className="text-muted">{bingo.line}</div>
              <div className="mt-px text-[0.75rem] font-semibold">
                {bingo.players}
              </div>
            </div>
          </div>
        ))}
        {feed.runs.map((run) => (
          <div key={run.username} data-testid="feed-item" className={ITEM}>
            <FeedIcon name="fire" />
            <div className="text-[0.78rem] leading-[1.4]">
              <span className="font-bold">{run.username}</span>
              <span className="text-muted">{` serija ×${String(run.length)}`}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
