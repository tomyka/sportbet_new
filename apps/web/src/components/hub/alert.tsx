import type { JSX, ReactNode } from 'react';
import { Icon, type IconName } from '../shell/icon';

/** sportbet's `.alert` box, whose tone the caller's colours give it. */
const ALERT_BOX =
  'mb-4 flex items-center gap-2 rounded-[6px] border px-4 py-2 text-[0.9rem]';

const TONE = {
  ok: 'border-ok bg-ok-tint text-ok',
  bad: 'border-bad bg-bad-tint text-bad',
  accent: 'border-accent bg-accent-tint text-accent',
} as const;

/**
 * sportbet's `alert alert-success` (`session('info')`), `alert alert-danger`
 * (`session('error')`) or `alert alert-primary`, as custom.css colours them: a
 * status, except the danger one, which is an alert.
 */
export function Alert({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof TONE;
  icon: IconName;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`${ALERT_BOX} ${TONE[tone]}`}
    >
      <Icon name={icon} />
      {children}
    </div>
  );
}
