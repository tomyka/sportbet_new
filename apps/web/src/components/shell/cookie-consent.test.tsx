import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONSENT_KEY, CookieConsent } from './cookie-consent';

// sportbet's partials/cookie-consent: asked until answered, the answer in
// localStorage 'sb_cookie_consent', AdSense only after "Sutinku" - and here
// only where ADSENSE_CLIENT is set (production).

const CLIENT = 'ca-pub-7290396604686794';
const AD_SRC = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;

const banner = () => screen.getByTestId('cookie-consent');
const adScripts = () =>
  document.head.querySelectorAll<HTMLScriptElement>(
    'script[src*="adsbygoogle"]',
  );

afterEach(() => {
  localStorage.clear();
  for (const script of adScripts()) script.remove();
  vi.restoreAllMocks();
});

describe('CookieConsent', () => {
  it("is in the server's markup, hidden until the browser has read the answer", () => {
    const html = renderToStaticMarkup(
      <CookieConsent adsenseClient={CLIENT} privacyHref={null} />,
    );
    expect(html).toContain('data-state="unread"');
    expect(html).toMatch(/^<div[^>]*\shidden=""/);
  });

  it('asks a first-time visitor', () => {
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('asking');
    expect(banner().hidden).toBe(false);
    expect(banner().textContent).toContain(
      'Naudojame slapukus reklamai ir statistikai.',
    );
    expect(screen.getByRole('button', { name: 'Tik būtini' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Sutinku' })).toBeDefined();
    expect(adScripts()).toHaveLength(0);
  });

  it('remembers "Sutinku", closes, and loads AdSense with the client', () => {
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted');
    expect(banner().hidden).toBe(true);
    const [script] = adScripts();
    expect(script?.getAttribute('src')).toBe(AD_SRC);
    expect(script?.async).toBe(true);
    expect(script?.crossOrigin).toBe('anonymous');
  });

  it('loads no ad after "Sutinku" where no client is set', () => {
    render(<CookieConsent adsenseClient={null} privacyHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('accepted');
    expect(adScripts()).toHaveLength(0);
  });

  it('remembers "Tik būtini", closes, and loads no ad', () => {
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tik būtini' }));
    expect(localStorage.getItem(CONSENT_KEY)).toBe('declined');
    expect(banner().hidden).toBe(true);
    expect(adScripts()).toHaveLength(0);
  });

  it('does not ask a visitor who accepted, and loads their ad', () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('answered');
    expect(banner().hidden).toBe(true);
    expect(adScripts()).toHaveLength(1);
  });

  it('does not ask a visitor who declined, and loads no ad', () => {
    localStorage.setItem(CONSENT_KEY, 'declined');
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('answered');
    expect(adScripts()).toHaveLength(0);
  });

  // sportbet's `else if (!consent)`: an empty answer is no answer, and any
  // other stored value is an answer that is not "accepted".
  it('asks a visitor whose stored answer is empty', () => {
    localStorage.setItem(CONSENT_KEY, '');
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('asking');
    expect(adScripts()).toHaveLength(0);
  });

  it('does not ask a visitor with any other stored answer, and loads no ad', () => {
    localStorage.setItem(CONSENT_KEY, 'Accepted');
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('answered');
    expect(banner().hidden).toBe(true);
    expect(adScripts()).toHaveLength(0);
  });

  it('loads AdSense once, even if it is already on the page', () => {
    localStorage.setItem(CONSENT_KEY, 'accepted');
    const existing = document.createElement('script');
    existing.src = AD_SRC;
    document.head.appendChild(existing);
    render(<CookieConsent adsenseClient={CLIENT} privacyHref={null} />);
    expect(adScripts()).toHaveLength(1);
  });

  it('asks, and still closes on an answer, when storage is blocked', () => {
    const blocked = () => {
      throw new DOMException('blocked', 'SecurityError');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(blocked);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(blocked);
    render(<CookieConsent adsenseClient={null} privacyHref={null} />);
    expect(banner().getAttribute('data-state')).toBe('asking');
    fireEvent.click(screen.getByRole('button', { name: 'Sutinku' }));
    expect(banner().hidden).toBe(true);
  });

  it('links the privacy policy once the page exists, and says nothing of it before', () => {
    const { unmount } = render(
      <CookieConsent adsenseClient={null} privacyHref={null} />,
    );
    expect(banner().textContent).not.toContain('Daugiau informacijos');
    expect(screen.queryByRole('link')).toBeNull();
    unmount();

    render(<CookieConsent adsenseClient={null} privacyHref="/privacy" />);
    expect(banner().textContent).toContain(
      'Naudojame slapukus reklamai ir statistikai. Daugiau informacijos: privatumo politika.',
    );
    expect(
      screen
        .getByRole('link', { name: 'privatumo politika' })
        .getAttribute('href'),
    ).toBe('/privacy');
  });
});
