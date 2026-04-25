import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users list', {
  options: { limit: { schema: z.coerce.number() } },
  handler: ({ options, parents }) => {
    console.log(`list ${options.limit} from ${parents.users.options.workspace}`);
  },
});
