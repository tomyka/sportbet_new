import { z } from 'zod';

/** One input an invariant is expected to accept or refuse, named for test output. */
export interface InvariantExample {
  readonly label: string;
  readonly value: string;
}

export interface InvariantDefinition {
  /** What the rule is about, as error messages and test names show it. */
  readonly name: string;
  /**
   * A regular expression both JavaScript and Postgres read the same way. It
   * is spliced into SQL as a string literal, so it may hold no quote.
   */
  readonly pattern: string;
  /** The most characters (code points, as Postgres counts them) allowed. */
  readonly maxLength?: number;
  /** Inputs both sides must accept, and inputs both must refuse. */
  readonly accepts: readonly InvariantExample[];
  readonly refuses: readonly InvariantExample[];
}

/**
 * A rule on a text value that the domain schema and a database CHECK both
 * hold. `packages/db` builds the CHECK from `pattern` and `maxLength`, and
 * the tests on both sides run `accepts` and `refuses` against their side.
 */
export interface Invariant extends InvariantDefinition {
  /** The rule as a Zod schema: the pattern, and the maximum length if any. */
  readonly schema: z.ZodString;
}

const QUOTE = /['"]/;

/**
 * Throws if the definition cannot be held safely on both sides, or if its
 * own schema disagrees with one of its examples.
 */
export function defineInvariant(definition: InvariantDefinition): Invariant {
  const { name, pattern, maxLength } = definition;
  if (QUOTE.test(pattern)) {
    throw new Error(
      `invariant ${name}: the pattern contains a quote character, and it is spliced into SQL`,
    );
  }
  if (
    maxLength !== undefined &&
    !(Number.isInteger(maxLength) && maxLength > 0)
  ) {
    throw new Error(
      `invariant ${name}: the maximum length must be a positive integer`,
    );
  }
  let schema = z.string().regex(new RegExp(pattern));
  if (maxLength !== undefined) {
    schema = schema.refine((value) => Array.from(value).length <= maxLength, {
      message: `At most ${String(maxLength)} characters`,
    });
  }
  const wronglyRefused = definition.accepts.find(
    ({ value }) => !schema.safeParse(value).success,
  );
  if (wronglyRefused !== undefined) {
    throw new Error(
      `invariant ${name}: refuses its accepted example "${wronglyRefused.label}"`,
    );
  }
  const wronglyAccepted = definition.refuses.find(
    ({ value }) => schema.safeParse(value).success,
  );
  if (wronglyAccepted !== undefined) {
    throw new Error(
      `invariant ${name}: accepts its refused example "${wronglyAccepted.label}"`,
    );
  }
  return { ...definition, schema };
}
