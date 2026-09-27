// Runs once when the server starts. A bad environment stops the process here,
// before it serves anything, rather than as a 500 on the first request.
export async function register(): Promise<void> {
  if (process.env['NEXT_RUNTIME'] !== 'nodejs') return;
  if (process.env['NEXT_PHASE'] === 'phase-production-build') return;
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
