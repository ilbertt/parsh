import { createCli, type OnError } from '@parshjs/core';
import { commandTree } from './commandTree.gen.ts';
import { BlankNameError } from './errors.ts';

const EXIT_BLANK_NAME = 3;

export interface AppContext {
  clock: () => Date;
}

export const errors = { BlankNameError } as const;

export const onError: OnError<typeof errors, AppContext> = ({ code, error, exit, print }) => {
  if (code === 'BlankNameError') {
    print.error(`✘ ${error.message}`);
    return exit(EXIT_BLANK_NAME);
  }
};

export function makeCli({ context, version }: { context: AppContext; version?: string }) {
  return createCli({
    programName: 'greeter',
    programDescription: 'A tiny example with vitest tests.',
    ...(version !== undefined && { version }),
    tree: commandTree,
    context,
    errors,
    onError,
  });
}
