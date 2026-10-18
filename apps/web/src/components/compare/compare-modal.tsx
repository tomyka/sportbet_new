'use client';

import type { JSX, MouseEvent, ReactNode } from 'react';
import type { Comparison } from '@sportbet/domain';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Modal } from '../leagues/modal';
import { CompareCard } from './compare-view';
import { comparisonFromJson } from './comparison-from-json';

/** What loading a card comes to; `'failed'` for anything but a comparison. */
type Loaded = Comparison | 'failed';

/** The card route's path for a compare page's: the same URL, as sportbet answered it to a script. */
const cardPath = (href: string): string => `${href}/card`;

/**
 * The comparison for a compare page's link, fetched when it is opened and
 * `null` while it loads. A guest (401) is taken to the page itself, which
 * sends them to sign in and back; any other refusal, or a failure, is
 * `'failed'`. An answer to an earlier link is never shown.
 */
function useComparison(href: string | null): Loaded | null {
  const [answer, setAnswer] = useState<{
    readonly href: string;
    readonly loaded: Loaded;
  } | null>(null);
  useEffect(() => {
    if (href === null) return;
    let current = true;
    const settle = (loaded: Loaded) => {
      if (current) setAnswer({ href, loaded });
    };
    void fetch(cardPath(href))
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign(href);
          return;
        }
        const body: unknown = response.ok ? await response.json() : null;
        settle(comparisonFromJson(body) ?? 'failed');
      })
      .catch(() => {
        settle('failed');
      });
    return () => {
      current = false;
    };
  }, [href]);
  return answer !== null && answer.href === href ? answer.loaded : null;
}

/** The modal's body: a spinner while loading, sportbet's error text on failure, else the card. */
function Body({ loaded }: { loaded: Loaded | null }): JSX.Element {
  if (loaded === null) {
    return (
      <div
        role="status"
        aria-label="Kraunama"
        data-testid="compare-loading"
        className="mx-auto my-6 size-5 animate-spin rounded-full border-2 border-border border-t-accent"
      />
    );
  }
  if (loaded === 'failed') {
    return (
      <p role="alert" className="py-3 text-center text-bad">
        Klaida. Bandykite dar kartą.
      </p>
    );
  }
  return <CompareCard comparison={loaded} />;
}

/** sportbet's #cmpModal ("Žaidėjų palyginimas"): the card over the page, which stays where it is. */
function CompareDialog({
  href,
  close,
}: {
  href: string | null;
  close: () => void;
}): JSX.Element {
  const loaded = useComparison(href);
  return (
    <Modal open={href !== null} close={close} title="Žaidėjų palyginimas">
      <Body loaded={loaded} />
    </Modal>
  );
}

const OpenCompare = createContext<((href: string) => void) | null>(null);

/**
 * Lets the compare links beneath it open the head-to-head in a modal over
 * the page (sportbet's league table did, without changing the URL). Links
 * outside a provider stay plain links to the page.
 */
export function CompareModalProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [href, setHref] = useState<string | null>(null);
  const close = useCallback(() => {
    setHref(null);
  }, []);
  return (
    <OpenCompare value={setHref}>
      {children}
      <CompareDialog href={href} close={close} />
    </OpenCompare>
  );
}

/** A click that asks for a new tab, window or download, which the link keeps doing. */
const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey;

/**
 * A link to a compare page. It is the page's link without script; with a
 * provider above it, a plain click opens the modal instead. Following it is
 * never a click on the row around it (which would open its trend).
 */
export function CompareLink({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: ReactNode;
}): JSX.Element {
  const open = useContext(OpenCompare);
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.stopPropagation();
        if (open === null || !isPlainClick(event)) return;
        event.preventDefault();
        open(href);
      }}
    >
      {children}
    </a>
  );
}
