import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('d [key]', {
  params: { key: z.string() },
  options: {},
  handler: (ctx) => {
    console.log(`d [key]: own=${ctx.params.key}`);
  },
});
