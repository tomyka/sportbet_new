import { crestPath } from './crests';

/**
 * sportbet's x-team-crest as the hub draws it (.sb-crest under
 * .standing-flag): 20px and round, on a white plate with a hairline, so a
 * dark-ink crest stays legible on the dark card; the team's name as its
 * alternative text.
 */
export function TeamCrest({ team }: { team: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a local file drawn at 20px: next/image would add nothing
    <img
      src={crestPath(team)}
      alt={team}
      width={20}
      height={20}
      className="box-border inline-block size-5 shrink-0 rounded-full border border-crest-plate-line bg-crest-plate object-cover p-[2px]"
    />
  );
}
