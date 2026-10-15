'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import type { FeeMoney, FeePanel as FeePanelView } from '@sportbet/domain';
import { Icon } from '../shell/icon';
import { FeePopup } from './fee-popup';

/** The due line (one red line and the way to the pop-up) or the paid line. */
function FeeLine({
  money,
  open,
}: {
  money: FeeMoney;
  open: () => void;
}): JSX.Element {
  if (money.state === 'paid') {
    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-semibold text-ok">
        <Icon name="check-circle-fill" />
        <span>
          Startinis dalyvio mokestis sumokėtas. Sėkmės totalizatoriuje!
        </span>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 font-semibold text-bad"
    >
      <Icon name="exclamation-circle" />
      <span>{`Dalyvio mokestis ${money.feeText} € dar nesumokėtas.`}</span>
      <button
        type="button"
        onClick={open}
        className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-bad underline underline-offset-[3px] hover:text-text focus-visible:rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-accent"
      >
        Kaip sumokėti
      </button>
    </div>
  );
}

/**
 * partials/fee.blade.php: the league's money for a member - the due or the
 * paid line, the counts and the pots - and the reward text. It only draws a
 * `FeePanel` view (the domain's `feePanel` decides what a viewer sees): a
 * guest (R-124) has no money block, only the reward. The pop-up is the
 * view's, drawn only for a member who has not paid.
 */
export function FeePanel({ panel }: { panel: FeePanelView }): JSX.Element {
  const [opened, setOpened] = useState(false);
  const { money, reward } = panel;
  return (
    <div className="grid gap-2">
      {money === null ? null : (
        <>
          <FeeLine
            money={money}
            open={() => {
              setOpened(true);
            }}
          />
          <div className="text-muted">
            {`Dalyvių skaičius: ${String(money.counts.players)}, prognozuojama suma: ${money.counts.expected}€, surinkta suma: ${money.counts.collected}€`}
          </div>
          {opened && money.popup !== null ? (
            <FeePopup
              popup={money.popup}
              close={() => {
                setOpened(false);
              }}
            />
          ) : null}
        </>
      )}
      {reward === null ? null : <div className="text-muted">{reward}</div>}
    </div>
  );
}
