import type { ReminderGame } from '@sportbet/db';
import {
  emailAddress,
  gameId,
  instantFrom,
  type Instant,
} from '@sportbet/domain';
import { unwrap } from '@sportbet/domain/testing';
import { describe, expect, it } from 'vitest';
import { reminderMail } from './reminder-mail';

const TO = unwrap(emailAddress('jonas@example.lt'));

const at = (iso: string): Instant => unwrap(instantFrom(iso));

const LINKS = {
  appUrl: 'https://sportbet.lt',
  unsubscribeUrl:
    'https://sportbet.lt/profile/notifications/unsubscribe/7?signature=abc',
  oneClickUrl:
    'https://sportbet.lt/profile/notifications/unsubscribe/7/confirm?signature=abc',
};

// 2026-10-20 is summer time in Vilnius (UTC+3): 16:00Z is 19:00.
const game = (
  id: number,
  home: string,
  away: string,
  iso: string,
): ReminderGame => ({ game: unwrap(gameId(id)), home, away, tipOff: at(iso) });

const ONE = [game(41, 'Žalgiris', 'Real Madrid', '2026-10-20T16:00:00Z')];
const TWO = [
  ...ONE,
  game(42, 'Olympiacos', 'Panathinaikos', '2026-10-20T17:30:00Z'),
];

// sportbet's PredictionReminder and emails/prediction-reminder.blade.php.
describe('reminderMail subject', () => {
  it('names the teams and the Vilnius kick-off for one game', () => {
    expect(reminderMail(TO, ONE, LINKS).subject).toBe(
      'Prognozė: Žalgiris vs Real Madrid - 19:00 LT',
    );
  });

  it("counts the games and gives the first one's Vilnius day and time for several", () => {
    expect(reminderMail(TO, TWO, LINKS).subject).toBe(
      'Prognozės: 2 rungt. 2026-10-20, pirmosios 19:00 LT',
    );
  });

  it('reads the Vilnius day and time in winter too (UTC+2)', () => {
    const winter = [game(1, 'A', 'B', '2026-12-01T17:05:00Z')];
    expect(reminderMail(TO, winter, LINKS).subject).toBe(
      'Prognozė: A vs B - 19:05 LT',
    );
  });

  it("refuses no games: a programmer error, as sportbet's LogicException", () => {
    expect(() => reminderMail(TO, [], LINKS)).toThrow(/at least one game/);
  });
});

describe('reminderMail body', () => {
  const mail = reminderMail(TO, TWO, LINKS);

  it('goes to the player and says what sportbet says', () => {
    expect(mail.to).toBe('jonas@example.lt');
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('Nepamirškite prognozuoti!');
      expect(part).toContain(
        'Šioms rungtynėms dar neturite spėjimo - pateikite jį iki pradžios.',
      );
      expect(part).toContain('Atsisakyti priminimų');
    }
    expect(mail.html).toContain('<html lang="lt">');
  });

  it('has one card per game in the order given, with the Vilnius stamp and the game link', () => {
    const first = mail.html.indexOf('Žalgiris');
    const second = mail.html.indexOf('Olympiacos');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(mail.html).toContain('2026-10-20 19:00 LT');
    expect(mail.html).toContain('2026-10-20 20:30 LT');
    expect(mail.html).toContain(
      'href="https://sportbet.lt/prediction/game/41"',
    );
    expect(mail.html).toContain(
      'href="https://sportbet.lt/prediction/game/42"',
    );
    expect(mail.html.match(/>Prognozuoti</g)).toHaveLength(2);
  });

  it('links the footer to the confirm page, not to the one-click address', () => {
    expect(mail.html).toContain(`href="${LINKS.unsubscribeUrl}"`);
    expect(mail.html).not.toContain(LINKS.oneClickUrl);
  });

  it('escapes a team name an admin typed', () => {
    const named = reminderMail(
      TO,
      [game(5, '<script>x</script>', 'A & B', '2026-10-20T16:00:00Z')],
      LINKS,
    );
    expect(named.html).not.toContain('<script>');
    expect(named.html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(named.html).toContain('A &amp; B');
    expect(named.text).toContain('<script>x</script> vs A & B');
  });

  it('has a text part listing each game with its time and link, and the unsubscribe link', () => {
    expect(mail.text).toBe(
      [
        'Nepamirškite prognozuoti!',
        '',
        'Šioms rungtynėms dar neturite spėjimo - pateikite jį iki pradžios.',
        '',
        'Žalgiris vs Real Madrid',
        '2026-10-20 19:00 LT',
        'Prognozuoti: https://sportbet.lt/prediction/game/41',
        '',
        'Olympiacos vs Panathinaikos',
        '2026-10-20 20:30 LT',
        'Prognozuoti: https://sportbet.lt/prediction/game/42',
        '',
        `Atsisakyti priminimų: ${LINKS.unsubscribeUrl}`,
      ].join('\n'),
    );
  });

  it("carries RFC 8058's pair, the List-Unsubscribe URL being the one-click address", () => {
    expect(mail.headers).toEqual({
      'List-Unsubscribe': `<${LINKS.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
