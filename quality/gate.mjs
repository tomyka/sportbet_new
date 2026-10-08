// Deterministic quality gate runner. Same command for you, the AI agent's hooks, and CI.
//
//   node quality/gate.mjs check              all static + test gates (no mutation)
//   node quality/gate.mjs mutation           mutation test uncommitted source changes
//   node quality/gate.mjs mutation --branch  mutation test changes vs the base branch (CI pull requests)
//   node quality/gate.mjs mutation --full    mutation test everything (nightly)
//   node quality/gate.mjs all                check + mutation (uncommitted changes)
//   add --only lint,typecheck to run selected gates
//
// Exit code 0 = all gates passed, 1 = at least one failed. Output is short and agent-readable.
// One run at a time per working tree: a second run waits for the first (quality/lock.mjs).
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT,
  bin,
  branchChangedFiles,
  changedFiles,
  listFiles,
  loadConfig,
  matchesAny,
  run,
  toRel,
  trimOutput,
} from './lib.mjs';
import { acquireGateLock } from './lock.mjs';

const config = loadConfig();
const argv = process.argv.slice(2);
const mode = argv[0] ?? 'check';
const onlyArg = argv.includes('--only')
  ? argv[argv.indexOf('--only') + 1]
  : null;
const only = onlyArg ? new Set(onlyArg.split(',')) : null;

const hint = {
  format: 'Run "node quality/fix.mjs" (or npx prettier --write .) to format.',
  lint: 'Fix the code. Inline eslint-disable comments are ignored by design.',
  typecheck:
    'Fix the type errors. Do not use any, non-null assertions or ts-comments.',
  markers: 'Remove the suppression comments and fix the underlying issue.',
  test: 'Fix failing tests or add tests until coverage thresholds pass.',
  crap: 'Add tests for these functions or split them into smaller ones.',
  deadcode: 'Delete unused files/exports/dependencies, or wire them up.',
  architecture: 'Remove the forbidden import (see rule name).',
  mutation:
    'Surviving mutants = behaviour no test checks. Add assertions that would fail for each mutant.',
};

