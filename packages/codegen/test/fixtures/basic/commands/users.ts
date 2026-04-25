import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users', {
  options: { workspace: z.string() },
  handler: ({ options }) => {
    console.log(`workspace=${options.workspace}`);
  },
});
