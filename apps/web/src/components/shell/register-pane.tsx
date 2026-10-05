import { Refusal, type FormAction } from './dialog-parts';
import { Icon, type IconName } from './icon';
import {
  EMPTY_REGISTER_VALUES,
  type RegisterField,
  type RegisterState,
} from './register-state';

interface FieldProps {
  readonly name: RegisterField;
  readonly placeholder: string;
  readonly value: string;
  readonly error: string | undefined;
  readonly type?: 'text' | 'email';
  readonly icon?: IconName;
  readonly required?: boolean;
}

/** One input of modals/register: its icon, its answer kept, its error under it. */
function Field({
  name,
  placeholder,
  value,
  error,
  type = 'text',
  icon,
  required = false,
}: FieldProps) {
  return (
    <div className="min-w-0 flex-1">
      <div
        className={`flex items-stretch overflow-hidden rounded-md border ${error === undefined ? 'border-border' : 'border-bad'}`}
      >
        {icon === undefined ? null : (
          <span
            aria-hidden="true"
            className="flex items-center bg-surface-2 px-3 text-muted"
          >
            <Icon name={icon} />
          </span>
        )}
        <input
          type={type}
          name={name}
          aria-label={placeholder}
          placeholder={placeholder}
          defaultValue={value}
          required={required}
          aria-invalid={error !== undefined}
          className={`min-w-0 flex-1 bg-card py-2 pr-3 text-text outline-none placeholder:text-dim ${icon === undefined ? 'pl-3' : 'pl-1'}`}
        />
      </div>
      {error === undefined ? null : (
        <p className="mt-1 mb-0 text-[0.875em] text-bad">{error}</p>
      )}
    </div>
  );
}

/**
 * modals/register: step one of registering (sportbet issue 102) - a
 * username, a name, a surname and an address, behind a honeypot real
 * visitors never see. A refusal draws each field's text under it, the
 * answers kept (sportbet's old()); one that belongs to no field sits above
 * the form (Q2).
 */
export function RegisterPane({
  state,
  formAction,
  pending,
}: {
  state: RegisterState;
  formAction: FormAction;
  pending: boolean;
}) {
  const errors = state.kind === 'refused' ? state.errors : {};
  const values =
    state.kind === 'refused' ? state.values : EMPTY_REGISTER_VALUES;
  return (
    <div className="p-6">
      {state.kind === 'code-refused' ? (
        <Refusal message={state.message} />
      ) : null}
      {/* Keyed by the answers: a refusal draws the form again with them. */}
      <form
        key={JSON.stringify(values)}
        action={formAction}
        data-testid="register-request"
      >
        <input type="hidden" name="intent" value="request" />
        {/* Honeypot: hidden from real users, bots fill it and get silently rejected */}
        <div
          aria-hidden="true"
          className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0"
        >
          <label htmlFor="website">Leave this blank</label>
          <input
            type="text"
            name="website"
            id="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        <div className="mb-3">
          <Field
            name="username"
            placeholder="Slapyvardis"
            icon="person"
            value={values.username}
            error={errors.username}
            required
          />
        </div>
        <div className="mb-3 flex gap-2">
          <Field
            name="name"
            placeholder="Vardas"
            value={values.name}
            error={errors.name}
            required
          />
          <Field
            name="surname"
            placeholder="Pavardė"
            value={values.surname}
            error={errors.surname}
          />
        </div>
        {/* The address is the credential (#35): sign-in codes are sent here. */}
        <div className="mb-4">
          <Field
            name="email"
            type="email"
            placeholder="El. paštas"
            icon="envelope"
            value={values.email}
            error={errors.email}
            required
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="block w-full cursor-pointer rounded-md border-none bg-accent px-3 py-2 font-semibold text-on-accent hover:bg-accent-hover"
        >
          Registruotis
        </button>
      </form>
    </div>
  );
}
