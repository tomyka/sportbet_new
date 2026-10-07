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

const DAY = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Europe/Vilnius',
});

const CLOCK = new Intl.DateTimeFormat('lt', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Europe/Vilnius',
});

const partOf = (
  format: Intl.DateTimeFormat,
  instant: number,
  type: Intl.DateTimeFormatPartTypes,
): string =>
  format.formatToParts(new Date(instant)).find((each) => each.type === type)
    ?.value ?? '';

/** The Vilnius calendar day, `YYYY-MM-DD` (sportbet's ->setTimezone('Europe/Vilnius')->format('Y-m-d')). */
export function vilniusDate(instant: number): string {
  return `${partOf(DAY, instant, 'year')}-${partOf(DAY, instant, 'month')}-${partOf(DAY, instant, 'day')}`;
}

/** The Vilnius clock, `H:i`. */
export function vilniusClock(instant: number): string {
  return `${partOf(CLOCK, instant, 'hour')}:${partOf(CLOCK, instant, 'minute')}`;
}

/** `Y-m-d H:i` in Vilnius: the single game page's tip-off. */
export function vilniusStamp(instant: number): string {
  return `${vilniusDate(instant)} ${vilniusClock(instant)}`;
}

/**
 * Carbon's `lt` months as `isoFormat('MMMM D')` writes them: with a day
 * beside it, the genitive (months_regexp), capitalised by ucfirst - each
 * checked against Carbon 3.14.0, sportbet's at 3eb95e7.
 */
const MONTHS = [
  'Sausio',
  'Vasario',
  'Kovo',
  'Balandžio',
  'Gegužės',
  'Birželio',
  'Liepos',
  'Rugpjūčio',
  'Rugsėjo',
  'Spalio',
  'Lapkričio',
  'Gruodžio',
] as const;

/** A day card's header: `ucfirst(Carbon::parse($day)->locale('lt')->isoFormat('MMMM D'))`, "Spalio 6". */
export function dayHeader(isoDate: string): string {
  const [, month = '', day = ''] = isoDate.split('-');
  const name = MONTHS[Number(month) - 1];
  if (name === undefined) throw new Error(`dayHeader: ${isoDate} is no date`);
  return `${name} ${String(Number(day))}`;
}

/** Carbon 3.14.0's `lt` months_short, capitalised by ucfirst. */
const SHORT_MONTHS = [
  'Sau',
  'Vas',
  'Kov',
  'Bal',
  'Geg',
  'Bir',
  'Lie',
  'Rgp',
  'Rgs',
  'Spa',
  'Lap',
  'Gru',
] as const;

/** The game page's day: `ucfirst(...->setTimezone('Europe/Vilnius')->locale('lt')->isoFormat('MMM D'))`, "Spa 6". */
export function shortDay(instant: number): string {
  const [, month = '', day = ''] = vilniusDate(instant).split('-');
  const name = SHORT_MONTHS[Number(month) - 1];
  if (name === undefined) throw new Error('shortDay: no Vilnius month');
  return `${name} ${String(Number(day))}`;
}
