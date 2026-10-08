// Shared helpers for the quality gates. Plain Node (>=20), no extra dependencies.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function loadConfig() {
  return JSON.parse(
    readFileSync(join(ROOT, 'quality', 'quality.config.json'), 'utf8'),
  );
}

/** Path of a locally installed CLI (node_modules/.bin). */
export function bin(name) {
  const p = join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? `${name}.cmd` : name,
  );
  if (!existsSync(p))
    throw new Error(
      `Missing tool "${name}". Run your package manager's install first.`,
    );
  return p;
}

/**
 * Quote one word for cmd.exe. On Windows the command runs through the shell
 * (a .cmd shim cannot be spawned without it), which splits an unquoted
 * "C:\Program Files\nodejs\node.exe" in two. (cmd still expands %VAR%.)
 */
function quoteForCmd(word) {
  return `"${String(word).replace(/"/g, '""')}"`;
}

/** Run a command, capture output, never throw. `opts.env` adds to the environment. */
export function run(cmd, args, opts = {}) {
  const { env, ...rest } = opts;
  const started = Date.now();
  const shell = process.platform === 'win32';
  // Through the shell, one quoted command line: Node would join an args array
  // unquoted (and warns, DEP0190).
  const r = spawnSync(
    shell ? [cmd, ...args].map(quoteForCmd).join(' ') : cmd,
    shell ? [] : args,
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
        CI: process.env.CI ?? 'true',
        ...env,
      },
      shell,
      ...rest,
    },
  );
  return {
    code: r.status ?? 1,
    out: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`,
    ms: Date.now() - started,
  };
}

/** Minimal glob -> RegExp (supports **, *, ?, {a,b}). Paths use forward slashes. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          re += '(?:.*/)?';
        } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += `(?:${glob
        .slice(i + 1, end)
        .split(',')
        .map(escapeRe)
        .join('|')})`;
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp(`^${re}$`);
}

function escapeRe(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

export function matchesAny(relPath, globs) {
  const p = relPath.split(sep).join('/');
  return globs.some((g) => globToRegExp(g).test(p));
}

export function toRel(p) {
  return relative(ROOT, resolve(ROOT, p)).split(sep).join('/');
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'reports',
  '.stryker-tmp',
  '.next',
]);
// Claude Code's agent worktrees: full copies of the repository.
const SKIP_PATHS = new Set(['.claude/worktrees']);

/** Walk the project and return relative paths matching any glob. */
export function listFiles(globs, dir = ROOT, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP_DIRS.has(name) || SKIP_PATHS.has(toRel(full))) continue;
    const st = statSync(full);
    if (st.isDirectory()) listFiles(globs, full, acc);
    else if (matchesAny(toRel(full), globs)) acc.push(toRel(full));
  }
  return acc;
}

export function isGitRepo() {
  return run('git', ['rev-parse', '--is-inside-work-tree']).code === 0;
}

/** Uncommitted source files (modified, staged or untracked) relative to HEAD. */
export function changedFiles(globs) {
  if (!isGitRepo()) return listFiles(globs);
  const tracked = run('git', ['diff', '--name-only', 'HEAD']).out.split('\n');
  const untracked = run('git', [
    'ls-files',
    '--others',
    '--exclude-standard',
  ]).out.split('\n');
  return [...new Set([...tracked, ...untracked])]
    .map((s) => s.trim())
    .filter((f) => f && existsSync(join(ROOT, f)) && matchesAny(f, globs));
}

/** Source files changed on this branch compared to the base branch (for CI on pull requests). */
export function branchChangedFiles(globs, base) {
  const r = run('git', ['diff', '--name-only', `${base}...HEAD`]);
  if (r.code !== 0) return null;
  return r.out
    .split('\n')
    .map((s) => s.trim())
    .filter((f) => f && existsSync(join(ROOT, f)) && matchesAny(f, globs));
}

/** Keep the tail of long tool output so the agent sees the useful part. */
export function trimOutput(text, maxLines = 60) {
  const lines = text
    .trim()
    .split('\n')
    .filter((l) => l.trim() !== '');
  if (lines.length <= maxLines) return lines.join('\n');
  return [
    `... (${lines.length - maxLines} lines omitted)`,
    ...lines.slice(-maxLines),
  ].join('\n');
}
