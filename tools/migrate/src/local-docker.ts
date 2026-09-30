import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * The reader refuses any Docker daemon that is not on this PC: the dump is
 * restored into, and the players' rows loaded into, containers that must
 * never run anywhere else (spec 2.2). A daemon is local when it is reached
 * through a unix socket, a Windows named pipe, or TCP to the loopback
 * address; anything else - another host, ssh, a name that could resolve
 * anywhere - is refused.
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export const isLoopbackHost = (host: string): boolean =>
  LOOPBACK.has(host.toLowerCase());

/** Whether a Docker endpoint (`DOCKER_HOST`'s form) is on this PC. */
export function isLocalEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  switch (url.protocol) {
    case 'unix:':
    case 'npipe:':
      return true;
    case 'tcp:':
    case 'http:':
    case 'https:':
      return isLoopbackHost(url.hostname);
    default:
      return false;
  }
}

const contextConfig = z
  .object({ currentContext: z.string().optional() })
  .loose();
const contextMeta = z
  .object({
    Endpoints: z
      .object({ docker: z.object({ Host: z.string() }).loose() })
      .loose(),
  })
  .loose();

/**
 * The endpoint of the docker CLI's current context, as the CLI would pick
 * it (`DOCKER_CONTEXT`, else `currentContext` in the CLI's config): none
 * for the default context, which is `DOCKER_HOST` or the platform's own
 * socket. A context whose metadata cannot be read is reported as such,
 * never guessed local.
 */
export function dockerContextEndpoint(
  env: NodeJS.ProcessEnv,
  read: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): { readonly name: string; readonly endpoint: string | null } | null {
  const configDir = env['DOCKER_CONFIG'] ?? join(homedir(), '.docker');
  let name = env['DOCKER_CONTEXT'];
  if (name === undefined || name === '') {
    try {
      name = contextConfig.parse(
        JSON.parse(read(join(configDir, 'config.json'))),
      ).currentContext;
    } catch {
      name = undefined;
    }
  }
  if (name === undefined || name === '' || name === 'default') return null;
  const meta = join(
    configDir,
    'contexts',
    'meta',
    createHash('sha256').update(name).digest('hex'),
    'meta.json',
  );
  try {
    return {
      name,
      endpoint: contextMeta.parse(JSON.parse(read(meta))).Endpoints.docker.Host,
    };
  } catch {
    return { name, endpoint: null };
  }
}

/**
 * Why the environment points Docker off this PC, if it does: checked
 * before the reader talks to any daemon, so a remote `DOCKER_HOST` is
 * never even contacted. `DOCKER_HOST`, Testcontainers' host override and
 * the docker CLI's context are each checked; Testcontainers' own resolved
 * runtime is checked after (runtimeRefusal).
 */
export function environmentRefusal(
  env: NodeJS.ProcessEnv,
  read?: (path: string) => string,
): string | null {
  const dockerHost = env['DOCKER_HOST'];
  if (dockerHost !== undefined && dockerHost !== '') {
    if (!isLocalEndpoint(dockerHost)) {
      return 'DOCKER_HOST points at a Docker daemon that is not on this PC';
    }
  }
  const override = env['TESTCONTAINERS_HOST_OVERRIDE'];
  if (override !== undefined && override !== '' && !isLoopbackHost(override)) {
    return 'TESTCONTAINERS_HOST_OVERRIDE points at a host that is not this PC';
  }
  const context = dockerContextEndpoint(env, read);
  if (context !== null) {
    if (context.endpoint === null) {
      return `the docker context ${context.name} cannot be read, so it is not known to be on this PC`;
    }
    if (!isLocalEndpoint(context.endpoint)) {
      return `the docker context ${context.name} points at a Docker daemon that is not on this PC`;
    }
  }
  return null;
}

const modemShape = z
  .object({
    socketPath: z.unknown().optional(),
    host: z.string().optional(),
    protocol: z.string().optional(),
  })
  .loose();

/**
 * Why the daemon Testcontainers resolved is not on this PC, if it is not:
 * the connection its client (and so every container call and the restore
 * stream) goes through must be a socket, a pipe or loopback TCP, and the
 * host it publishes container ports on must be loopback.
 */
export function runtimeRefusal(client: {
  readonly info: { readonly containerRuntime: { readonly host: string } };
  readonly container: { readonly dockerode: { readonly modem: unknown } };
}): string | null {
  const modem = modemShape.safeParse(client.container.dockerode.modem);
  if (!modem.success) {
    return "the container runtime's connection cannot be read";
  }
  const { host, socketPath, protocol } = modem.data;
  if (host !== undefined && host !== '') {
    if (protocol === 'ssh' || !isLoopbackHost(host)) {
      return 'the container runtime Testcontainers found is not on this PC';
    }
  } else if (typeof socketPath !== 'string' || socketPath === '') {
    return "the container runtime's connection cannot be read";
  }
  if (!isLoopbackHost(client.info.containerRuntime.host)) {
    return 'the container runtime publishes ports on a host that is not this PC';
  }
  return null;
}
