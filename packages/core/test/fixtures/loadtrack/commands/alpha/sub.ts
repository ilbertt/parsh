import { z } from 'zod';
import { defineCommand } from '#index.ts';

console.log('LOADED:alpha/sub');

export const command = defineCommand('alpha sub', {
  options: {
    flag: z.boolean().optional(),
  },
  handler: (ctx) => {
    console.log(`alpha-sub:${ctx.parents.alpha.options.name}:flag=${ctx.options.flag ?? false}`);
  },
});
