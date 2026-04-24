import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const params = { name: z.string() };
export const args = {};

export const command = defineCommand('[name] [name]', {
  params,
  args,
  handler: () => {},
});
