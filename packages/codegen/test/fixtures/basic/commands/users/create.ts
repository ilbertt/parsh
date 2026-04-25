import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users create', {
  options: { email: { schema: z.string() } },
  handler: ({ options, parents }) => {
    console.log(`create ${options.email} in ${parents.users.options.workspace}`);
  },
});
