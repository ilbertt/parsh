import { afterEach, beforeEach, type Mock, spyOn } from 'bun:test';

type WriteFn = typeof process.stderr.write;

export type StdioSpies = {
  stderrText: () => string;
  stdoutText: () => string;
};

export function captureStdio(): StdioSpies {
  let stderrSpy: Mock<WriteFn>;
  let stdoutSpy: Mock<WriteFn>;

  beforeEach(() => {
    stderrSpy = spyOn(process.stderr, 'write').mockImplementation(() => true);
    stdoutSpy = spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    stdoutSpy.mockRestore();
  });

  return {
    stderrText: () => stderrSpy.mock.calls.flat().map(String).join('\n'),
    stdoutText: () => stdoutSpy.mock.calls.flat().map(String).join('\n'),
  };
}
