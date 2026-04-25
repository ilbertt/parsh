import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('tasks [id]', {
  description: 'Operate on a single task.',
  params: { id: { schema: z.string() } },
  options: {},
});
