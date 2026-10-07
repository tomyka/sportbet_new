/**
 * main.blade.php's .sb-topline: the current round's name, a bar as wide as
 * its scored share (MainController::getTournamentProgress' pct, rounded),
 * "scored / total", and "N šiandien" on a Vilnius day with games still to
 * play.
 */
export function ProgressLine({
  name,
  scored,
  total,
  today,
}: {
  name: string;
  scored: number;
  total: number;
  today: number;
}) {
  const percent = total > 0 ? Math.round((scored / total) * 100) : 0;
  return (
    <div data-panel="progress" className="flex flex-wrap items-center gap-3">
      <span className="text-[1.3rem] font-extrabold whitespace-nowrap uppercase">
        {name}
      </span>
      <div
        role="progressbar"
        aria-label={name}
        aria-valuemin={0}
        aria-valuenow={scored}
        aria-valuemax={total}
        className="h-1.5 min-w-[60px] flex-1 overflow-hidden rounded-full bg-border"
      >
        <div
          data-testid="progress-fill"
          className="h-full rounded-full bg-linear-to-r from-accent to-accent-hover transition-[width] duration-400"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-muted">{`${String(scored)} / ${String(total)}`}</span>
      {today > 0 ? (
        <span className="rounded-[4px] bg-warn px-[7px] py-[2px] text-[0.68rem] font-bold whitespace-nowrap text-on-warn">
          {`${String(today)} šiandien`}
        </span>
      ) : null}
    </div>
  );
}
