import type { JSX } from 'react';
import Image from 'next/image';

/**
 * modals/login's divider "arba" and the button under it (slice 19, #40): a
 * plain link, never a form or a `Link` that prefetches, with Google's mark
 * as a static file so no colour literal enters a component.
 */
export function GoogleButton(): JSX.Element {
  return (
    <>
      <div className="my-3.5 flex items-center gap-3 text-[0.78rem] text-muted">
        <span className="h-px flex-1 bg-border" />
        arba
        <span className="h-px flex-1 bg-border" />
      </div>
      <a
        href="/auth/google"
        className="flex w-full items-center justify-center gap-2.5 rounded-md border border-border bg-card px-3 py-2 font-semibold text-text no-underline hover:bg-surface-2"
      >
        <Image
          src="/img/google-g.svg"
          width={18}
          height={18}
          alt=""
          unoptimized
        />
        Prisijungti su Google
      </a>
    </>
  );
}
