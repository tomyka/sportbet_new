import type { JSX } from 'react';
import { clock, Refusal, useCountdown, type FormAction } from './dialog-parts';
import { Icon } from './icon';

/** One of the step's forms: its test id and the intent it posts. */
interface StepForm {
  readonly testId: string;
  readonly intent: string;
}

export interface CodeStepForms {
  readonly cancel: StepForm;
  readonly verify: StepForm;
  readonly resend: StepForm;
}

export interface CodeStepProps {
  /** The address the code went to, as the visitor typed it. */
  readonly email: string;
  readonly resendIn: number;
  readonly expiresIn: number;
  /** The answer to the last code typed, or null. */
  readonly refusal: string | null;
  /** The code was sent again (issue 114). */
  readonly resent: boolean;
  readonly formAction: FormAction;
  readonly pending: boolean;
  readonly forms: CodeStepForms;
  readonly codeInputId: string;
  /** "Prisijungti" or "Užbaigti registraciją". */
  readonly submitLabel: string;
  /** What the resend posts besides its intent: the address, or the four answers again. */
  readonly resendFields: Readonly<Record<string, string>>;
}

/** The step's own way back: a form posting its cancel intent. */
function BackForm({
  formAction,
  form,
}: {
  formAction: FormAction;
  form: StepForm;
}): JSX.Element {
  return (
    <form action={formAction} data-testid={form.testId}>
      <input type="hidden" name="intent" value={form.intent} />
      <button
        type="submit"
        className="mb-2 inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent py-1 pr-1.5 text-[0.85rem] font-medium text-muted hover:text-text"
      >
        <Icon name="arrow-left" /> Atgal
      </button>
    </form>
  );
}

/** "Kodą išsiuntėme į" the address, as typed. */
function SentTo({ email }: { email: string }): JSX.Element {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-[38px] shrink-0 items-center justify-center rounded-full bg-accent-tint text-accent"
      >
        <Icon name="envelope" />
      </span>
      <p className="m-0 text-[0.85rem] leading-[1.45] text-muted">
        Kodą išsiuntėme į{' '}
        <strong className="font-semibold text-text">{email}</strong>
      </p>
    </div>
  );
}

/** The code's life, counted down, after "sent again" when it was. */
function CodeLife({
  resent,
  expiresIn,
}: {
  resent: boolean;
  expiresIn: number;
}): JSX.Element {
  return (
    <p className="mb-3.5 text-center text-[0.78rem] text-muted">
      {resent ? (
        <span className="font-semibold text-ok">Kodą išsiuntėme iš naujo.</span>
      ) : null}
      {expiresIn > 0
        ? `${resent ? ' Galioja dar' : 'Kodas galioja dar'} ${clock(expiresIn)}`
        : 'Kodo galiojimas baigėsi - išsiųskite naują.'}
    </p>
  );
}

/** The code box and the submit, posting the verify intent. */
function CodeForm({
  props,
  expiresIn,
}: {
  props: CodeStepProps;
  expiresIn: number;
}): JSX.Element {
  const { formAction, forms, codeInputId, refusal, resent, pending } = props;
  return (
    <form action={formAction} data-testid={forms.verify.testId}>
      <input type="hidden" name="intent" value={forms.verify.intent} />
      <label htmlFor={codeInputId} className="sr-only">
        8 skaitmenų kodas
      </label>
      <input
        id={codeInputId}
        name="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={8}
        placeholder={'\u2022'.repeat(8)}
        autoFocus
        className={`mb-2 block w-full rounded-[12px] border-[1.5px] bg-surface-2 px-4 py-3.5 text-center text-[1.4rem] font-bold tracking-[0.3em] indent-[0.3em] text-text outline-none placeholder:text-dim focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-tint)] ${refusal === null ? 'border-border' : 'border-bad'}`}
      />
      <CodeLife resent={resent} expiresIn={expiresIn} />
      <button
        type="submit"
        disabled={pending}
        className="mb-3 block w-full cursor-pointer rounded-full border-none bg-accent p-3.5 text-base font-bold text-on-accent hover:bg-accent-hover"
      >
        {props.submitLabel}
      </button>
    </form>
  );
}

/** "Negavote?": the resend, a real form posting step one again once its cooldown is over. */
function ResendLine({
  props,
  resendIn,
}: {
  props: CodeStepProps;
  resendIn: number;
}): JSX.Element {
  const { formAction, forms, resendFields, pending } = props;
  return (
    <div className="m-0 text-[0.78rem] leading-[1.5] text-muted">
      Negavote? Patikrinkite šlamšto aplanką arba{' '}
      <form
        action={formAction}
        className="inline"
        data-testid={forms.resend.testId}
      >
        <input type="hidden" name="intent" value={forms.resend.intent} />
        {Object.entries(resendFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          type="submit"
          aria-label="Siųsti kodą iš naujo"
          disabled={resendIn > 0 || pending}
          className="cursor-pointer border-none bg-transparent p-0 font-semibold text-accent hover:underline disabled:cursor-not-allowed disabled:text-dim disabled:no-underline"
        >
          {resendIn > 0
            ? `siųskite iš naujo (${clock(resendIn)})`
            : 'siųskite iš naujo'}
        </button>
      </form>
      .
    </div>
  );
}

/**
 * partials/auth/login-code-step and register-code-step, which share one
 * shape ("The code step has one implementation"): one job on screen - the
 * code - and its own way back; the code's life and the resend's cooldown
 * counted down; the resend a real form posting step one again.
 */
export function CodeStep(props: CodeStepProps): JSX.Element {
  const expiresIn = useCountdown(props.expiresIn);
  const resendIn = useCountdown(props.resendIn);
  return (
    <div className="p-6">
      <BackForm formAction={props.formAction} form={props.forms.cancel} />
      <SentTo email={props.email} />
      {props.refusal === null ? null : <Refusal message={props.refusal} />}
      <CodeForm props={props} expiresIn={expiresIn} />
      <ResendLine props={props} resendIn={resendIn} />
    </div>
  );
}
