import type { JSX, ReactNode } from 'react';
import { CardIcon } from '../hub/card-icon';
import { CARD, CARD_TITLE } from '../hub/styles';

/** R-108, Q11: the month the policy was updated, one constant (the owner: October 2026). */
const PRIVACY_UPDATED = '2026 m. spalio mėn.';

const ADMIN_EMAIL = 't.konovalovas@gmail.com';

const EXTERNAL = { target: '_blank', rel: 'noopener' } as const;

const LINK = 'text-accent hover:underline';

function Heading({ children }: { children: string }): JSX.Element {
  return <h3 className="mt-3 mb-2 text-[1rem] font-bold">{children}</h3>;
}

function Items({ children }: { children: ReactNode }): JSX.Element {
  return <ul className="my-2 list-disc pl-6">{children}</ul>;
}

function Term({
  term,
  children,
}: {
  term: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <li>
      <strong>{term}</strong> - {children}
    </li>
  );
}

function MailLink(): JSX.Element {
  return (
    <a href={`mailto:${ADMIN_EMAIL}`} className={LINK}>
      {ADMIN_EMAIL}
    </a>
  );
}

function WhoAndData(): JSX.Element {
  return (
    <>
      <Heading>1. Kas mes esame</Heading>
      <p>
        SportBet yra sporto prognozių žaidimas, skirtas asmeniniam naudojimui
        tarp draugų ir kolegų. Administratorius: Tomas Konovalovas, el. paštas:{' '}
        <MailLink />.
      </p>
      <Heading>2. Kokius duomenis renkame</Heading>
      <Items>
        <Term term="Paskyros duomenys">
          el. pašto adresas ir vartotojo vardas, kuriuos pateikiate
          registruodamiesi.
        </Term>
        <Term term="Prognozės">
          jūsų įvesti rungtynių rezultatų ir turnyro eigos spėjimai.
        </Term>
        <Term term="Sesijos duomenys">
          prisijungimo sesija saugoma naršyklės slapuke (cookie), kad galėtumėte
          naudotis svetaine.
        </Term>
        {/* R-45, R-108: the address is in the server logs only, not in the sign-in record. */}
        <Term term="Techniniai duomenys">
          IP adresas ir naršyklės informacija, matomi tik serverio žurnaluose;
          prisijungimų įraše IP adresas nesaugomas.
        </Term>
      </Items>
      <Heading>3. Kaip naudojame duomenis</Heading>
      <Items>
        <li>Valdyti jūsų paskyrą ir rodyti asmeninę statistiką.</li>
        <li>Skaičiuoti taškus ir formuoti lyderių lentelę.</li>
        <li>
          Siųsti svarbius pranešimus apie žaidimą (pvz., turnyro pradžią).
        </li>
      </Items>
    </>
  );
}

function AdsAndCookies(): JSX.Element {
  return (
    <>
      <Heading>4. Reklama ir trečiųjų šalių slapukai</Heading>
      <p>
        Ši svetainė naudoja <strong>Google AdSense</strong> reklamai rodyti.
        Google ir jos partneriai gali naudoti slapukus, kad rodytų jums
        aktualesnę reklamą, remdamiesi jūsų ankstesniais apsilankymais šioje ir
        kitose svetainėse.
      </p>
      <p>
        Daugiau apie tai, kaip Google naudoja duomenis, rasite:{' '}
        <a
          href="https://policies.google.com/technologies/ads"
          {...EXTERNAL}
          className={LINK}
        >
          policies.google.com/technologies/ads
        </a>
        .
      </p>
      <p>
        Reklamų personalizavimą galite išjungti:{' '}
        <a
          href="https://www.google.com/settings/ads"
          {...EXTERNAL}
          className={LINK}
        >
          google.com/settings/ads
        </a>
        .
      </p>
      <Heading>5. Slapukai (cookies)</Heading>
      <p>Naudojame šiuos slapukus:</p>
      <Items>
        {/* R-44, R-108: 90 days, extended on every visit, ended by signing out. */}
        <Term term="Sesijos slapukas">
          būtinas prisijungimui palaikyti. Galioja 90 dienų ir pratęsiamas
          kiekvieno apsilankymo metu; ištrinamas atsijungus.
        </Term>
        <Term term="Google AdSense slapukai">
          reklamos personalizavimui ir statistikai. Valdomi „Google LLC".
        </Term>
      </Items>
      <p>
        Slapukus galite išjungti naršyklės nustatymuose, tačiau tada gali
        neveikti prisijungimas.
      </p>
    </>
  );
}

function RightsAndChanges(): JSX.Element {
  return (
    <>
      <Heading>6. Duomenų saugojimas</Heading>
      <p>
        Paskyros duomenys saugomi tol, kol paskyra yra aktyvi arba kol
        pateikiate prašymą juos ištrinti. Techniniai žurnalai saugomi ne ilgiau
        nei 90 dienų.
      </p>
      <Heading>7. Jūsų teisės (BDAR / GDPR)</Heading>
      <p>Turite teisę:</p>
      <Items>
        <li>Susipažinti su savo asmens duomenimis.</li>
        <li>Reikalauti juos ištaisyti arba ištrinti.</li>
        <li>Atšaukti sutikimą dėl duomenų tvarkymo.</li>
        <li>
          Pateikti skundą Valstybinei duomenų apsaugos inspekcijai (
          <a href="https://vdai.lrv.lt" {...EXTERNAL} className={LINK}>
            vdai.lrv.lt
          </a>
          ).
        </li>
      </Items>
      <p>
        Kreipkitės el. paštu: <MailLink />.
      </p>
      <Heading>8. Pakeitimai</Heading>
      <p>
        Apie esminius privatumo politikos pakeitimus informuosime per svetainę.
        Toliau naudodamiesi svetaine, sutinkate su nauja politika.
      </p>
    </>
  );
}

/**
 * /privacy (privacy.blade.php): sportbet's text with R-108's three fixes, the
 * owner's diff approved on 2026-10-16: the month, the IP address in the logs
 * only (R-45) and the session cookie's 90 days extended on every visit
 * (R-44). Nothing else is changed.
 */
export function PrivacyView(): JSX.Element {
  return (
    <div className={`${CARD} mx-auto max-w-[760px]`}>
      <div className={CARD_TITLE}>
        <CardIcon name="shield-lock" />
        <h1 className={`m-0 inline ${CARD_TITLE}`}>Privatumo politika</h1>
      </div>
      <div className="text-[0.92rem] leading-[1.7] text-text">
        <p className="mt-3 text-[0.82rem] text-muted">
          Atnaujinta: {PRIVACY_UPDATED}
        </p>
        <WhoAndData />
        <AdsAndCookies />
        <RightsAndChanges />
      </div>
    </div>
  );
}
