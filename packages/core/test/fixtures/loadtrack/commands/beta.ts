import { z } from 'zod';
import { defineCommand } from '#index.ts';

console.log('LOADED:beta');

export const command = defineCommand('beta', {
  options: {
    n: z.number(),
  },
  handler: (ctx) => {
    console.log(`beta:${ctx.options.n}`);
  },
});
