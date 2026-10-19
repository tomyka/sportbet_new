import type { JSX } from 'react';
import { CARD } from '../hub/styles';
import { SURVIVAL_REPEAT_RULE } from '../static/shared-texts';
import { SV_HEAD, SV_HEAD_TITLE } from './styles';

/** What a winning round pays at home and away: the survival page's own figures (SU-1, R-138). */
interface Pays {
  readonly home: number;
  readonly away: number;
}

function rulesOf({ home, away }: Pays): readonly string[] {
  return [
    'Kiekvieną turą renkiesi vieną komandą, kuri, tavo manymu, laimės savo rungtynes.',
    // The Euroleague's grounds pay differently (SU-1), so sportbet's two-ground text.
    `Ji laimi - namie gauni ${String(home)}, išvykoje ${String(away)} taškų; jie sumuojasi per visą seriją, ir žaidi toliau.`,
    'Ji pralaimi - serija nutrūksta, skaičiavimas prasideda iš naujo, o visos komandos vėl laisvos.',
    // R-133 Q6: one sentence with /help's, which names the reset.
    SURVIVAL_REPEAT_RULE,
  ];
}

const ROUNDS = [1, 2, 3, 4, 5] as const;

/** sportbet's table rows for a format whose grounds differ: "Namie" and "Išvykoje". */
const tableRowsOf = ({
  home,
  away,
}: Pays): readonly (readonly [string, number])[] => [
  ['Namie', home],
  ['Išvykoje', away],
];

// Each cell names its own size and colour (.sv-pts-l, -v, -tot; sportbet issue #85).
const CELL = 'border-b border-border px-[9px] py-1.5 text-center';
const HEAD_CELL = `${CELL} text-[0.64rem] font-bold tracking-[0.1em] text-dim uppercase`;

/** survival.blade.php's "Taisyklės": four numbered rules and the points table (.sv-rules, .sv-pts). */
export function SurvivalRules({ pays }: { pays: Pays }): JSX.Element {
  return (
    <section className={`${CARD} mb-4`}>
      <div className={SV_HEAD}>
        <h2 className={SV_HEAD_TITLE}>Taisyklės</h2>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
        {rulesOf(pays).map((rule, index) => (
          <div
            key={rule}
            data-testid="survival-rule"
            className="flex items-start gap-2.5"
          >
            <span className="grid size-[21px] flex-none place-items-center rounded-full bg-accent-tint text-[0.66rem] font-extrabold text-accent">
              {index + 1}
            </span>
            <p className="m-0 text-[0.82rem] leading-[1.55] text-muted">
              {rule}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-3.5 overflow-x-auto">
        <table className="w-full border-collapse tabular-nums [&_tr:last-child_td]:border-b-0">
          <tbody>
            <tr>
              <th className={HEAD_CELL}>turas</th>
              {ROUNDS.map((round) => (
                <th key={round} className={HEAD_CELL}>
                  {round}
                </th>
              ))}
              <th className={HEAD_CELL}>Iš viso</th>
            </tr>
            {tableRowsOf(pays).map(([label, step]) => (
              <tr key={label}>
                <td
                  className={`${CELL} text-[0.68rem] tracking-[0.09em] text-dim uppercase`}
                >
                  {label}
                </td>
                {ROUNDS.map((round) => (
                  <td key={round} className={`${CELL} text-[0.8rem] text-text`}>
                    {step * round}
                  </td>
                ))}
                <td className={`${CELL} text-[0.8rem] font-bold text-accent`}>
                  {step * 15}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
