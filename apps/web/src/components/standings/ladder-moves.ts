/** The order with the item at `from` moved to `to` (both indexes in range); the input untouched. */
export function moved<T>(order: readonly T[], from: number, to: number): T[] {
  const next = [...order];
  const [item] = next.splice(from, 1);
  if (item === undefined) return next;
  next.splice(to, 0, item);
  return next;
}

/** psAnnounce's text after a move: ":team - :position vieta iš :total". */
export const announcement = (
  team: string,
  position: number,
  total: number,
): string => `${team} - ${String(position)} vieta iš ${String(total)}`;
