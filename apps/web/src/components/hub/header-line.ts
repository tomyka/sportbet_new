import type { TournamentProfile } from '@sportbet/domain';

const SPORT_NAMES: Readonly<Record<string, string>> = {
  basketball: 'Krepšinis',
  football: 'Futbolas',
};

/**
 * R-56: the sport in Lithuanian - "Krepšinis", "Futbolas" - matched on the
 * stored value without regard to case; any other value as typed. sportbet
 * shows `ucfirst($t->sport)`, in English. Display only, not a RuleSet field.
 */
export function sportName(stored: string): string {
  return SPORT_NAMES[stored.toLowerCase()] ?? stored;
}

/**
 * A tournament card's second line (hub.blade.php, register.blade.php):
 * the sport (R-56), then " · start - end" or " · nuo start".
 */
export function headerLine(
  profile: Pick<TournamentProfile, 'sport' | 'startsOn'>,
  endsOn: string | null,
): string {
  const sport = sportName(profile.sport);
  if (profile.startsOn === null) return sport;
  return endsOn === null
    ? `${sport} · nuo ${profile.startsOn}`
    : `${sport} · ${profile.startsOn} - ${endsOn}`;
}