function gateFormat() {
  return run(bin('prettier'), ['--check', '.', '--log-level', 'warn']);
}
function gateLint() {
  return run(bin('eslint'), ['.', '--max-warnings', '0']);
}
// The workspace's packages (pnpm-workspace.yaml: apps/*, packages/*, tools/*).
function workspacePackages() {
  return ['apps', 'packages', 'tools'].flatMap((group) =>
    existsSync(join(ROOT, group))
      ? readdirSync(join(ROOT, group))
          .map((name) => `${group}/${name}`)
          .filter((p) => existsSync(join(ROOT, p, 'package.json')))
      : [],
  );
}
// Every package is typechecked on its own settings plus the kit's strict
// flags (its tsconfig.strict.json); a package without one fails the gate.
function gateTypecheck() {
  const packages = workspacePackages();
  const missing = packages.filter(
    (p) => !existsSync(join(ROOT, p, 'tsconfig.strict.json')),
  );
  if (missing.length > 0)
    return {
      code: 1,
      out: `No tsconfig.strict.json in: ${missing.join(', ')}`,
      ms: 0,
    };
  const results = packages.map((p) =>
    run(bin('tsc'), ['-p', `${p}/tsconfig.strict.json`, '--pretty', 'false']),
  );
  return {
    code: results.some((r) => r.code !== 0) ? 1 : 0,
    out: results.map((r) => r.out).join(''),
    ms: results.reduce((sum, r) => sum + r.ms, 0),
  };
}
function gateMarkers() {
  const files = listFiles([...config.sourceGlobs, ...config.testGlobs]);
  const hits = [];
  for (const f of files) {
    readFileSync(join(ROOT, f), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        for (const m of config.forbiddenMarkers)
          if (line.includes(m)) hits.push(`${f}:${i + 1}  "${m}"`);
      });
  }
  return {
    code: hits.length ? 1 : 0,
    out: hits.length
      ? `Forbidden suppression markers:\n${hits.join('\n')}`
      : '',
    ms: 0,
  };
}
// Every test file runs in a vitest project or is a named suite outside the
// gate (testsOutsideGate), so a test cannot silently stop running; and every
// named suite still names a file.
function unrunTests() {
  const listing = join(
    ROOT,
    'node_modules',
    '.cache',
    'ts-quality',
    'tests.json',
  );
  rmSync(listing, { force: true });
  const r = run(bin('vitest'), ['list', '--filesOnly', `--json=${listing}`]);
  if (r.code !== 0 || !existsSync(listing))
    return `Could not list the projects' test files:\n${trimOutput(r.out)}`;
  const listed = new Set(
    JSON.parse(readFileSync(listing, 'utf8')).map(({ file }) => toRel(file)),
  );
  const outside = config.testsOutsideGate.map(({ glob }) => glob);
  const files = listFiles(config.testGlobs);
  const unrun = files.filter((f) => !listed.has(f) && !matchesAny(f, outside));
  const stale = outside.filter(
    (glob) => !files.some((f) => matchesAny(f, [glob])),
  );
  return [
    ...(unrun.length
      ? [
          'Test files no vitest project runs, and not in testsOutsideGate:',
          ...unrun,
        ]
      : []),
    ...(stale.length
      ? ['testsOutsideGate entries matching no test file:', ...stale]
      : []),
  ].join('\n');
}
function gateTest() {
  rmSync(join(ROOT, 'coverage'), { recursive: true, force: true });
  const unrun = unrunTests();
  const r = run(bin('vitest'), ['run', '--coverage']);
  if (!unrun) return r;
  return { code: 1, out: `${unrun}\n${r.out}`, ms: r.ms };
}
function gateCrap() {
  if (!existsSync(join(ROOT, 'coverage', 'coverage-final.json'))) {
    return {
      code: 1,
      out: 'Skipped: no coverage data because the test gate failed.',
      ms: 0,
    };
  }
  return run(process.execPath, [join('quality', 'crap.mjs')]);
}
function gateDeadcode() {
  // knip parses with oxc's raw transfer by default, which takes a 6 GiB
  // ArrayBuffer per parser. Windows commits that memory up front, so with less
  // than 6 GiB of commit charge left (other agents, a Stryker run) knip dies
  // with "Array buffer allocation failed" instead of reporting findings. The
  // plain parser gives the same results.
  return run(bin('knip'), ['--no-progress'], {
    env: { KNIP_DISABLE_RAW_TRANSFER: '1' },
  });
}
function gateArchitecture() {
  const srcDirs = workspacePackages()
    .map((p) => `${p}/src`)
    .filter((d) => existsSync(join(ROOT, d)));
  return run(bin('depcruise'), [
    ...srcDirs,
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'err',
  ]);
}

function summariseMutants(threshold) {
  const reportPath = join(ROOT, 'reports', 'mutation', 'mutation.json');
  if (!existsSync(reportPath))
    return { ok: false, text: 'No mutation report produced.' };
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const counts = { Killed: 0, Timeout: 0, Survived: 0, NoCoverage: 0 };
  const survivors = [];
  for (const [file, data] of Object.entries(report.files)) {
    for (const m of data.mutants) {
      if (m.status in counts) counts[m.status]++;
      if (m.status === 'Survived' || m.status === 'NoCoverage') {
        survivors.push(
          `  ${file}:${m.location.start.line} [${m.status}] ${m.mutatorName}: ${JSON.stringify(m.replacement ?? '')}`,
        );
      }
    }
  }
  const detected = counts.Killed + counts.Timeout;
  const total = detected + counts.Survived + counts.NoCoverage;
  const score = total === 0 ? 100 : Math.round((detected / total) * 1000) / 10;
  const ok = score >= threshold;
  const lines = [
    `Mutation score ${score}% (threshold ${threshold}%): ${detected} detected, ${counts.Survived} survived, ${counts.NoCoverage} not covered.`,
  ];
  if (!ok || survivors.length)
    lines.push('Surviving mutants (first 30):', ...survivors.slice(0, 30));
  return { ok, text: lines.join('\n') };
}

