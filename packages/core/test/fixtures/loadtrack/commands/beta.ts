import { z } from 'zod';
import { defineCommand } from '#index.ts';

console.log('LOADED:beta');

export const command = defineCommand('beta', {
  options: {
    n: { schema: z.number() },
  },
  handler: ({ options }) => {
    console.log(`beta:${options.n}`);
  },
});
