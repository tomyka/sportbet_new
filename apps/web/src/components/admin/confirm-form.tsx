'use client';

import type { JSX } from 'react';
import type { ReactNode } from 'react';

/** A POST form that asks first, as sportbet's tile does (onsubmit="return confirm(...)", issue 269). */
export function ConfirmForm({
  action,
  question,
  className,
  children,
}: {
  action: string;
  question: string;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <form
      method="post"
      action={action}
      className={className}
      onSubmit={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
