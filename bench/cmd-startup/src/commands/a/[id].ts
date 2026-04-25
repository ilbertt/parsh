import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('a [id]', {
  params: { id: z.string() },
  options: {},
  handler: (ctx) => {
    console.log(`a [id]: own=${ctx.params.id}`);
  },
});
