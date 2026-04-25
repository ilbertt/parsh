import { defineCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name] objects [key]', {
  description: 'Operate on a single object.',
  params: { key: { schema: z.string() } },
  options: {},
});
