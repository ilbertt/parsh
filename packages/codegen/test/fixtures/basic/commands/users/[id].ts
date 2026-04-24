import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const params = { id: z.string() };
export const args = {};

export const command = defineCommand('users [id]', {
  params,
  args,
  handler: (ctx) => {
    console.log(`user ${ctx.params.id}`);
  },
});
