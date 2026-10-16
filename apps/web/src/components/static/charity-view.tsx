import type { JSX } from 'react';
import Image from 'next/image';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon } from '../shell/icon';
import { CHARITY_TOTAL, JAUNIMO_LINIJA_URL } from './charity-facts';

/**
 * The eleven payment proofs, in sportbet's order (charity.blade.php): a
 * label and an image, one receipt for each tournament's donation.
 */
const PAYMENTS = [
  { label: 'Euroleague 2025', file: 'JL_payment_el2025.png', size: [647, 507] },
  { label: 'Euroleague 2024', file: 'JL_payment_el2024.png', size: [639, 506] },
  { label: 'Euroleague 2023', file: 'JL_payment_el2023.png', size: [609, 181] },
  { label: 'Euroleague 2022', file: 'JL_payment_el2022.png', size: [612, 184] },
  {
    label: 'EuroBasket 2022',
    file: 'JL_payment_ecb2022.png',
    size: [609, 187],
  },
  { label: 'Euroleague 2021', file: 'JL_payment_el2021.png', size: [611, 142] },
  { label: 'Euroleague 2020', file: 'JL_payment_el2020.png', size: [615, 181] },
  { label: 'Euro 2020', file: 'JL_payment_ecf2020.png', size: [611, 145] },
  { label: 'Euroleague 2019', file: 'JL_payment_el2019.png', size: [611, 332] },
  {
    label: 'Euroleague 2018 (2)',
    file: 'JL_payment_el2018_2.png',
    size: [612, 205],
  },
  {
    label: 'Euroleague 2018 (1)',
    file: 'JL_payment_el2018_1.png',
    size: [614, 187],
  },
] as const;

const IMAGES = '/img/charity';

const EXTERNAL = { target: '_blank', rel: 'noopener' } as const;

function Stat({ value, label }: { value: string; label: string }): JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="text-[1.6rem] leading-[1.1] font-extrabold text-warn">
        {value}
      </span>
      <span className="mt-0.5 text-[0.72rem] opacity-75">{label}</span>
    </div>
  );
}

/** The hero: the title, the sentence naming Jaunimo linija (R-52, R-75: "krepšinio"), the three figures and the button. */
function Hero(): JSX.Element {
  return (
    <div className="mb-4 grid grid-cols-1 items-center gap-6 rounded-[16px] bg-linear-to-br from-ink to-accent px-7 py-8 text-on-ink sm:grid-cols-[1fr_auto]">
      <div>
        <h1 className="m-0 mb-2.5 text-[clamp(1.5rem,4vw,2.2rem)] font-extrabold">
          Žaidžiame dėl gero tikslo
        </h1>
        <p className="mb-5 text-[0.93rem] leading-[1.65] opacity-90">
          SportBet - tai ne tik krepšinio prognozių žaidimas. Nuo 2018 metų
          žaidėjai savanoriškai aukoja{' '}
          <strong>
            <a href={JAUNIMO_LINIJA_URL} {...EXTERNAL} className="underline">
              Jaunimo linijai
            </a>
          </strong>{' '}
          - organizacijai, teikiančiai nemokamą psichologinę pagalbą jaunimui
          visoje Lietuvoje.
        </p>
        <div className="mb-5 flex flex-wrap gap-5">
          <Stat value={CHARITY_TOTAL} label="paaukota iš viso" />
          <Stat value="8+" label="turnyrų" />
          <Stat value="2018" label="pradėjome" />
        </div>
        <a
          href={JAUNIMO_LINIJA_URL}
          {...EXTERNAL}
          className="inline-block rounded-[8px] bg-warn px-5 py-[9px] text-[0.88rem] font-bold text-on-warn no-underline hover:bg-warn-hover hover:text-on-warn"
        >
          <Icon name="heart-fill" /> Jaunimo linija &rarr;
        </a>
      </div>
      <a href={JAUNIMO_LINIJA_URL} {...EXTERNAL} className="hidden sm:block">
        <Image
          src={`${IMAGES}/JL_thank.png`}
          width={759}
          height={534}
          sizes="160px"
          alt="Jaunimo linija - ačiū"
          className="block w-40 rounded-[12px] object-cover"
        />
      </a>
    </div>
  );
}

/** The thanks, with the total and TransUnion's matching to 2024. */
function About(): JSX.Element {
  return (
    <div className={`${CARD} mb-4`}>
      <p className="m-0 text-[0.93rem] leading-[1.7] text-text">
        Noriu padėkoti visiems dalyvaujantiems ir skiriantiems lėšas labdarai.
        Jūsų dėka JAU pavyko surinkti ir paaukoti Jaunimo Linijai{' '}
        <strong>{CHARITY_TOTAL}</strong>. Iki 2024 metų visą surinktą paramą
        dvigubino <strong>TransUnion Lithuania</strong> įmonė.{' '}
        <strong>Ačiū, kad prisidedate prie gerų darbų!</strong>
      </p>
    </div>
  );
}

/** "Mokėjimų įrodymai": each receipt a card linking to its image. */
function Proofs(): JSX.Element {
  return (
    <div className={CARD}>
      <div className={`${CARD_TITLE} mb-3`}>
        <CardIcon name="receipt" />
        <h2 className={`m-0 inline ${CARD_TITLE}`}>Mokėjimų įrodymai</h2>
      </div>
      <p className="mb-5 text-[0.83rem] text-muted">
        Kiekvieno turnyro pabaigoje surinkta suma pervedama Jaunimo linijai.
        Žemiau - visi mokėjimų patvirtinimai. Spustelėk nuotrauką, kad pamatytum
        detaliau.
      </p>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
        {PAYMENTS.map(({ label, file, size }) => (
          <a
            key={file}
            href={`${IMAGES}/${file}`}
            {...EXTERNAL}
            data-testid="charity-proof"
            className="flex flex-col overflow-hidden rounded-[10px] border border-border no-underline transition hover:-translate-y-0.5 hover:shadow-[0_4px_16px_var(--color-shadow)]"
          >
            <div className="border-b border-border bg-bg px-2.5 py-2 text-[0.78rem] font-semibold text-text">
              {label}
            </div>
            <Image
              src={`${IMAGES}/${file}`}
              width={size[0]}
              height={size[1]}
              sizes="220px"
              alt={`${label} mokėjimas`}
              className="block h-[140px] w-full object-cover"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

/** /charity (charity.blade.php): the hero, the thanks and the eleven payment proofs. */
export function CharityView(): JSX.Element {
  return (
    <div className="mx-auto max-w-[960px]">
      <Hero />
      <About />
      <Proofs />
    </div>
  );
}
