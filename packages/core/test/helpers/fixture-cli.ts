export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  loaded: ReadonlyArray<string>;
}

const LOADED_PREFIX = 'LOADED:';

export async function runFixtureCli({
  bin,
  args,
  env,
}: {
  bin: string;
  args: string[];
  env?: Record<string, string>;
}): Promise<RunResult> {
  const proc = Bun.spawn(['bun', bin, ...args], {
    stdout: 'pipe',
    stderr: 'pipe',
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  const loaded = stdout
    .split('\n')
    .filter((l) => l.startsWith(LOADED_PREFIX))
    .map((l) => l.slice(LOADED_PREFIX.length));
  return { exitCode, stdout, stderr, loaded };
}
