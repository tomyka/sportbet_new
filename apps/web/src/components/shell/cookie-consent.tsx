'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from './icon';

/** Where the answer is kept, as sportbet keeps it: 'accepted' or 'declined'. */
export const CONSENT_KEY = 'sb_cookie_consent';

const ADSENSE_SRC =
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=';

/** unread: the server's render, before the browser has looked; asking: the banner is up; answered: it stays down. */
type State = 'unread' | 'asking' | 'answered';
type Answer = 'accepted' | 'declined';

function storedAnswer(): string | null {
  try {
    return localStorage.getItem(CONSENT_KEY);
  } catch {
    return null; // storage blocked: ask, as on a first visit
  }
}

function remember(answer: Answer): void {
  try {
    localStorage.setItem(CONSENT_KEY, answer);
  } catch {
    // storage blocked: the visitor is asked again next time
  }
}

/** sportbet's loadAdsense(): once per page, and here only with a client. */
function loadAdsense(client: string | null): void {
  if (
    client === null ||
    document.querySelector('script[src*="adsbygoogle"]') !== null
  )
    return;
  const script = document.createElement('script');
  script.async = true;
  script.src = ADSENSE_SRC + client;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

// .sb-cookie-btn and its two kinds
const BUTTON =
  'cursor-pointer rounded-[6px] px-4 py-1.5 text-[0.82rem] leading-[1.4] font-semibold';

/**
 * The cookie banner (sportbet's partials/cookie-consent): up until the
 * visitor answers, the answer remembered in localStorage. "Sutinku" loads
 * AdSense, but only where ADSENSE_CLIENT is set - production - so staging
 * and the tests never load an ad. Above the bottom tabs' height below
 * 992px, as sportbet places it.
 */
export function CookieConsent({
  adsenseClient,
  privacyHref,
}: {
  adsenseClient: string | null;
  privacyHref: string | null;
}) {
  const [state, setState] = useState<State>('unread');

  useEffect(() => {
    const stored = storedAnswer();
    if (stored === 'accepted') loadAdsense(adsenseClient);
    // sportbet asks only when nothing is stored.
    setState(stored === null || stored === '' ? 'asking' : 'answered');
  }, [adsenseClient]);

  function answer(given: Answer): void {
    remember(given);
    setState('answered');
    if (given === 'accepted') loadAdsense(adsenseClient);
  }

  return (
    <div
      data-testid="cookie-consent"
      data-state={state}
      hidden={state !== 'asking'}
      className="fixed inset-x-0 bottom-0 z-[1030] flex flex-wrap items-center justify-between gap-3 bg-rail-raised px-5 py-3 text-[0.84rem] text-on-rail shadow-[0_-2px_12px_var(--color-shadow-strong)] max-lg:bottom-14"
    >
      <div>
        <Icon name="cookie" /> Naudojame slapukus reklamai ir statistikai.
        {privacyHref === null ? null : (
          <>
            {' Daugiau informacijos: '}
            <Link href={privacyHref} className="text-rail-accent underline">
              privatumo politika
            </Link>
            .
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => {
            answer('declined');
          }}
          className={`${BUTTON} border border-rail-line bg-transparent text-rail-dim hover:bg-rail-wash-lg hover:text-on-rail`}
        >
          Tik būtini
        </button>
        <button
          type="button"
          onClick={() => {
            answer('accepted');
          }}
          className={`${BUTTON} border-none bg-accent text-on-accent hover:bg-accent-hover`}
        >
          Sutinku
        </button>
      </div>
    </div>
  );
}
