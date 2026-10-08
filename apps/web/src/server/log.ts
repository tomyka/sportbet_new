/**
 * The one place operational information goes (#25): each event one JSON
 * line on stdout - its name first, then its fields - for the host's log
 * drain. Not for failures (those are console.error, by their kind only:
 * review W2), and never anything personal: a field says what happened,
 * never who it happened to or what they typed.
 */
export function logInfo(
  event: string,
  fields: Readonly<Record<string, string | number>>,
): void {
  const named = Object.entries(fields).filter(([name]) => name !== 'event');
  const line = JSON.stringify({ event, ...Object.fromEntries(named) });
  process.stdout.write(`${line}\n`);
}
