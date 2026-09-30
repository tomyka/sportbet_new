import { z } from 'zod';

/** One whole number a range invariant is expected to accept or refuse. */
export interface RangeExample {
  readonly label: string;
  readonly value: number;
}

export interface RangeInvariantDefinition {
  /** What the rule is about, as error messages and test names show it. */
  readonly name: string;
  /** The smallest whole number allowed. */
  readonly min: number;
  /** The largest whole number allowed, if there is one. */
  readonly max?: number;
  /** Inputs both sides must accept, and inputs both must refuse. */
  readonly accepts: readonly RangeExample[];
  readonly refuses: readonly RangeExample[];
}

/**
 * A rule on a whole number that the domain schema and a database CHECK both
 * hold: at least `min` and, if there is one, at most `max`. The unit is the
 * column's own (a score, a place, a count of hundredths); for a rule that
 * only draws the line at zero, the same invariant holds whatever the unit.
 * `packages/db` renders the CHECK from `min` and `max`, and the tests on both
 * sides run `accepts` and `refuses` against their side.
 */
export interface RangeInvariant extends RangeInvariantDefinition {
  /** The rule as a Zod schema: a safe integer within the range. */
  readonly schema: z.ZodInt;
}

/**
 * Throws if the bounds are not safe integers, if `max` is below `min`, or if
 * the invariant's own schema disagrees with one of its examples.
 */
export function defineRangeInvariant(
  definition: RangeInvariantDefinition,
): RangeInvariant {
  const { name, min, max } = definition;
  if (!Number.isSafeInteger(min)) {
    throw new Error(`invariant ${name}: the minimum must be a safe integer`);
  }
  if (max !== undefined && !(Number.isSafeInteger(max) && max >= min)) {
    throw new Error(
      `invariant ${name}: the maximum must be a safe integer no smaller than the minimum`,
    );
  }
  let schema = z.int({ message: `Not a valid ${name}` }).min(min, {
    message: `A ${name} is at least ${String(min)}`,
  });
  if (max !== undefined) {
    schema = schema.max(max, {
      message: `A ${name} is at most ${String(max)}`,
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
