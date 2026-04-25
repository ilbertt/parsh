import { z } from 'zod';
import { defineCommand } from '#index.ts';

console.log('LOADED:alpha');

export const command = defineCommand('alpha', {
  options: {
    name: { schema: z.string(), forwardToChildren: true },
  },
  handler: ({ options }) => {
    console.log(`alpha:${options.name}`);
  },
});
