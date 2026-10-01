import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  dockerContextEndpoint,
  environmentRefusal,
  isLocalEndpoint,
  runtimeRefusal,
} from './local-docker';

const CONFIG = join('C:', 'config', '.docker');
const metaOf = (name: string) =>
  join(
    CONFIG,
    'contexts',
    'meta',
    createHash('sha256').update(name).digest('hex'),
    'meta.json',
  );

/** A docker config directory holding `files`; any other path is missing. */
const files =
  (contents: Readonly<Record<string, string>>) =>
  (path: string): string => {
    const found = contents[path];
    if (found === undefined) throw new Error('ENOENT');
    return found;
  };

const withContext = (name: string, host: string) =>
  files({
    [join(CONFIG, 'config.json')]: JSON.stringify({ currentContext: name }),
    [metaOf(name)]: JSON.stringify({
      Name: name,
      Endpoints: { docker: { Host: host } },
    }),
  });

describe('a local Docker endpoint', () => {
  it.each([
    'unix:///var/run/docker.sock',
    'npipe:////./pipe/dockerDesktopLinuxEngine',
    'tcp://127.0.0.1:2375',
    'tcp://localhost:2375',
    'http://[::1]:2375',
  ])('is %s', (endpoint) => {
    expect(isLocalEndpoint(endpoint)).toBe(true);
  });

  it.each([
    'tcp://203.0.113.5:2375',
    'tcp://docker.example.invalid:2376',
    'https://10.0.0.2:2376',
    'ssh://owner@203.0.113.5',
    'not a url',
  ])('is not %s', (endpoint) => {
    expect(isLocalEndpoint(endpoint)).toBe(false);
  });
});

describe('the environment check, before any daemon is contacted', () => {
  const env = { DOCKER_CONFIG: CONFIG };

  it('accepts no DOCKER_HOST and the default context', () => {
    expect(environmentRefusal(env, files({}))).toBeNull();
  });

  it("accepts Docker Desktop's context: a named pipe", () => {
    expect(
      environmentRefusal(
        env,
        withContext(
          'desktop-linux',
          'npipe:////./pipe/dockerDesktopLinuxEngine',
        ),
      ),
    ).toBeNull();
  });

  it('refuses a remote DOCKER_HOST', () => {
    expect(
      environmentRefusal(
        { ...env, DOCKER_HOST: 'tcp://203.0.113.5:2375' },
        files({}),
      ),
    ).toBe('DOCKER_HOST points at a Docker daemon that is not on this PC');
  });

  it('refuses a Testcontainers host override that is not loopback', () => {
    expect(
      environmentRefusal(
        { ...env, TESTCONTAINERS_HOST_OVERRIDE: '203.0.113.5' },
        files({}),
      ),
    ).toBe('TESTCONTAINERS_HOST_OVERRIDE points at a host that is not this PC');
  });

  it('refuses a Testcontainers image name prefix, which would send every image to another registry', () => {
    expect(
      environmentRefusal(
        { ...env, TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX: 'registry.example/' },
        files({}),
      ),
    ).toBe(
      'TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX would fetch the images from another registry',
    );
    expect(
      environmentRefusal(
        { ...env, TESTCONTAINERS_HUB_IMAGE_NAME_PREFIX: '' },
        files({}),
      ),
    ).toBeNull();
  });

  it('refuses a current docker context on another host', () => {
    expect(
      environmentRefusal(env, withContext('office', 'ssh://owner@203.0.113.5')),
    ).toBe(
      'the docker context office points at a Docker daemon that is not on this PC',
    );
  });

  it('follows DOCKER_CONTEXT over the config, and refuses one it cannot read', () => {
    expect(
      dockerContextEndpoint(
        { ...env, DOCKER_CONTEXT: 'elsewhere' },
        withContext('desktop-linux', 'npipe:////./pipe/x'),
      ),
    ).toEqual({ name: 'elsewhere', endpoint: null });
    expect(
      environmentRefusal(
        { ...env, DOCKER_CONTEXT: 'elsewhere' },
        withContext('desktop-linux', 'npipe:////./pipe/x'),
      ),
    ).toBe(
      'the docker context elsewhere cannot be read, so it is not known to be on this PC',
    );
  });
});

describe("the check of Testcontainers' resolved runtime", () => {
  const client = (modem: unknown, host = 'localhost') => ({
    info: { containerRuntime: { host } },
    container: { dockerode: { modem } },
  });

  it('accepts a named pipe, a unix socket and loopback TCP', () => {
    expect(runtimeRefusal(client({ socketPath: '//./pipe/x' }))).toBeNull();
    expect(
      runtimeRefusal(client({ socketPath: '/var/run/docker.sock' })),
    ).toBeNull();
    expect(
      runtimeRefusal(client({ host: '127.0.0.1', protocol: 'http' })),
    ).toBeNull();
  });

  it('refuses a daemon on another host, or over ssh', () => {
    expect(
      runtimeRefusal(client({ host: '203.0.113.5', protocol: 'http' })),
    ).toBe('the container runtime Testcontainers found is not on this PC');
    expect(runtimeRefusal(client({ host: 'localhost', protocol: 'ssh' }))).toBe(
      'the container runtime Testcontainers found is not on this PC',
    );
  });

  it('refuses ports published on a host that is not loopback', () => {
    expect(
      runtimeRefusal(client({ socketPath: '//./pipe/x' }, '10.0.0.2')),
    ).toBe(
      'the container runtime publishes ports on a host that is not this PC',
    );
  });

  it('refuses a connection it cannot read', () => {
    expect(runtimeRefusal(client({}))).toBe(
      "the container runtime's connection cannot be read",
    );
  });
});
