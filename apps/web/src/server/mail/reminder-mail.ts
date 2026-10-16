import type { ReminderGame } from '@sportbet/db';
import type { EmailAddress } from '@sportbet/domain';
import {
  vilniusClock,
  vilniusDate,
  vilniusStamp,
} from '../../components/format/vilnius-time';
import { predictionGamePath } from '../../components/shell/shell-paths';
import type { OutgoingMail } from './mail';
import { escapeHtml, mailFrame } from './mail-frame';

/** The addresses a reminder links to, built by the run (the signature is the player's). */
export interface ReminderLinks {
  /** The site's origin (APP_URL): the games' links start here. */
  readonly appUrl: string;
  /** The confirm page (R-98), the footer's link. */
  readonly unsubscribeUrl: string;
  /** The handler a mail provider posts to (RFC 8058): List-Unsubscribe. */
  readonly oneClickUrl: string;
}

const HEADING = 'Nepamirškite prognozuoti!';
const LEAD =
  'Šioms rungtynėms dar neturite spėjimo - pateikite jį iki pradžios.';
const BUTTON = 'Prognozuoti';
const UNSUBSCRIBE = 'Atsisakyti priminimų';

/** PredictionReminder::envelope: one game names its teams, several count themselves; the Vilnius time of the first. */
function subjectOf(games: readonly [ReminderGame, ...ReminderGame[]]): string {
  const [first] = games;
  const clock = vilniusClock(first.tipOff);
  if (games.length === 1) {
    return `Prognozė: ${first.home} vs ${first.away} - ${clock} LT`;
  }
  return `Prognozės: ${String(games.length)} rungt. ${vilniusDate(first.tipOff)}, pirmosios ${clock} LT`;
}

const gameLink = (game: ReminderGame, appUrl: string): string =>
  `${appUrl}${predictionGamePath(game.game)}`;

function cardOf(game: ReminderGame, appUrl: string): string[] {
  const link = escapeHtml(gameLink(game, appUrl));
  return [
    '<div style="background:#f8f8f8;border-radius:8px;padding:16px 20px;text-align:center;margin-bottom:12px">',
    '<div style="display:flex;justify-content:center;align-items:center;gap:16px">',
    `<span style="font-weight:700;font-size:1rem">${escapeHtml(game.home)}</span>`,
    '<span style="color:#aaa;font-size:.85rem">vs</span>',
    `<span style="font-weight:700;font-size:1rem">${escapeHtml(game.away)}</span>`,
    '</div>',
    `<div style="color:#888;font-size:.82rem;margin-top:8px">&#x1F551;${vilniusStamp(game.tipOff)} LT</div>`,
    '<div style="margin-top:12px">',
    `<a href="${link}" style="display:inline-block;background:#198754;color:#fff;padding:10px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:.9rem">${BUTTON}</a>`,
    '</div>',
    '</div>',
  ];
}

function htmlOf(games: readonly ReminderGame[], links: ReminderLinks): string {
  return mailFrame([
    `<h2 style="margin:0 0 8px;font-size:1.05rem;color:#111">${HEADING}</h2>`,
    `<p style="color:#555;font-size:.9rem;margin:0 0 20px">${LEAD}</p>`,
    ...games.flatMap((game) => cardOf(game, links.appUrl)),
    '<div style="margin-bottom:24px"></div>',
    '<hr style="border:none;border-top:1px solid #eee;margin:0 0 16px">',
    '<p style="color:#bbb;font-size:.72rem;text-align:center;margin:0">',
    `<a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#bbb;text-decoration:underline">${UNSUBSCRIBE}</a>`,
    '</p>',
  ]);
}

function textOf(games: readonly ReminderGame[], links: ReminderLinks): string {
  const cards = games.flatMap((game) => [
    `${game.home} vs ${game.away}`,
    `${vilniusStamp(game.tipOff)} LT`,
    `${BUTTON}: ${gameLink(game, links.appUrl)}`,
    '',
  ]);
  return [
    HEADING,
    '',
    LEAD,
    '',
    ...cards,
    `${UNSUBSCRIBE}: ${links.unsubscribeUrl}`,
  ].join('\n');
}

/**
 * sportbet's PredictionReminder (emails/prediction-reminder.blade.php): one
 * day's games a player has not predicted, a card each, earliest first as
 * given, and the footer link to the confirm page (R-98). The mail also
 * carries RFC 8058's List-Unsubscribe pair, so a mail client's own button
 * turns the reminders off with one POST. Team names are an admin's typing
 * and are escaped; the colours are the template's own, inline (the frame
 * is mail-frame.ts). No games is a programmer error, as sportbet's
 * LogicException.
 */
export function reminderMail(
  to: EmailAddress,
  games: readonly ReminderGame[],
  links: ReminderLinks,
): OutgoingMail {
  const [first, ...rest] = games;
  if (first === undefined) {
    throw new Error('reminderMail: a reminder needs at least one game');
  }
  return {
    to,
    subject: subjectOf([first, ...rest]),
    html: htmlOf(games, links),
    text: textOf(games, links),
    headers: {
      'List-Unsubscribe': `<${links.oneClickUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}
