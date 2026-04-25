import { z } from 'zod';
import { defineCommand } from '#index.ts';

console.log('LOADED:alpha/sub');

export const command = defineCommand('alpha sub', {
  options: {
    flag: { schema: z.boolean().optional() },
  },
  handler: ({ options, parents }) => {
    console.log(`alpha-sub:${parents.alpha.options.name}:flag=${options.flag ?? false}`);
  },
});
