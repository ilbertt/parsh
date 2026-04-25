import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('b [name]', {
  params: { name: z.string() },
  options: {},
  handler: (ctx) => {
    console.log(`b [name]: own=${ctx.params.name}`);
  },
});
