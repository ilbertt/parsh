import { z } from 'zod';
import { defineCommand } from '#index.ts';

console.log('LOADED:alpha');

export const command = defineCommand('alpha', {
  options: {
    name: z.string(),
  },
  handler: ({ options }) => {
    console.log(`alpha:${options.name}`);
  },
});
