import { Fragment } from 'react';
import { EntryLink } from './entry-link';
import type { NavEntry, NavSection } from './nav-entries';
import { RAIL_LABEL, RAIL_SEP } from './nav-styles';
import type { ShellBadges } from './shell-view';

/** One block of rail links (.sb-rail-nav). */
export function RailNav({
  entries,
  badges,
}: {
  entries: readonly NavEntry[];
  badges: ShellBadges;
}) {
  return (
    <nav className="flex flex-col">
      {entries.map((entry) => (
        <EntryLink
          key={entry.href}
          entry={entry}
          surface="rail"
          badges={badges}
        />
      ))}
    </nav>
  );
}

/** The rail's blocks (sectionsFor), a separator before each after the first, a label where the block has one (.sb-rail-sep, .sb-rail-label). */
export function RailSections({
  sections,
  badges,
}: {
  sections: readonly NavSection[];
  badges: ShellBadges;
}) {
  return sections.map((section, index) => (
    <Fragment key={section.entries[0]?.href ?? index}>
      {index === 0 ? null : <div className={RAIL_SEP} />}
      {section.label === null ? null : (
        <div className={RAIL_LABEL}>{section.label}</div>
      )}
      <RailNav entries={section.entries} badges={badges} />
    </Fragment>
  ));
}
