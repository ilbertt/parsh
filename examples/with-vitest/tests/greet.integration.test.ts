import { afterEach, describe, expect, test, vi } from 'vitest';
import { makeCli } from '../src/cli.ts';

function cliAt(now: Date) {
  return makeCli({ context: { clock: () => now } });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('greet (integration)', () => {
  test('greets with the morning part-of-day', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    const code = await cliAt(new Date('2026-05-02T09:00:00Z')).run(['greet', '--name', 'parsh']);

    const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(code).toBe(0);
    expect(out).toContain('good morning, parsh');
  });

  test('--shout uppercases', async () => {
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await cliAt(new Date('2026-05-02T15:00:00Z')).run(['greet', '--name', 'parsh', '--shout']);

    const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('GOOD AFTERNOON, PARSH');
  });

  test('exits 2 when --name is missing', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const code = await cliAt(new Date('2026-05-02T09:00:00Z')).run(['greet']);
    expect(code).toBe(2);
  });
});
