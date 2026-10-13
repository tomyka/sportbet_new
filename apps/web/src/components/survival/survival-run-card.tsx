import type { JSX } from 'react';
import type { RunLeg, TeamId } from '@sportbet/domain';
import { TeamCrest } from '../hub/team-crest';
import { CARD } from '../hub/styles';
import { SV_HEAD, SV_HEAD_NOTE, SV_HEAD_TITLE } from './styles';
import { teamName } from './survival-text';

/** A chip's figure: the stored running total, or R-12's "dar nežinoma" for a pick still waiting. */
const chipText = (leg: RunLeg): string =>
  leg.points === null
    ? `${String(leg.round)} turas · dar nežinoma`
    : `${String(leg.round)} turas · +${String(leg.points)}`;

/** survival.blade.php's "Tavo serija": a chip per round of the current run (.sv-chips). */
export function SurvivalRunCard({
  run,
  teamNames,
}: {
  run: readonly RunLeg[];
  teamNames: ReadonlyMap<TeamId, string>;
}): JSX.Element {
  return (
    <section className={`${CARD} mb-4`}>
      <div className={SV_HEAD}>
        <h2 className={SV_HEAD_TITLE}>Tavo serija</h2>
        <span className={SV_HEAD_NOTE}>
          Atsistatys, jei pasirinkta komanda pralaimės
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {run.map((leg) => {
          const name = teamName(teamNames, leg.team);
          return (
            <span
              key={leg.round}
              data-testid="survival-chip"
              className="inline-flex items-center gap-[7px] rounded-full border border-border bg-surface-2 py-[5px] pr-2.5 pl-1.5 text-[0.76rem] text-muted"
            >
              <TeamCrest team={name} size="chip" />
              {name}
              <b className="text-[0.68rem] font-bold text-ok tabular-nums">
                {chipText(leg)}
              </b>
            </span>
          );
        })}
      </div>
    </section>
  );
}
