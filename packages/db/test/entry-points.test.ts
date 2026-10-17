import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import * as barrel from '../src';

// The narrow entry points (#36): `@sportbet/db/<area>`, one file each in
// src/entries/, for the code that never touches the points tables. A caller
// that needs only an account's session or the database connection imports
// its area and does not load the whole package, so a mutant in a schema file
// re-runs only the tests that reach it.

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const PACKAGE = z
  .object({ exports: z.record(z.string(), z.string()) })
  .parse(
    JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ),
  );
const bindings = z.record(z.string(), z.unknown());

const NOT_NARROW = new Set(['.', './migrations', './testing']);
const NARROW = Object.entries(PACKAGE.exports).filter(
  ([subpath]) => !NOT_NARROW.has(subpath),
);

/** The schema file whose mutants #36 is about: the longest to test. */
const POINTS_SCHEMA = resolve(SRC, 'points/schema.ts');

function isErased(node: ts.ImportDeclaration | ts.ExportDeclaration): boolean {
  if (ts.isExportDeclaration(node)) {
    return node.isTypeOnly;
  }
  const clause = node.importClause;
  if (clause === undefined) return false;
  if (clause.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
  const named = clause.namedBindings;
  return (
    clause.name === undefined &&
    named !== undefined &&
    ts.isNamedImports(named) &&
    named.elements.every((element) => element.isTypeOnly)
  );
}

function specifierOf(node: ts.Node): string | undefined {
  if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) {
    return undefined;
  }
  const specifier = node.moduleSpecifier;
  if (specifier === undefined || !ts.isStringLiteral(specifier)) {
    return undefined;
  }
  return isErased(node) ? undefined : specifier.text;
}

function resolveRelative(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  return [`${base}.ts`, `${base}/index.ts`].find((file) => existsSync(file));
}

/** Every file the entry loads at run time: its value imports, followed. */
function loadedBy(entry: string): Set<string> {
  const loaded = new Set<string>();
  const pending = [entry];
  for (let file = pending.pop(); file !== undefined; file = pending.pop()) {
    if (loaded.has(file)) continue;
    loaded.add(file);
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
    );
    for (const statement of source.statements) {
      const specifier = specifierOf(statement);
      if (specifier?.startsWith('.') !== true) continue;
      const next = resolveRelative(file, specifier);
      if (next !== undefined) pending.push(next);
    }
  }
  return loaded;
}

describe('the narrow entry points of @sportbet/db', () => {
  it('has the areas web and the reader import', () => {
    expect(NARROW.map(([subpath]) => subpath).sort()).toEqual([
      './account',
      './admin',
      './connection',
      './edge',
      './import',
      './league',
      './points',
      './prediction',
      './reminder',
      './result',
      './standings',
      './tournament',
    ]);
  });

  it('lists every file of src/entries/ in the package exports, and no other', () => {
    const files = readdirSync(`${SRC}entries`).map(
      (name) => `./src/entries/${name}`,
    );
    expect(NARROW.map(([, target]) => target).sort()).toEqual(files.sort());
  });

  it.each(NARROW)('%s never loads the points schema', (_subpath, target) => {
    const loaded = loadedBy(resolve(SRC, '..', target));
    expect(loaded.has(POINTS_SCHEMA)).toBe(false);
  });

  it.each(NARROW)(
    '%s exports only what the main entry exports, the same bindings',
    async (_subpath, target) => {
      const entry = bindings.parse(await import(resolve(SRC, '..', target)));
      const fromBarrel = bindings.parse(barrel);
      const names = Object.keys(entry);
      expect(names.length).toBeGreaterThan(0);
      expect(
        names.filter((name) => !Object.is(entry[name], fromBarrel[name])),
      ).toEqual([]);
    },
  );
});
