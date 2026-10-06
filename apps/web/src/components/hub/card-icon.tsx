import { Icon, type IconName } from '../shell/icon';

const TONE = { accent: 'text-accent', warn: 'text-warn' } as const;

/**
 * .sb-card-icon: a card or panel title's icon, a little larger than the
 * text, in the accent; `warn` is .sb-card-icon--trophy, the leaders' trophy.
 */
export function CardIcon({
  name,
  tone = 'accent',
}: {
  name: IconName;
  tone?: keyof typeof TONE;
}) {
  return (
    <span className={`me-1 text-[1.1em] ${TONE[tone]}`}>
      <Icon name={name} />
    </span>
  );
}
