import type { JSX } from 'react';

/**
 * partials/messages.blade.php: the league's active messages, one bold line
 * each (the old `<B>`), in the order given and as text, never HTML (R-122:
 * always shown, fee or not). Nothing for none.
 */
export function LeagueMessages({
  messages,
}: {
  messages: readonly string[];
}): JSX.Element | null {
  if (messages.length === 0) return null;
  return (
    <div className="grid gap-1">
      {messages.map((message, index) => (
        // A message is its text and its place: two may read the same.
        <div key={`${String(index)}:${message}`} className="font-bold">
          {message}
        </div>
      ))}
    </div>
  );
}
