import { Icon } from '../shell/icon';
import { GLYPH } from './glyphs';

/** The hub's text and the leaderboard's shorter one, each with its link's words. */
const TEXT = {
  hub: {
    body: (
      <>
        SportBet - tai ne tik krepšinio prognozių žaidimas. Nuo 2018 metų
        žaidėjai savanoriškai aukoja{' '}
        <span className="font-semibold">Jaunimo linijai</span>, teikiančiai
        psichologinę pagalbą jaunimui visoje Lietuvoje. Iki 2024 m. kiekvieną
        auką dvigubino TransUnion Lithuania.
      </>
    ),
    more: 'Sužinoti daugiau',
  },
  leaderboard: {
    body: 'SportBet - tai ne tik krepšinio prognozių žaidimas. Nuo 2018 metų žaidėjai savanoriškai aukoja Jaunimo linijai, teikiančiai psichologinę pagalbą jaunimui visoje Lietuvoje.',
    more: 'Sužinoti daugiau apie labdarą',
  },
} as const;

/**
 * The charity card (.sb-charity-card: amber, its amount on a solid amber
 * box that runs across the card below 480px): hub.blade.php's, or
 * leaderboard.blade.php's shorter text. R-52 and R-75: sportbet's "futbolo
 * prognozių žaidimas" reads "krepšinio" in both; the rest, and the 7 500€
 * written into sportbet's pages, are sportbet's. The charity page is not
 * built yet, so its links are text until it is.
 */
export function CharityCard({
  variant = 'hub',
}: {
  variant?: keyof typeof TEXT;
}) {
  const { body, more } = TEXT[variant];
  return (
    <section
      data-testid="charity-card"
      className="mb-6 rounded-[16px] border border-warn bg-warn-tint px-[22px] py-5"
    >
      <div className="flex items-start gap-4 max-[480px]:flex-wrap">
        <div aria-hidden="true" className="shrink-0 text-[2rem] leading-none">
          {GLYPH.heart}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="mb-[6px] text-[1rem] font-bold text-warn">
            Žaidžiame dėl gero tikslo
          </h3>
          <p className="mb-2 text-[0.84rem] leading-[1.55] text-warn">{body}</p>
          <span className="text-[0.82rem] font-semibold text-warn">
            {more} <Icon name="arrow-right-short" />
          </span>
        </div>
        <div className="flex min-w-[90px] shrink-0 flex-col items-center rounded-[12px] bg-warn px-4 py-[10px] max-[480px]:w-full max-[480px]:flex-row max-[480px]:justify-center max-[480px]:gap-2 max-[480px]:px-3 max-[480px]:py-2">
          <span className="text-[1.35rem] leading-[1.2] font-extrabold text-on-accent">
            7 500€
          </span>
          <span className="mt-[2px] text-center text-[0.68rem] font-semibold text-on-accent">
            paaukota nuo 2018 m.
          </span>
        </div>
      </div>
    </section>
  );
}
