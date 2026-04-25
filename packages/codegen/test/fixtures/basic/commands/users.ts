import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users', {
  options: { workspace: { schema: z.string(), forwardToChildren: true } },
  handler: ({ options }) => {
    console.log(`workspace=${options.workspace}`);
  },
});
