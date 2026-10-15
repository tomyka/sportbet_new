import type { JSX } from 'react';
import type { Flash } from '../../../server/flash';
import type { PreviewState } from '../../../server/import/import';
import { ImportFormView } from './import-form-view';
import { ImportPlanView } from './import-plan-view';

/** What a preview that has no plan says: the problem as a refusal, the limit as sportbet's throttle. */
function stateFlash(state: PreviewState): Flash | null {
  switch (state.kind) {
    case 'problem':
      return { kind: 'import-refused', problem: state.problem };
    case 'throttled':
      return { kind: 'throttled', minutes: state.minutes };
    case 'plan':
    case 'no-tournament':
      return null;
  }
}

/**
 * /admin/import/preview: the season form (with the code that was previewed)
 * and, for a plan, "Ką padarys importas" under it. A preview that could not
 * be made is the form with its reason above; the one-time message (R-93's
 * "peržiūrėkite dar kartą") shows on the form beside the fresh plan.
 */
export function ImportPreviewView({
  state,
  flash,
}: {
  state: PreviewState;
  flash: Flash | null;
}): JSX.Element {
  if (state.kind === 'no-tournament') {
    return <ImportFormView tournament={null} flash={flash} />;
  }
  if (state.kind !== 'plan') {
    return (
      <ImportFormView
        tournament={state.tournament}
        flash={stateFlash(state) ?? flash}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ImportFormView
        tournament={state.tournament}
        flash={flash}
        season={state.season}
      />
      <ImportPlanView
        plan={state.plan}
        season={state.season}
        fingerprint={state.fingerprint}
      />
    </div>
  );
}
