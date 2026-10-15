'use client';

import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { FeePayment, FeePopup as FeePopupView } from '@sportbet/domain';
import { BUTTON_SECONDARY } from '../hub/styles';
import { Modal } from '../leagues/modal';
import { Icon } from '../shell/icon';

/** fee.blade.php's script: how long a copied row shows its done state. */
export const COPIED_MS = 1200;

/** One copyable row: its label, its value and the button that copies the value. */
function CopyRow({
  label,
  value,
  copyLabel,
  accent = false,
}: {
  label: string;
  value: string;
  copyLabel: string;
  accent?: boolean;
}): JSX.Element {
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const copy = () => {
    void navigator.clipboard.writeText(value).then(() => {
      setDone(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setDone(false);
      }, COPIED_MS);
    });
  };
  return (
    <div className="flex items-center gap-2 border-b border-border py-[7px] last:border-b-0">
      <div className="min-w-0 flex-auto">
        <span className="block text-[0.62rem] tracking-[0.4px] text-dim uppercase">
          {label}
        </span>
        <span
          className={`block text-[0.85rem] font-semibold [overflow-wrap:anywhere] ${accent ? 'text-accent' : 'text-text'}`}
        >
          {value}
        </span>
      </div>
      <button
        type="button"
        aria-label={copyLabel}
        data-done={done}
        onClick={copy}
        className={`inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-[10px] border bg-transparent ${done ? 'border-ok text-ok' : 'border-border text-muted hover:border-border-strong hover:text-text'}`}
      >
        <Icon name={done ? 'check-lg' : 'clipboard'} />
      </button>
    </div>
  );
}

const NOTE = 'mt-2 text-[0.72rem] leading-normal text-muted';

/** Issue 312: three rows and no QR - what a member copies into their banking app by hand. */
function PaymentRows({ payment }: { payment: FeePayment }): JSX.Element {
  return (
    <>
      <div>
        <CopyRow
          label="Gavėjas"
          value={payment.beneficiary}
          copyLabel="Kopijuoti gavėją"
        />
        <CopyRow
          label="Sąskaita (IBAN)"
          value={payment.iban}
          copyLabel="Kopijuoti IBAN"
        />
        <CopyRow
          label="Mokėjimo paskirtis"
          value={payment.reference}
          copyLabel="Kopijuoti mokėjimo paskirtį"
          accent
        />
      </div>
      <p className={NOTE}>
        Mokėjimo paskirtį nurodykite tiksliai taip, kaip parašyta.
      </p>
      {payment.note === null ? null : <p className={NOTE}>{payment.note}</p>}
    </>
  );
}

/**
 * The "Kaip sumokėti" pop-up (#feeModal): how much to pay and, when the
 * league's admin has named both a beneficiary and an account, the three
 * copyable rows and the note; else that the administrator has not said.
 * It draws only what the fee panel's view holds - a paid member has no
 * pop-up, so no account number is ever on their page.
 */
export function FeePopup({
  popup,
  close,
}: {
  popup: FeePopupView;
  close: () => void;
}): JSX.Element {
  return (
    <Modal open close={close} title="Dalyvio mokestis" icon="cash-coin" narrow>
      <div className="mb-3.5 flex items-baseline justify-between gap-2.5 rounded-[10px] bg-bad-tint px-3 py-2.5 text-bad">
        <span className="text-[0.8rem] font-semibold">Mokėti</span>
        <b className="text-[1.15rem] tabular-nums">{`${popup.amount} €`}</b>
      </div>
      {popup.payment === null ? (
        <div className="rounded-[10px] bg-surface-2 px-3 py-3.5 text-center text-[0.85rem] leading-normal text-muted">
          Mokėjimo rekvizitų administratorius dar nenurodė. Susisiekite su lygos
          administratoriumi.
        </div>
      ) : (
        <PaymentRows payment={popup.payment} />
      )}
      <div className="mt-4 flex justify-end">
        <button type="button" onClick={close} className={BUTTON_SECONDARY}>
          Uždaryti
        </button>
      </div>
    </Modal>
  );
}
