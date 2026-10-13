import type { JSX } from 'react';
import { POP_ROW, POP_SUB } from './styles';

/** .sr-pop-row: one line of a popover; `sub` sets it in under the line above (.sr-pop-sub). */
export function PopRow({
  label,
  value,
  sub = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
}): JSX.Element {
  return (
    <div className={sub ? `${POP_ROW} ${POP_SUB}` : POP_ROW}>
      <span className="text-muted">{label}</span>
      <strong className="font-bold">{value}</strong>
    </div>
  );
}
