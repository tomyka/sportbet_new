'use client';

import type { JSX, ReactNode } from 'react';

/** A submit button that asks first, as sportbet's `onclick="return confirm(...)"` does: a refusal stops the form. */
export function ConfirmButton({
  question,
  name,
  value,
  title,
  className,
  children,
}: {
  question: string;
  name?: string;
  value?: string;
  title?: string;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="submit"
      name={name}
      value={value}
      title={title}
      aria-label={title}
      className={className}
      onClick={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
