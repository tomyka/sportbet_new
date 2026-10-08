import type { JSX } from 'react';
import Link from 'next/link';

/** The link back to the tournament list, shared by every page that needs it. */
export function BackToList(): JSX.Element {
  return (
    <p>
      <Link href="/">← Turnyrai</Link>
    </p>
  );
}
