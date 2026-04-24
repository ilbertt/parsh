import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const params = { name: z.string() };
export const args = { name: z.number() };

export const command = defineCommand('[name]', {
  params,
  args,
  handler: () => {},
});
