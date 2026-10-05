'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { LinkStyles } from './nav-styles';

/**
 * A navigation link that knows whether it leads to the current page
 * (sportbet's `active`), which only the browser's address can tell: the
 * shell sits in the root layout, which neither knows the path nor
 * re-renders on navigation. Its `styles` give the base classes and the
 * idle or current ones, applied one or the other; `className` adds the
 * link's own between them.
 */
export function NavLink({
  href,
  styles,
  className,
  children,
}: {
  href: string;
  styles: LinkStyles;
  className?: string | undefined;
  children: ReactNode;
}) {
  const isCurrent = usePathname() === href;
  const classes = [
    styles.base,
    className,
    isCurrent ? styles.current : styles.idle,
  ];
  return (
    <Link
      href={href}
      className={classes.filter((name) => name !== undefined).join(' ')}
      aria-current={isCurrent ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}
