import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { ok, refuse, type Result } from '@sportbet/domain';

/** The last line of a finished sportbet dump (DatabaseDumpWriter). */
export const COMPLETION_MARKER = '-- SPORTBET DUMP COMPLETE';

export type DumpProblem =
  'not-gzip' | 'incomplete' | 'no-engine-line' | 'engine-differs-from-image';

/** What the report says about the dump: never a row of it. */
export interface DumpFacts {
  readonly bytes: number;
  readonly sha256: string;
  /** The header's engine, e.g. "mysql 26.7.0". */
  readonly engine: string;
}

const ENGINE = /^-- engine +: (mysql (\d+)\.(\d+)\.\d+\S*)$/m;

/**
 * A downloaded dump is used only if it is a whole gzip file, ends with the
 * completion marker, and names in its header an engine whose major.minor
 * is the MySQL image's (`imageVersion`, e.g. "26.7.0").
 */
export function checkDump(
  gzipped: Buffer,
  imageVersion: string,
): Result<DumpFacts, DumpProblem> {
  let text: string;
  try {
    text = gunzipSync(gzipped).toString('utf8');
  } catch {
    return refuse('not-gzip');
  }
  if (!text.endsWith(`\n${COMPLETION_MARKER}\n`)) {
    return refuse('incomplete');
  }
  const engine = ENGINE.exec(text.slice(0, 4096));
  if (engine === null) {
    return refuse('no-engine-line');
  }
  const [major, minor] = imageVersion.split('.');
  if (engine[2] !== major || engine[3] !== minor) {
    return refuse('engine-differs-from-image');
  }
  return ok({
    bytes: gzipped.length,
    sha256: createHash('sha256').update(gzipped).digest('hex'),
    engine: engine[1] ?? '',
  });
}
