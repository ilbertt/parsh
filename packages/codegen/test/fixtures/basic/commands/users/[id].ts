import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users [id]', {
  params: { id: { schema: z.string() } },
  options: {},
  hidden: true,
  handler: ({ params }) => {
    console.log(`user ${params.id}`);
  },
});
