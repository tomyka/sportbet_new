import { within } from '@testing-library/react';

// What a component test asked a view for and expects to be a box of a kind:
// a box of another kind is the test's failure, said in words, not a cast.

/** The select labelled `label` inside `scope`. */
export function selectByLabel(
  scope: HTMLElement,
  label: string,
): HTMLSelectElement {
  const found = within(scope).getByLabelText(label);
  if (!(found instanceof HTMLSelectElement)) {
    throw new Error(`"${label}" is not a select`);
  }
  return found;
}

/** The text or checkbox box labelled `label` inside `scope`. */
export function inputByLabel(
  scope: HTMLElement,
  label: string,
): HTMLInputElement {
  const found = within(scope).getByLabelText(label);
  if (!(found instanceof HTMLInputElement)) {
    throw new Error(`"${label}" is not an input`);
  }
  return found;
}

/** The switch (a checkbox) named `name` inside `scope`. */
export function switchByName(
  scope: HTMLElement,
  name: string,
): HTMLInputElement {
  const found = within(scope).getByRole('switch', { name });
  if (!(found instanceof HTMLInputElement)) {
    throw new Error(`"${name}" is not an input`);
  }
  return found;
}

/** The value of the hidden box named `name` in `form`. */
export function hiddenValue(form: Element | null, name: string): string {
  const box = form?.querySelector(`input[name="${name}"]`);
  if (!(box instanceof HTMLInputElement)) {
    throw new Error(`no box named ${name}`);
  }
  return box.value;
}
