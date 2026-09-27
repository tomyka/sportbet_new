// Node.js runtime only: `instrumentation.ts` imports this module only when
// `NEXT_RUNTIME === 'nodejs'`, so the top-level code below always runs on the
// server, never in the edge runtime.

// A bad environment stops the process here, before it serves anything,
// rather than as a 500 on the first request.
if (process.env['NEXT_PHASE'] !== 'phase-production-build') {
  const [{ z }, { env }] = await Promise.all([import('zod'), import('./env')]);
  try {
    env();
  } catch (error) {
    console.error(
      'Invalid environment:\n' +
        (error instanceof z.ZodError ? z.prettifyError(error) : String(error)),
    );
    process.exit(1);
  }
}
