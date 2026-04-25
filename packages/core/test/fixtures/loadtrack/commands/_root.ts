import { z } from 'zod';
import { defineRootCommand } from '#index.ts';

console.log('LOADED:_root');

export const command = defineRootCommand({
  options: {
    verbose: z.boolean().optional(),
  },
});
