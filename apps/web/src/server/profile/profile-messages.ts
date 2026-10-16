import { z } from 'zod';

/** Laravel's three error bags on /userProfile: the account form, the code box of an address change, the danger zone. */
const PROFILE_BAGS = ['account', 'emailChange', 'userDeletion'] as const;

type ProfileBag = (typeof PROFILE_BAGS)[number];

/** The account form's fields, which a refusal names and whose typed values come back (Laravel's old input). */
export const ACCOUNT_FIELDS = ['username', 'name', 'surname', 'email'] as const;

/**
 * Why a field or a code was refused: the domain's problems, the database's
 * `taken`, the address change's `send-failed` and `throttled`, and the
 * confirmation's `none`, `invalid` and the deletion's `last-superadmin`
 * (R-131). The texts are the profile components' (decision 13).
 */
const profileErrorSchema = z.enum([
  'required',
  'blank',
  'too-long',
  'not-an-email',
  'taken',
  'send-failed',
  'throttled',
  'none',
  'invalid',
  'last-superadmin',
]);

export type ProfileError = z.infer<typeof profileErrorSchema>;

/** A typed value kept in the cookie: more than a field may hold is cut (a cookie is 4 KB). */
export const MAX_VALUE_LENGTH = 300;

const valueSchema = z.string().max(MAX_VALUE_LENGTH);

const errorsSchema = z
  .object({
    username: profileErrorSchema,
    name: profileErrorSchema,
    surname: profileErrorSchema,
    email: profileErrorSchema,
    code: profileErrorSchema,
  })
  .partial()
  .strict();

const valuesSchema = z.object({
  username: valueSchema,
  name: valueSchema,
  surname: valueSchema,
  email: valueSchema,
});

/** The keys a bag's errors may name: the form's fields, or the one code box. */
const keysOf = (bag: ProfileBag): readonly string[] =>
  bag === 'account' ? ACCOUNT_FIELDS : ['code'];

/**
 * A refused profile post (`profile-refused`): its bag, what was refused in
 * it, the typed values for the account form only, and the minutes a
 * throttled address change waits. Anything a bag does not have opens as
 * nothing.
 */
export const profileRefusedSchema = z
  .object({
    kind: z.literal('profile-refused'),
    bag: z.enum(PROFILE_BAGS),
    errors: errorsSchema,
    values: valuesSchema.optional(),
    minutes: z.int().positive().optional(),
  })
  .refine(({ bag, errors, values }) => {
    const named = Object.keys(errors);
    return (
      named.length > 0 &&
      named.every((key) => keysOf(bag).includes(key)) &&
      (bag === 'account' || values === undefined)
    );
  })
  .readonly();