function gateMutation(scope) {
  let files;
  let threshold = config.mutation.breakChanged;
  const sourceOnly = (fs) => fs.filter((f) => !matchesAny(f, config.testGlobs));
  if (scope === 'full') {
    threshold = config.mutation.breakFull;
  } else if (scope === 'branch') {
    files = branchChangedFiles(
      config.sourceGlobs,
      `origin/${config.baseBranch}`,
    );
    if (files === null)
      return {
        code: 1,
        out: `Could not diff against origin/${config.baseBranch}.`,
        ms: 0,
      };
    files = sourceOnly(files);
  } else {
    files = sourceOnly(changedFiles(config.sourceGlobs));
  }
  if (files && files.length === 0)
    return { code: 0, out: 'No changed source files to mutate.', ms: 0 };
  const args = ['run'];
  if (files) args.push('--mutate', files.join(','));
  rmSync(join(ROOT, 'reports', 'mutation', 'mutation.json'), { force: true }); // never read a stale report
  const r = run(bin('stryker'), args);
  if (!existsSync(join(ROOT, 'reports', 'mutation', 'mutation.json'))) {
    const noTests = /No tests were found/i.test(r.out);
    return {
      code: 1,
      out: noTests
        ? `No tests exercise the changed file(s): ${(files ?? []).join(', ')}. Write tests for them.`
        : trimOutput(r.out),
      ms: r.ms,
    };
  }
  const summary = summariseMutants(threshold);
  return { code: summary.ok ? 0 : 1, out: summary.text, ms: r.ms };
}

const CHECK = [
  ['format', gateFormat],
  ['lint', gateLint],
  ['typecheck', gateTypecheck],
  ['markers', gateMarkers],
  ['test', gateTest],
  ['crap', gateCrap],
  ['deadcode', gateDeadcode],
  ['architecture', gateArchitecture],
];

let gates;
if (mode === 'check') gates = CHECK;
else if (mode === 'mutation') {
  const scope = argv.includes('--full')
    ? 'full'
    : argv.includes('--branch')
      ? 'branch'
      : 'changed';
  gates = [['mutation', () => gateMutation(scope)]];
} else if (mode === 'all')
  gates = [...CHECK, ['mutation', () => gateMutation('changed')]];
else {
  console.error(`Unknown mode "${mode}". Use check | mutation | all.`);
  process.exit(2);
}
if (only) gates = gates.filter(([name]) => only.has(name));

// One run at a time in this tree (quality/lock.mjs); wait up to
// QUALITY_GATE_LOCK_WAIT_MIN minutes (default 30) for another to finish.
const lockWaitMin = Number(process.env.QUALITY_GATE_LOCK_WAIT_MIN ?? 30);
const lockRefusal = acquireGateLock(
  argv.join(' ') || 'check',
  lockWaitMin * 60_000,
);
if (lockRefusal) {
  console.log(`[FAIL] lock\n    ${lockRefusal}`);
  process.exit(1);
}

const failed = [];
for (const [name, fn] of gates) {
  let r;
  try {
    r = fn();
  } catch (e) {
    r = { code: 1, out: String(e.message ?? e), ms: 0 };
  }
  const status = r.code === 0 ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${name} (${(r.ms / 1000).toFixed(1)}s)`);
  if (r.code !== 0) {
    failed.push(name);
    console.log(trimOutput(r.out).replace(/^/gm, '    '));
    console.log(`    -> ${hint[name]}`);
  } else if (name === 'mutation' || name === 'crap') {
    const first = r.out.trim().split('\n')[0];
    console.log(`    ${first}`);
  }
}

console.log(
  failed.length
    ? `\nQUALITY GATE FAILED: ${failed.join(', ')}`
    : `\nQUALITY GATE PASSED (${gates.map(([n]) => n).join(', ')})`,
);
process.exit(failed.length ? 1 : 0);
