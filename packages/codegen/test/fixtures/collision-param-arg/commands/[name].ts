import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('[name]', {
  params: { name: z.string() },
  args: { name: z.number() },
  handler: () => {},
});
