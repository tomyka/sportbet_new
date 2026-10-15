'use client';

import type { JSX } from 'react';
import { useState } from 'react';
import { STAGES, stageRate, type Stage } from '@sportbet/domain';
import { Icon } from '../shell/icon';
import { EVENT_INSERT_PATH } from './admin-paths';
import {
  FIELD_INPUT,
  PRIMARY_BUTTON,
  ROUND_GRID,
  TINY_INPUT,
} from './admin-styles';
import { StageOptions } from './stage-options';

/**
 * The stage and rate boxes of the insert row. R-10: the rate follows the
 * stage chosen - play-in 1, play-offs 2, Final Four 3, final 3, regular 1 -
 * and stays editable.
 */
function StageAndRate(): JSX.Element {
  const [stage, setStage] = useState<Stage>('regular');
  const [rate, setRate] = useState(String(stageRate('regular').value));
  return (
    <>
      <select
        name="stage"
        aria-label="Naujo turo etapas"
        value={stage}
        onChange={(event) => {
          const chosen = STAGES.find((each) => each === event.target.value);
          if (chosen === undefined) return;
          setStage(chosen);
          setRate(String(stageRate(chosen).value));
        }}
        className={FIELD_INPUT}
      >
        <StageOptions />
      </select>
      <input
        type="number"
        name="rate"
        aria-label="Naujo turo koeficientas"
        value={rate}
        onChange={(event) => {
          setRate(event.target.value);
        }}
        min={1}
        max={127}
        step={1}
        className={TINY_INPUT}
      />
    </>
  );
}

/**
 * The insert row of admin/events.blade.php: "Turo pavadinimas…", the day,
 * the two switches, the stage and the rate, and "Pridėti turą".
 */
export function NewRoundRow(): JSX.Element {
  return (
    <form
      method="post"
      action={EVENT_INSERT_PATH}
      className={ROUND_GRID}
      data-testid="new-round-row"
    >
      <span className="text-muted">
        <Icon name="plus-lg" />
      </span>
      <input
        type="text"
        name="event"
        aria-label="Naujo turo pavadinimas"
        placeholder="Turo pavadinimas…"
        className={FIELD_INPUT}
      />
      <input
        type="number"
        name="eventDay"
        aria-label="Naujo turo diena"
        placeholder="1"
        min={1}
        className={TINY_INPUT}
      />
      <input
        type="checkbox"
        name="eventSurvival"
        aria-label="Naujas išlikimo turas"
        className="mx-auto size-4"
      />
      <input
        type="checkbox"
        name="isKnockout"
        aria-label="Naujas play-off turas"
        className="mx-auto size-4"
      />
      <StageAndRate />
      <button
        type="submit"
        title="Pridėti turą"
        aria-label="Pridėti turą"
        className={`${PRIMARY_BUTTON} justify-center px-2`}
      >
        <Icon name="plus-lg" />
      </button>
    </form>
  );
}
