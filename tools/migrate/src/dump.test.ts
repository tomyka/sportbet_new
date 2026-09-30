import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { refuse } from '@sportbet/domain';
import { describe, expect, it } from 'vitest';
import { checkDump, COMPLETION_MARKER } from './dump';

const dump = (engine: string, last = COMPLETION_MARKER) =>
  gzipSync(
    [
      '-- SportBet database dump',
      '--',
      `-- engine       : ${engine}`,
      '-- tag          : daily',
      'SET NAMES utf8mb4;',
      '',
      '--',
      '-- rows written : 0',
      last,
      '',
    ].join('\n'),
  );

describe('checkDump', () => {
  it("accepts a whole dump of the image's major.minor, giving its size, hash and engine", () => {
    const file = dump('mysql 26.7.0');
    expect(checkDump(file, '26.7.0')).toEqual({
      ok: true,
      value: {
        bytes: file.length,
        sha256: createHash('sha256').update(file).digest('hex'),
        engine: 'mysql 26.7.0',
      },
    });
  });

  it('accepts another patch release of the same major.minor', () => {
    expect(checkDump(dump('mysql 26.7.3'), '26.7.0').ok).toBe(true);
  });

  it('refuses a file that is not gzip', () => {
    expect(
      checkDump(Buffer.from('-- SportBet database dump'), '26.7.0'),
    ).toEqual(refuse('not-gzip'));
  });

  it('refuses a truncated gzip file', () => {
    const file = dump('mysql 26.7.0');
    expect(checkDump(file.subarray(0, file.length - 8), '26.7.0')).toEqual(
      refuse('not-gzip'),
    );
  });

  it('refuses a dump without the completion marker', () => {
    expect(
      checkDump(dump('mysql 26.7.0', '-- rows written : 0'), '26.7.0'),
    ).toEqual(refuse('incomplete'));
  });

  it("refuses a dump of another MySQL major.minor than the image's", () => {
    expect(checkDump(dump('mysql 8.4.6'), '26.7.0')).toEqual(
      refuse('engine-differs-from-image'),
    );
  });

  it('refuses a dump that names no engine', () => {
    expect(checkDump(dump('sqlite 3.45.1'), '26.7.0')).toEqual(
      refuse('no-engine-line'),
    );
  });
});
