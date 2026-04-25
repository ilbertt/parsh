import { z } from 'zod';
import { defineCommand } from '#index.ts';

console.log('LOADED:alpha');

export const command = defineCommand('alpha', {
  options: {
    name: z.string(),
  },
  handler: (ctx) => {
    console.log(`alpha:${ctx.options.name}`);
  },
});
