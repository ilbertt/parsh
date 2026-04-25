import { defineRootCommand } from '@repo/core';
import { z } from 'zod';

export const command = defineRootCommand({
  description: 'A fake AWS CLI.',
  options: {
    identity: z.string(),
    region: z.string().default('eu-west-2'),
  },
});
