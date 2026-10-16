import type { JSX, ReactNode } from 'react';
import Image from 'next/image';
import type { HelpPage } from '@sportbet/domain';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';
import { Icon, type IconName } from '../shell/icon';
import {
  BADGE,
  LIST,
  NOTE,
  PAGE,
  PARAGRAPH,
  SCREENSHOT,
  SECTION,
  STAGE,
} from '../static/page-styles';
import { HELP_TEXT } from './help-texts';

/** sportbet's help screenshots (public/img/help/euroleague), each with its alt text and its size. */
const SHOTS = {
  results: {
    src: '/img/help/euroleague/results.png',
    height: 181,
    alt: 'Rungtynių rezultatų spėjimas',
  },
  standings: {
    src: '/img/help/euroleague/standings.png',
    height: 153,
    alt: 'Turnyro eigos spėjimas',
  },
  survival: {
    src: '/img/help/euroleague/survival.png',
    height: 151,
    alt: 'Išlikimo spėjimas',
  },
} as const;

function Screenshot({ shot }: { shot: keyof typeof SHOTS }): JSX.Element {
  const { src, height, alt } = SHOTS[shot];
  return (
    <Image
      src={src}
      width={960}
      height={height}
      sizes="480px"
      alt={alt}
      className={SCREENSHOT}
    />
  );
}

function Title({
  icon,
  children,
}: {
  icon: IconName;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`${CARD_TITLE} mb-3`}>
      <CardIcon name={icon} />
      <h2 className={`m-0 inline ${CARD_TITLE}`}>{children}</h2>
    </div>
  );
}

function Stage({
  badge,
  title,
  children,
}: {
  badge: ReactNode;
  title: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={STAGE}>
      <div className={BADGE}>{badge}</div>
      <div>
        <strong className="mb-1 block">{title}</strong>
        {children}
      </div>
    </div>
  );
}

/** "Spėjimai": match results, the standings (R-106, R-133 Q1, Q2, Q5) and, while the tournament plays it, survival (R-133 Q6, Q7). */
function Predictions({ help }: { help: HelpPage }): JSX.Element {
  return (
    <div className={CARD}>
      <Title icon="pencil-square">Spėjimai</Title>
      <div className={SECTION}>
        <Stage
          badge={<Icon name="sports-basketball" />}
          title="Rungtynių rezultatai"
        >
          <p className={PARAGRAPH}>
            Kiekvienų rungtynių rezultatą reikia atspėti iki jų pradžios. Jei
            spėjimas nepateikiamas laiku - jis sugeneruojamas automatiškai ir
            taškams nebus taikomas odds koeficientas.
          </p>
          <Screenshot shot="results" />
        </Stage>
        <Stage badge={<Icon name="table" />} title="Turnyro eiga">
          <p className={PARAGRAPH}>
            {HELP_TEXT.standings(help.deadlineRound, help.tableLength)}
          </p>
          <p className={NOTE}>{HELP_TEXT.twoPlaces}</p>
          <p className={NOTE}>{HELP_TEXT.partialTable}</p>
          <Screenshot shot="standings" />
        </Stage>
        {help.survival ? (
          <Stage badge={<Icon name="bullseye" />} title="Išlikimas">
            <p className={PARAGRAPH}>{HELP_TEXT.survival}</p>
            <Screenshot shot="survival" />
          </Stage>
        ) : null}
      </div>
    </div>
  );
}

/** "Suvestinė": the four summaries, survival's while the tournament plays it, for a guest as for a player (R-133 Q7). */
function Summary({ survival }: { survival: boolean }): JSX.Element {
  return (
    <div className={CARD}>
      <Title icon="bar-chart-line">Suvestinė</Title>
      <div className={SECTION}>
        <p className={PARAGRAPH}>
          Suvestinė atsiranda, kai turnyre yra bent vienos suskaičiuotos
          rungtynės. Kitų žaidėjų spėjimai matomi tik tų rungtynių, kurios jau
          prasidėjo arba turi rezultatą.
        </p>
        <ul className={LIST}>
          <Item icon="list-check" label="Prognozės">
            visų dalyvių rungtynių spėjimų ir gautų taškų suvestinė.
          </Item>
          <Item icon="table" label="Eiga">
            dalyvių turnyro eigos prognozių suvestinė.
          </Item>
          {survival ? (
            <Item icon="shield-check" label="Išlikimas">
              išlikimo žaidimo suvestinė.
            </Item>
          ) : null}
          <Item icon="bar-chart-line" label="Grafikas">
            dalyvių taškų ir vietų kitimo dinamika per visą turnyrą.
          </Item>
        </ul>
      </div>
    </div>
  );
}

function Item({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <li>
      <strong>
        <Icon name={icon} /> {label}
      </strong>{' '}
      - {children}
    </li>
  );
}

/**
 * "Informacija": the pages beside this one. "Privatumas" joins when /privacy
 * does (R-108: the owner approves its text first).
 */
function Information(): JSX.Element {
  return (
    <div className={CARD}>
      <Title icon="info-circle">Informacija</Title>
      <div className={SECTION}>
        <ul className={LIST}>
          <Item icon="journal-text" label="Taisyklės">
            taškų skaičiavimo taisyklės ir pilnas žaidimo aprašymas.
          </Item>
          <Item icon="question-circle" label="Pagalba">
            šis puslapis.
          </Item>
          <Item icon="heart" label="Jaunimo linija">
            informacija apie paramą Jaunimo Linijai.
          </Item>
        </ul>
      </div>
    </div>
  );
}

/** /help (help.blade.php): three cards, in sportbet's order. */
export function HelpView({ help }: { help: HelpPage }): JSX.Element {
  return (
    <div className={PAGE}>
      <h1 className="sr-only">Pagalba</h1>
      <Predictions help={help} />
      <Summary survival={help.survival} />
      <Information />
    </div>
  );
}
