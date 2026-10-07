import { Icon } from '../shell/icon';
import { PREDICTIONS_PATH } from '../shell/shell-paths';

/** .upcoming-all-link: "Visi spėjimai →" in the game page's games' titles. */
export function AllPredictionsLink() {
  return (
    <a
      href={PREDICTIONS_PATH}
      className="text-[0.75rem] font-medium text-accent no-underline hover:underline"
    >
      Visi spėjimai <Icon name="arrow-right-short" />
    </a>
  );
}
