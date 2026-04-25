import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users [id] edit', {
  options: { mode: { schema: z.enum(['basic', 'full']) } },
  handler: ({ options, parents }) => {
    console.log(`edit ${parents['users [id]'].params.id} mode=${options.mode}`);
  },
});
