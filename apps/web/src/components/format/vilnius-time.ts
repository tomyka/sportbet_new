const PARTS = new Intl.DateTimeFormat('lt', {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Vilnius',
});

/**
 * R-51: an instant as Vilnius time, in Lithuanian - "spalio 6 d., 21:00".
 * Built from the formatter's parts, so the comma after "d." is ours and
 * does not depend on the ICU data's pattern.
 */
export function vilniusDateTime(instant: number): string {
  const parts = PARTS.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? '';
  return `${part('month')} ${part('day')} d., ${part('hour')}:${part('minute')}`;
}
