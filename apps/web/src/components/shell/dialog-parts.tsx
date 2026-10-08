import type { JSX } from 'react';
import { useEffect, useState } from 'react';

/** What a form's `action` is given by useActionState. */
export type FormAction = (form: FormData) => void;

/** sportbet's Alpine clock(): m:ss. */
export const clock = (seconds: number): string =>
  `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

/** Seconds counted down once a second from `seconds`, to zero (the code step's x-data). */
export function useCountdown(seconds: number): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const timer = setInterval(() => {
      setLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return left;
}

/** .alert.alert-danger in .sb-auth-body. */
export function Refusal({ message }: { message: string }): JSX.Element {
  return (
    <div
      role="alert"
      className="mb-3 rounded-[10px] bg-bad-tint px-3 py-2 text-[0.875rem] text-bad"
    >
      {message}
    </div>
  );
}
