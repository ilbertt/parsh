import { defineCommand } from '@parsh/core';
import { z } from 'zod';

export const params = { name: z.string() };
export const args = {};

export const command = defineCommand('[name] [name]', {
  params,
  args,
  handler: () => {},
});
