'use client';

import type { JSX, ReactNode } from 'react';
import { useRef } from 'react';

/** A box whose change is complete the moment it is made: a tick or a choice (sportbet's `onchange="this.form.submit()"`). */
const isInstant = (target: EventTarget): boolean =>
  (target instanceof HTMLInputElement && target.type === 'checkbox') ||
  target instanceof HTMLSelectElement;

/**
 * A row that saves itself, as sportbet's admin rows do: a tick or a choice
 * posts the row at once; a typed box posts it when focus leaves the row,
 * if something was typed (`onblur="this.form.submit()"`). The row is a
 * plain POST form, so the server answers with a 303 and its message.
 */
export function AutoSubmitForm({
  action,
  className,
  children,
  testId,
  datasetId,
}: {
  action: string;
  className?: string;
  children: ReactNode;
  testId?: string;
  datasetId?: string;
}): JSX.Element {
  const typed = useRef(false);
  return (
    <form
      method="post"
      action={action}
      className={className}
      data-testid={testId}
      data-id={datasetId}
      onChange={(event) => {
        if (isInstant(event.target)) event.currentTarget.requestSubmit();
        else typed.current = true;
      }}
      onBlur={(event) => {
        const leaving = event.relatedTarget;
        const staying =
          leaving instanceof Node && event.currentTarget.contains(leaving);
        if (typed.current && !staying) {
          typed.current = false;
          event.currentTarget.requestSubmit();
        }
      }}
    >
      {children}
    </form>
  );
}
