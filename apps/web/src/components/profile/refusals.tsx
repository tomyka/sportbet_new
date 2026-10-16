import type { JSX } from 'react';
import { REFUSAL_ITEM, REFUSALS } from './profile-styles';

/** A bag's refusals, listed as sportbet's `alert alert-danger`: the account form's, the code box's, the danger zone's. */
export function Refusals({
  texts,
}: {
  texts: readonly string[];
}): JSX.Element | null {
  if (texts.length === 0) return null;
  return (
    <div role="alert" className={REFUSALS}>
      <ul className="m-0 list-disc pl-5">
        {texts.map((text) => (
          <li key={text} className={REFUSAL_ITEM}>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
