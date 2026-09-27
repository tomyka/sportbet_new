// Runs once when the server starts, in every runtime Next loads this file
// under (nodejs and edge). Node-only code - env validation, `process.exit` -
// lives in `instrumentation-node.ts`, imported only when the runtime is
// nodejs, so bundling this file for the edge runtime never touches a Node API
// and the build has nothing to warn about.
export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] === 'nodejs')
    await import('./instrumentation-node');
}
