import { z } from 'zod';

/** A Postgres connection URL, as every process that talks to the database takes it. */
export const databaseUrlSchema = z.url({ protocol: /^postgres(ql)?$/ });
