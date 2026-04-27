import { defineCommand } from '@parshjs/core';
import { z } from 'zod';

export const command = defineCommand('s3 buckets [name]', {
  description: 'Operate on a single bucket.',
  params: { name: { schema: z.string() } },
  options: {},
});
