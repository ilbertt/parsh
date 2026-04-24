import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('users [id]', {
  params: { id: z.string() },
  options: {},
  handler: (ctx) => {
    console.log(`user ${ctx.params.id}`);
  },
});
